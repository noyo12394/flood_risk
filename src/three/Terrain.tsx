import { useMemo } from 'react'
import * as THREE from 'three'
import { MAP_HALF, RIVER_Z, terrainElev } from '../game/terrain'

// A displaced ground plane sampled from terrainElev, vertex-coloured from
// muddy riverbank up to campus green, so the slope toward the river reads
// clearly (that slope is why riverside assets are the exposed ones).
export function Terrain() {
  const geometry = useMemo(() => {
    const segs = 120
    const size = MAP_HALF * 2
    const geo = new THREE.PlaneGeometry(size, size, segs, segs)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const colors: number[] = []

    const low = new THREE.Color('#5b5138') // wet bank / silt
    const mid = new THREE.Color('#5f7042') // grass
    const high = new THREE.Color('#6f8a4d') // upland green

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const y = terrainElev(x, z)
      pos.setY(i, y)

      const c = new THREE.Color()
      if (y < 0.2) c.copy(low)
      else if (y < 2.2) c.copy(low).lerp(mid, (y - 0.2) / 2.0)
      else c.copy(mid).lerp(high, Math.min(1, (y - 2.2) / 3.0))
      // A little per-vertex variation.
      const j = 0.94 + ((Math.sin(x * 3.1 + z) * 0.5 + 0.5) * 0.12)
      colors.push(c.r * j, c.g * j, c.b * j)
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}

// The permanent river channel water (always present, distinct from the flood).
export function River() {
  return (
    <mesh position={[0, -0.15, RIVER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[MAP_HALF * 2, 14]} />
      <meshStandardMaterial
        color="#1f3a54"
        roughness={0.15}
        metalness={0.4}
        transparent
        opacity={0.9}
      />
    </mesh>
  )
}
