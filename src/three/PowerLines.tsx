import { useMemo } from 'react'
import * as THREE from 'three'
import { POWER_LINES, POWER_SOURCE } from '../game/data'
import type { AssetResult } from '../game/model'
import { terrainElev } from '../game/terrain'

// Overhead power network: grid intake -> substation (trunk) and substation ->
// each building (feeders). A line is drawn energized (cyan glow) or dead (dark
// red) so the cascading outage is legible — dead feeders explain why a dry
// building's windows have gone black.
export function PowerLines({ assets }: { assets: AssetResult[] }) {
  const substation = assets.find((a) => a.asset.kind === 'substation')
  const substationUp = !!substation && substation.powered

  return (
    <group>
      {POWER_LINES.map((line) => {
        const energized = line.trunk
          ? substationUp
          : (assets.find((a) => a.asset.id === line.serves)?.powered ?? true)
        return <Wire key={line.id} from={line.from} to={line.to} energized={energized} trunk={!!line.trunk} />
      })}
      {/* Grid intake marker */}
      <group position={[POWER_SOURCE.x, terrainElev(POWER_SOURCE.x, POWER_SOURCE.z), POWER_SOURCE.z]}>
        <mesh position={[0, 4, 0]}>
          <boxGeometry args={[1.4, 8, 1.4]} />
          <meshStandardMaterial color="#8b93a0" metalness={0.7} roughness={0.5} />
        </mesh>
        <mesh position={[0, 8, 0]}>
          <sphereGeometry args={[0.5, 12, 12]} />
          <meshStandardMaterial color="#8ff0c0" emissive="#39d98a" emissiveIntensity={1.4} />
        </mesh>
      </group>
    </group>
  )
}

function Wire({
  from,
  to,
  energized,
  trunk,
}: {
  from: [number, number]
  to: [number, number]
  energized: boolean
  trunk: boolean
}) {
  const poleH = trunk ? 8 : 6
  const wireGeo = useMemo(() => {
    const [x0, z0] = from
    const [x1, z1] = to
    const y0 = terrainElev(x0, z0) + poleH
    const y1 = terrainElev(x1, z1) + poleH
    const pts: THREE.Vector3[] = []
    const segs = 14
    const sag = Math.hypot(x1 - x0, z1 - z0) * 0.06
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const x = x0 + (x1 - x0) * t
      const z = z0 + (z1 - z0) * t
      const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag
      pts.push(new THREE.Vector3(x, y, z))
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    return new THREE.TubeGeometry(curve, segs, trunk ? 0.14 : 0.09, 5, false)
  }, [from, to, poleH, trunk])

  const color = energized ? '#57e0ff' : '#ff4d5e'
  const emissiveIntensity = energized ? 0.9 : 0.5

  const [x0, z0] = from
  const [x1, z1] = to
  const g0 = terrainElev(x0, z0)
  const g1 = terrainElev(x1, z1)

  return (
    <group>
      <mesh geometry={wireGeo}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissiveIntensity} roughness={0.4} />
      </mesh>
      {/* End poles */}
      <mesh position={[x0, g0 + poleH / 2, z0]}>
        <cylinderGeometry args={[0.18, 0.22, poleH, 6]} />
        <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.7} />
      </mesh>
      <mesh position={[x1, g1 + poleH / 2, z1]}>
        <cylinderGeometry args={[0.18, 0.22, poleH, 6]} />
        <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.7} />
      </mesh>
    </group>
  )
}
