import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { AssetResult } from '../game/model'
import type { AssetKind } from '../game/data'
import { makeFacade, type FacadeStyle } from './textures'

export const DAMAGE_COLORS: Record<string, string> = {
  safe: '#31c48d',
  minor: '#f6c945',
  moderate: '#ff9f43',
  severe: '#ff4d5e',
}

const STYLE_FOR: Record<AssetKind, FacadeStyle> = {
  classroom: 'brick',
  admin: 'brick',
  library: 'brick',
  dorm: 'glass',
  lab: 'concrete',
  hospital: 'glass',
  substation: 'utility',
}

const ROOF_COLOR: Record<FacadeStyle, string> = {
  glass: '#1b2740',
  brick: '#2a2320',
  concrete: '#3a4049',
  utility: '#2b2e33',
}

function seedOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface Props {
  result: AssetResult
  raise: number // metres the building is elevated (plinth height)
  selected: boolean
  showLabel: boolean
  onSelect: () => void
}

export function Building({ result, raise, selected, showLabel, onSelect }: Props) {
  const { asset, groundElev, state } = result
  const style = STYLE_FOR[asset.kind]

  if (asset.kind === 'substation') {
    return <Substation result={result} raise={raise} selected={selected} showLabel={showLabel} onSelect={onSelect} />
  }

  const { map, emissive, roughness } = useMemo(
    () => makeFacade(style, seedOf(asset.id), asset.floors),
    [asset.id, style, asset.floors],
  )

  // Windows go dark when the building loses power / is severely hit.
  const emissiveIntensity = state === 'severe' ? 0.05 : state === 'moderate' ? 0.5 : 1.1
  const wallTint = state === 'severe' ? '#8a94a5' : '#ffffff'

  const wallMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map,
      emissive: new THREE.Color('#ffcf87'),
      emissiveMap: emissive,
      roughnessMap: roughness,
      roughness: 0.85,
      metalness: 0.08,
      color: new THREE.Color(wallTint),
      emissiveIntensity,
    })
  }, [map, emissive, roughness, wallTint, emissiveIntensity])

  const roofMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: ROOF_COLOR[style], roughness: 0.9, metalness: 0.1 }),
    [style],
  )

  const materials = useMemo(
    () => [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat],
    [wallMat, roofMat],
  )

  const { w, d, height } = asset
  const baseY = groundElev + raise
  const ringColor = DAMAGE_COLORS[state]

  return (
    <group position={[asset.x, 0, asset.z]}>
      {/* Elevation plinth (visible when the building has been raised). */}
      {raise > 0.05 && (
        <mesh position={[0, groundElev + raise / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w + 1.2, raise, d + 1.2]} />
          <meshStandardMaterial color="#c9ccd4" roughness={0.95} />
        </mesh>
      )}

      {/* Main massing. */}
      <mesh
        position={[0, baseY + height / 2, 0]}
        material={materials}
        castShadow
        receiveShadow
        onPointerDown={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        <boxGeometry args={[w, height, d]} />
      </mesh>

      {/* Parapet + rooftop clutter for silhouette. */}
      <mesh position={[0, baseY + height + 0.25, 0]} material={roofMat} castShadow>
        <boxGeometry args={[w + 0.4, 0.5, d + 0.4]} />
      </mesh>
      <RoofDetails w={w} d={d} y={baseY + height + 0.5} seed={seedOf(asset.id)} mat={roofMat} />

      {/* Selection / damage marker on the ground. */}
      <SelectionRing radius={Math.max(w, d) * 0.75} color={ringColor} active={selected} y={groundElev + 0.06} />

      {(selected || showLabel) && (
        <Html position={[0, baseY + height + 2.4, 0]} center distanceFactor={38} zIndexRange={[10, 0]}>
          <div className={`asset-tag ${selected ? 'sel' : ''}`} style={{ borderColor: ringColor }}>
            <span className="dot" style={{ background: ringColor }} />
            {asset.name}
          </div>
        </Html>
      )}
    </group>
  )
}

