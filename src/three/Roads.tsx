import { useMemo } from 'react'
import * as THREE from 'three'
import { ROADS } from '../game/data'
import type { RoadResult } from '../game/model'
import { terrainElev } from '../game/terrain'

// Roads drawn as ribbon strips following the terrain. Blocked routes glow red
// so the Emergency Manager can see evacuation risk at a glance.
export function Roads({ results, raise }: { results: RoadResult[]; raise: number }) {
  return (
    <group>
      {ROADS.map((road) => {
        const res = results.find((r) => r.road.id === road.id)
        const passable = res?.passable ?? true
        return <RoadRibbon key={road.id} points={road.points} width={road.width} raise={raise} passable={passable} />
      })}
    </group>
  )
}

function RoadRibbon({
  points,
  width,
  raise,
  passable,
}: {
  points: [number, number][]
  width: number
  raise: number
  passable: boolean
}) {
  const geometry = useMemo(() => {
    const verts: number[] = []
    const idx: number[] = []
    const half = width / 2
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i]
      // Perpendicular direction from the local tangent.
      const prev = points[Math.max(0, i - 1)]
      const next = points[Math.min(points.length - 1, i + 1)]
      const tx = next[0] - prev[0]
      const tz = next[1] - prev[1]
      const len = Math.hypot(tx, tz) || 1
      const nx = -tz / len
      const nz = tx / len
      const y = terrainElev(x, z) + raise + 0.12
      verts.push(x + nx * half, y, z + nz * half)
      verts.push(x - nx * half, y, z - nz * half)
      if (i < points.length - 1) {
        const b = i * 2
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }, [points, width, raise])

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        color={passable ? '#2c2f36' : '#5e2230'}
        emissive={passable ? '#000000' : '#ff3b52'}
        emissiveIntensity={passable ? 0 : 0.5}
        roughness={0.95}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
