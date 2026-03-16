import * as THREE from 'three'

// WHY system-ui font stack: gives Segoe UI on Windows, SF Pro on macOS,
// Roboto on Android — all semibold, all antialiased. Far crisper than the
// embedded monospace typeface that three-globe's built-in label layer uses.
const FONT = '600 20px system-ui, -apple-system, "Segoe UI", Arial, sans-serif'
const HALO_PAD = 6    // px of white halo padding on each side of the text
const H = 40          // canvas height: 20px text + 10px top margin + 10px bottom

// One GPU texture per country label, shared across all frames.
// WHY module-level Map: survives React re-renders; no useState overhead;
// dispose() called explicitly on unmount via disposeLabelTextureCache().
const _labelTexCache = new Map()  // Map<labelId, THREE.CanvasTexture>

/**
 * Returns a THREE.Sprite for the given label, using a cached canvas texture.
 * The canvas pipeline:
 *   1. Measure text width → size canvas exactly (no wasted pixels)
 *   2. strokeText() with white 4px lineWidth → white halo rendered FIRST
 *   3. fillText() with near-black → covers inner stroke, only outer halo visible
 *
 * This is the same technique used by Mapbox GL JS and Google Maps for
 * crisp, readable labels over satellite imagery.
 */
export function createLabelSprite(label) {
  if (!_labelTexCache.has(label.id)) {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    ctx.font = FONT
    const tw = ctx.measureText(label.name).width
    // Canvas is 2× the display pixel size for Retina/HiDPI crispness.
    // sprite.scale compensates by halving the rendered screen size.
    canvas.width  = Math.ceil(tw + HALO_PAD * 2)
    canvas.height = H

    // White halo — MUST be drawn before the fill so the black text covers
    // the inner edge of the stroke, leaving only the outer glow visible.
    ctx.font        = FONT   // re-set after canvas resize (browsers reset ctx)
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth   = 4
    ctx.lineJoin    = 'round'   // round joins prevent sharp spikes on diagonal strokes
    ctx.strokeText(label.name, HALO_PAD, 28)

    // Black text fill drawn ON TOP of the stroke
    ctx.fillStyle = 'rgba(0,0,0,0.92)'
    ctx.fillText(label.name, HALO_PAD, 28)

    _labelTexCache.set(label.id, new THREE.CanvasTexture(canvas))
  }

  const tex = _labelTexCache.get(label.id)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map:         tex,
      transparent: true,
      depthWrite:  false,  // labels don't occlude each other or the globe surface
      opacity:     1.0,    // caller overrides this via _labelSprites map
      // sizeAttenuation: true (default) — scale is in THREE.js world units.
      // At globe altitude 2.5 (camera ~350 units out), scale.x ≈ 66 ≈ 100 px.
      // Labels naturally shrink as you zoom out, matching Google Earth behaviour.
      // NOTE: sizeAttenuation:false looks like "pixel units" but is NOT — in
      // THREE.js's sprite shader scale.x=1 ≈ half the viewport width, so
      // scale(66,20) → 63 000 px wide sprite that is entirely NDC-clipped (invisible).
    })
  )

  // WHY divide by 2: canvas was rendered at 2× for HiDPI, so display at half
  // canvas pixel dimensions to get the correct physical screen size in world units.
  sprite.scale.set(tex.image.width / 2, H / 2, 1)
  return sprite
}

/**
 * Call this on component unmount to free GPU texture memory.
 * Each CanvasTexture uploads to the GPU once; without disposal it leaks VRAM.
 */
export function disposeLabelTextureCache() {
  _labelTexCache.forEach(tex => tex.dispose())
  _labelTexCache.clear()
}
