import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars, SoftShadows } from '@react-three/drei'
import * as THREE from 'three'
import { Terrain, River } from './Terrain'
import { FloodWater } from './Water'
import { Roads } from './Roads'
import { PowerLines } from './PowerLines'
import { Building } from './Building'
import type { AssetResult, RoadResult, MitigationState } from '../game/model'

interface Props {
  assets: AssetResult[]
  roads: RoadResult[]
  waterElev: number
  mitigations: MitigationState
  selectedId: string | null
  showAllLabels: boolean
  ringOverride?: Record<string, string>
  onSelect: (id: string | null) => void
}

export function Scene({ assets, roads, waterElev, mitigations, selectedId, showAllLabels, ringOverride, onSelect }: Props) {
  const roadRaise = mitigations.elevateRoads ? 0.8 : 0

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [52, 46, 78], fov: 42, near: 0.1, far: 400 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#070b16']} />
      <fog attach="fog" args={['#0a1120', 70, 190]} />
      <SoftShadows size={24} samples={10} focus={0.7} />

      {/* Moonlit night lighting. */}
      <hemisphereLight args={['#26406b', '#0a0d12', 0.7]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[38, 60, 20]}
        intensity={1.35}
        color="#cddcff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-bias={-0.0004}
      />
      {/* Warm fill from campus so the far side isn't pure black. */}
      <pointLight position={[-10, 14, 4]} intensity={40} distance={60} color="#ffb066" />

      <Stars radius={220} depth={60} count={2600} factor={4} saturation={0} fade speed={0.6} />

      <Terrain />
      <River />
      <Roads results={roads} raise={roadRaise} />
      <PowerLines assets={assets} />

      {assets.map((r) => {
        const raise =
          r.asset.kind === 'substation'
            ? mitigations.raiseSubstation
              ? 1.8
              : 0
            : mitigations.elevateBuildings
              ? 1.2
              : 0
        return (
          <Building
            key={r.asset.id}
            result={r}
            raise={raise}
            selected={selectedId === r.asset.id}
            showLabel={showAllLabels}
            ringColor={ringOverride?.[r.asset.id]}
            onSelect={() => onSelect(r.asset.id)}
          />
        )
      })}

      <FloodWater targetElev={waterElev} />

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        minDistance={18}
        maxDistance={130}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 1, 20]}
      />
    </Canvas>
  )
}