function RoofDetails({ w, d, y, seed, mat }: { w: number; d: number; y: number; seed: number; mat: THREE.Material }) {
  const units = useMemo(() => {
    const r = mulberry(seed)
    const n = 2 + Math.floor(r() * 3)
    return Array.from({ length: n }, () => ({
      x: (r() - 0.5) * (w - 2),
      z: (r() - 0.5) * (d - 2),
      s: 0.6 + r() * 1.1,
      h: 0.4 + r() * 0.9,
    }))
  }, [w, d, seed])
  return (
    <group position={[0, y, 0]}>
      {units.map((u, i) => (
        <mesh key={i} position={[u.x, u.h / 2, u.z]} material={mat} castShadow>
          <boxGeometry args={[u.s, u.h, u.s]} />
        </mesh>
      ))}
    </group>
  )
}

function SelectionRing({ radius, color, active, y }: { radius: number; color: string; active: boolean; y: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    const s = active ? 1 + Math.sin(t * 3) * 0.06 : 1
    ref.current.scale.set(s, s, s)
    const mat = ref.current.material as THREE.MeshBasicMaterial
    mat.opacity = active ? 0.55 + Math.sin(t * 3) * 0.2 : 0.28
  })
  return (
    <mesh ref={ref} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.86, radius, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Substation({ result, raise, selected, showLabel, onSelect }: Props) {
  const { asset, groundElev, state } = result
  const baseY = groundElev + raise
  const ringColor = DAMAGE_COLORS[state]
  const metal = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#7d858f', roughness: 0.6, metalness: 0.7 }),
    [],
  )
  const housing = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.9, metalness: 0.2 }),
    [],
  )
  const live = state === 'safe' || state === 'minor'
  return (
    <group position={[asset.x, 0, asset.z]}>
      {raise > 0.05 && (
        <mesh position={[0, groundElev + raise / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[asset.w + 1.4, raise, asset.d + 1.4]} />
          <meshStandardMaterial color="#c9ccd4" roughness={0.95} />
        </mesh>
      )}
      {/* Fenced pad */}
      <mesh
        position={[0, baseY + 0.1, 0]}
        onPointerDown={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
        receiveShadow
      >
        <boxGeometry args={[asset.w, 0.2, asset.d]} />
        <meshStandardMaterial color="#3b3f45" roughness={1} />
      </mesh>
      {/* Transformers */}
      {[-2.4, 0, 2.4].map((x, i) => (
        <group key={i} position={[x, baseY + 0.2, 0]}>
          <mesh position={[0, 0.9, 0]} material={housing} castShadow>
            <boxGeometry args={[1.6, 1.8, 2.2]} />
          </mesh>
          <mesh position={[0, 2.1, 0]} material={metal} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.8, 8]} />
          </mesh>
        </group>
      ))}
      {/* Pylons */}
      {[-3.2, 3.2].map((x, i) => (
        <mesh key={i} position={[x, baseY + 1.8, -2.6]} material={metal} castShadow>
          <boxGeometry args={[0.2, 3.6, 0.2]} />
        </mesh>
      ))}
      {/* Live indicator */}
      <mesh position={[0, baseY + 3.4, -2.6]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial
          color={live ? '#8ff0c0' : '#ff4d5e'}
          emissive={live ? '#39d98a' : '#ff2d44'}
          emissiveIntensity={live ? 1.4 : 0.8}
        />
      </mesh>
      <SelectionRing radius={Math.max(asset.w, asset.d) * 0.7} color={ringColor} active={selected} y={groundElev + 0.06} />
      {(selected || showLabel) && (
        <Html position={[0, baseY + 4.4, 0]} center distanceFactor={38}>
          <div className={`asset-tag ${selected ? 'sel' : ''}`} style={{ borderColor: ringColor }}>
            <span className="dot" style={{ background: ringColor }} />
            {asset.name} {live ? '' : '· OFFLINE'}
          </div>
        </Html>
      )}
    </group>
  )
}

function mulberry(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
