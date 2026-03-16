import * as THREE from 'three'
import Globe from 'react-globe.gl'
import { countryLabels } from '../../data/countryLabels'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { feature } from 'topojson-client'
import { clamp, lerp } from '../../utils/mapMath'
import { createStarfield, disposeStarfield } from '../../utils/StarfieldFactory'
import { createLabelSprite, disposeLabelTextureCache } from '../../utils/LabelSpriteFactory'

// Cache Three.js loader results globally to avoid redundant GPU uploads
THREE.Cache.enabled = true

// ── Constants ─────────────────────────────────────────────────────────────────
// ESRI World Imagery — free, no API key required, CORS-enabled
// Callback signature (x, y, l) confirmed in three-slippy-map-globe README
// ESRI path format: tile/{z}/{y}/{x} → maps to tile/${l}/${y}/${x}
const ESRI_TILE_URL = (x, y, l) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${l}/${y}/${x}`

// Local copy eliminates CDN round-trip (50–200ms → <5ms from localhost)
const WORLD_TOPO_URL = '/simplified-countries.json'

// Module-level stable callbacks — reference never changes across renders,
// so react-globe.gl never triggers material updates for transparent layers
const TRANSPARENT = () => 'rgba(0,0,0,0)'

// Tracks all active label sprites so opacity can be updated in-place without
// recreating any Three.js objects. Module-level: survives re-renders cheaply.
const _labelSprites = new Map()   // Map<labelId, THREE.Sprite>

// ── Icon texture cache ────────────────────────────────────────────────────────
// Lazy-initialised once; shared by all markers of the same type.
// WHY canvas-to-texture: avoids network fetch; GPU-uploaded once then reused.
const _texCache = {}
function getResourceTexture(type) {
  if (_texCache[type]) return _texCache[type]

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  const color = type === 'oil' ? '#f59e0b' : '#34d399'

  // Glow halo — soft radial gradient for a bloom effect
  const grd = ctx.createRadialGradient(32, 32, 4, 32, 32, 28)
  grd.addColorStop(0, color + 'cc')
  grd.addColorStop(1, color + '00')
  ctx.fillStyle = grd
  ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill()

  // Core dot
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(32, 32, 8, 0, Math.PI * 2); ctx.fill()

  _texCache[type] = new THREE.CanvasTexture(canvas)
  return _texCache[type]
}

/**
 * Maps camera altitude to the maximum label rank to show.
 * Stricter thresholds than before — the canvas sprite labels are crisper so
 * we can afford to be more conservative about how many are shown at once.
 *   alt > 2.0  → only 10 global powers
 *   alt > 1.4  → + 20 regional powers (30 total)
 *   alt > 0.80 → + 52 mid-sized (82 total)
 *   alt > 0.45 → + 88 smaller (170 total)
 *   alt ≤ 0.45 → all labels
 */
function getLabelRankThreshold(altitude) {
  if (altitude > 2.0)  return 1
  if (altitude > 1.4)  return 2
  if (altitude > 0.80) return 3
  if (altitude > 0.45) return 4
  return 5
}

/**
 * Great-circle angular distance between two lat/lng points (degrees).
 * Used by the collision avoidance pass to check label proximity.
 * O(1) per call; haversine is numerically stable for small angles.
 */
function haversineDeg(a, b) {
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * Math.PI / 180) *
            Math.cos(b.lat * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2
  return 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 180 / Math.PI
}

// ── Demo resource markers (seeded at load — no fetch needed) ──────────────────
const DEMO_RESOURCE_MARKERS = [
  { id: 'sa-oil', lat: 26.10, lng:  50.20, type: 'oil', label: 'Saudi Arabia — Ghawar Oil Field' },
  { id: 'ru-gas', lat: 67.00, lng:  73.50, type: 'gas', label: 'Russia — West Siberia Gas Fields' },
  { id: 'ng-oil', lat:  5.50, lng:   6.00, type: 'oil', label: 'Nigeria — Niger Delta Oil' },
  { id: 'us-oil', lat: 29.70, lng: -92.00, type: 'oil', label: 'United States — Gulf of Mexico' },
  { id: 'qa-gas', lat: 25.90, lng:  51.50, type: 'gas', label: 'Qatar — North Field Gas' },
  { id: 'vz-oil', lat:  8.60, lng: -63.20, type: 'oil', label: 'Venezuela — Orinoco Belt' },
]

// ─────────────────────────────────────────────────────────────────────────────
function MapComponent() {
  // ── Geometry ────────────────────────────────────────────────────────────────
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [countries, setCountries]   = useState([])

  // ── Camera ──────────────────────────────────────────────────────────────────
  const [pov, setPov] = useState({ lat: 20, lng: 0, altitude: 2.5 })

  // ── Refs ────────────────────────────────────────────────────────────────────
  const globeRef      = useRef(null)
  const containerRef  = useRef(null)
  const globeReadyRef = useRef(false)
  const lastUpdateRef = useRef(0)
  const lastPovRef    = useRef({ lat: 20, lng: 0, altitude: 2.5 })
  const starfieldRef  = useRef(null)

  // ── Derived values ──────────────────────────────────────────────────────────
  // lodT: 1 = zoomed all the way out, 0 = zoomed all the way in
  const lodT           = clamp((pov.altitude - 0.20) / (2.5 - 0.20), 0, 1)
  // lodLabelSize / lodDotRadius removed — label appearance is now baked into
  // canvas sprite textures in LabelSpriteFactory; no per-frame prop updates needed.
  const lodLabelAlpha  = Math.round(lerp(0.95, 0.45, lodT) * 100) / 100
  const lodBorderAlpha = Math.round(lerp(0.80, 0.15, lodT) * 100) / 100
  const lodBorderAlt   = lerp(0.003, 0.001, lodT)
  const rankThreshold  = getLabelRankThreshold(pov.altitude)
  const visibleLabels  = countryLabels.filter(d => d.rank <= rankThreshold)

  // ── LOD callbacks ───────────────────────────────────────────────────────────
  // Memoised string instead of a new function closure — prevents Three.js
  // material updates on every React render where only the camera moved.
  const polygonStrokeColor = useMemo(
    () => `rgba(100,160,255,${lodBorderAlpha})`,
    [lodBorderAlpha]
  )

  // getLabelColor removed — label colors (white halo + black fill) are now
  // baked permanently into canvas textures in LabelSpriteFactory.

  // Ref keeps lodLabelAlpha readable synchronously inside customThreeObject,
  // which runs outside React's render cycle (called by three-globe internals).
  const lodAlphaRef = useRef(lodLabelAlpha)
  useEffect(() => { lodAlphaRef.current = lodLabelAlpha }, [lodLabelAlpha])

  // ── Collision-free label set ─────────────────────────────────────────────────
  // Greedy O(n²) angular-separation pass. visibleLabels is rank-sorted (rank 1
  // first), so higher-ranked labels win ties and are always placed first.
  // MIN_SEP scales with zoom: wide view → large separation, close view → tight.
  // 195² = 38,025 haversine comparisons ≈ <1ms per 50ms camera-throttle cycle.
  const collisionFreeLabelSet = useMemo(() => {
    const placed = []
    const MIN_SEP = Math.max(4, pov.altitude * 10)
    for (const label of visibleLabels) {
      if (!placed.some(p => haversineDeg(label, p) < MIN_SEP)) placed.push(label)
    }
    return placed
  }, [visibleLabels, pov.altitude])

  // ── Combined custom layer data ───────────────────────────────────────────────
  // Resource markers (have {type}) and labels (have {rank}) share one layer.
  // customThreeObject dispatches between them by checking 'rank' in d.
  // WHY one layer: three-globe has a single customLayerData array; merging
  // avoids two separate WebGL draw calls and simplifies the component tree.
  const allCustomLayerData = useMemo(
    () => [...DEMO_RESOURCE_MARKERS, ...collisionFreeLabelSet],
    [collisionFreeLabelSet]
  )

  const handlePolygonClick = useCallback((polygon) => {
    console.log('Country clicked:', polygon?.properties)
  }, [])

  // ── Smooth opacity fading ────────────────────────────────────────────────────
  // Mutates sprite.material.opacity directly — no object recreation, no GC.
  // Runs only when lodLabelAlpha changes (~every 50ms while camera moves).
  // WHY useEffect not useMemo: this is a side-effect on Three.js objects,
  // not a derived value, so React's rules require useEffect here.
  useEffect(() => {
    _labelSprites.forEach(sprite => {
      if (sprite?.material) sprite.material.opacity = lodLabelAlpha
    })
  }, [lodLabelAlpha])

  // ── Camera handlers ─────────────────────────────────────────────────────────
  // 50ms throttle gives 20fps React LOD updates; Three.js still renders at 60fps
  const handleCameraChange = useCallback(() => {
    const now = Date.now()
    if (now - lastUpdateRef.current < 50) return

    const newPov = globeRef.current.pointOfView()
    const prev   = lastPovRef.current
    const altDelta = Math.abs(newPov.altitude - prev.altitude)
    const latDelta = Math.abs(newPov.lat - prev.lat)
    const lngDelta = Math.abs(newPov.lng - prev.lng)
    if (altDelta < 0.005 && latDelta < 0.01 && lngDelta < 0.01) return

    lastUpdateRef.current = now
    lastPovRef.current    = newPov
    setPov(newPov)
  }, [])

  const handleCameraEnd = useCallback(() => {
    if (!globeRef.current) return
    const newPov = globeRef.current.pointOfView()
    lastPovRef.current = newPov
    setPov(newPov)
  }, [])

  // ── Globe ready ─────────────────────────────────────────────────────────────
  const handleGlobeReady = useCallback(() => {
    if (globeReadyRef.current) return
    globeReadyRef.current = true

    if (!globeRef.current) return
    const controls = globeRef.current.controls()

    controls.enablePan     = false
    controls.enableDamping = true
    // 0.06 gives longer, silkier deceleration — matches Google Earth inertia feel
    controls.dampingFactor = 0.06
    controls.minDistance   = 101
    // 500 keeps globe filling ~60% of viewport at max zoom-out — more cinematic than 700
    controls.maxDistance   = 500

    globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 0)

    // Extend far plane so the starfield sphere (radius 1200) is never clipped.
    // three-globe's default far value can be as low as 2× globe radius (~200),
    // which would silently cull any geometry placed beyond that distance.
    const cam = globeRef.current.camera()
    cam.far = 5000
    cam.updateProjectionMatrix()

    controls.addEventListener('change', handleCameraChange)
    controls.addEventListener('end',    handleCameraEnd)

    // Add stars directly to the Three.js scene (an "escape hatch" from React).
    // React doesn't know about this — we must manually manage its lifecycle.
    const stars = createStarfield(1200, 2000)
    globeRef.current.scene().add(stars)
    starfieldRef.current = stars
  }, [handleCameraChange, handleCameraEnd])

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        setDimensions({
          width:  containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    fetch(WORLD_TOPO_URL)
      .then(res => res.json())
      .then(topo => setCountries(feature(topo, topo.objects.countries).features))
      .catch(err => console.error('Failed to load world topology:', err))
  }, [])

  // Cleanup Three.js objects on unmount to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      globeReadyRef.current = false          // allow re-init on remount
      if (globeRef.current && starfieldRef.current) {
        try {
          globeRef.current.scene().remove(starfieldRef.current)
          disposeStarfield(starfieldRef.current)
          starfieldRef.current = null
          globeRef.current.globeTileEngineClearCache()
          _labelSprites.clear()
          disposeLabelTextureCache()
        } catch (_) { /* scene may already be destroyed on hot reload */ }
      }
    }
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}

        backgroundColor="#000000"
        globeTileEngineUrl={ESRI_TILE_URL}
        globeTileEngineMaxLevel={17}
        atmosphereColor="rgba(100,160,255,1)"
        atmosphereAltitude={0.25}

        polygonsData={countries}
        polygonCapColor={TRANSPARENT}
        polygonSideColor={TRANSPARENT}
        polygonStrokeColor={polygonStrokeColor}
        polygonAltitude={lodBorderAlt}
        polygonTransitionDuration={0}
        onPolygonClick={handlePolygonClick}

        customLayerData={allCustomLayerData}
        customLayerLat={d => d.lat}
        customLayerLng={d => d.lng}
        customLayerAltitude={d => 'rank' in d ? 0.02 : 0.01}
        customThreeObject={d => {
          if ('rank' in d) {
            // Label sprite — canvas texture with white halo + black semibold text.
            // WHY 0.015 altitude: slightly above resource icons (0.01) so labels
            // never z-fight with the icon glows on the globe surface.
            const sprite = createLabelSprite(d)
            sprite.material.opacity = lodAlphaRef.current
            _labelSprites.set(d.id, sprite)
            return sprite
          }
          // Resource marker sprite (oil = amber glow, gas = green glow)
          const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: getResourceTexture(d.type),
              transparent: true,
              depthWrite: false,
            })
          )
          sprite.scale.set(0.6, 0.6, 1)
          return sprite
        }}
        customThreeObjectUpdate={() => {}}

        pointsData={[]}
        pointLat={d => d.lat}
        pointLng={d => d.lng}
        pointColor={() => '#58a6ff'}
        pointAltitude={0.01}
        pointRadius={0.3}
        pointLabel={d => d.label ?? ''}

        onGlobeReady={handleGlobeReady}
        animateIn={false}
      />
    </div>
  )
}

export default MapComponent
