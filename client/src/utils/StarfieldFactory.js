import * as THREE from 'three'

/**
 * Creates a Three.js Points object with `count` stars on a sphere of `radius`.
 *
 * WHY sphere not random 3D box: Stars on a fixed-radius sphere stay at a
 * constant angular distance from the camera regardless of zoom, matching
 * real sky behavior.
 *
 * WHY sizeAttenuation:false: Stars must stay the same pixel size regardless
 * of camera distance — growing/shrinking would look wrong.
 */
export function createStarfield(radius = 1200, count = 2000) {
  const positions = new Float32Array(count * 3)
  const colors    = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    // Uniform sphere sampling (not polar — avoids pole clustering)
    const u      = Math.random()
    const v      = Math.random()
    const theta  = 2 * Math.PI * u
    const phi    = Math.acos(1 - 2 * v)
    const sinPhi = Math.sin(phi)

    positions[i * 3]     = radius * sinPhi * Math.cos(theta)
    positions[i * 3 + 1] = radius * sinPhi * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi)

    // ~85% blue-white (O/B/A-type), ~15% warm yellow-white (F/G-type)
    const brightness = 0.6 + Math.random() * 0.4
    const warm = Math.random() > 0.85
    colors[i * 3]     = brightness * (warm ? 1.0  : 0.88)
    colors[i * 3 + 1] = brightness * (warm ? 0.92 : 0.92)
    colors[i * 3 + 2] = brightness * (warm ? 0.72 : 1.0)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color',    new THREE.BufferAttribute(colors,    3))

  const material = new THREE.PointsMaterial({
    size:            0.8,
    sizeAttenuation: false,
    vertexColors:    true,
    transparent:     true,
    opacity:         0.9,
    depthWrite:      false,
  })

  return new THREE.Points(geometry, material)
}

export function disposeStarfield(starfield) {
  if (!starfield) return
  starfield.geometry.dispose()
  starfield.material.dispose()
}
