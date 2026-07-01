import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { MAP_HALF } from '../game/terrain'

// The rising flood surface. A large translucent plane whose Y animates toward
// the target water elevation, with a gentle animated ripple in the shader-ish
// vertex wobble for life. Colour deepens with height (deeper = more menacing).
export function FloodWater({ targetElev }: { targetElev: number }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const current = useRef(-3)

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return
    // Ease the surface toward the target level.
    current.current += (targetElev - current.current) * Math.min(1, delta * 1.6)
    meshRef.current.position.y = current.current
    meshRef.current.visible = current.current > -2.2

    const depth = THREE.MathUtils.clamp((current.current + 2) / 8, 0, 1)
    const shallow = new THREE.Color('#3f9bd6')
    const deep = new THREE.Color('#1d4f7a')
    matRef.current.color.copy(shallow).lerp(deep, depth)
    matRef.current.opacity = 0.78 + depth * 0.12
    // A faint self-glow so the surface reads against the night scene.
    matRef.current.emissive.copy(shallow).lerp(deep, depth)
    matRef.current.emissiveIntensity = 0.28
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 8]} receiveShadow>
      <planeGeometry args={[MAP_HALF * 2.2, MAP_HALF * 2.2, 60, 60]} />
      <meshStandardMaterial
        ref={matRef}
        color="#3f9bd6"
        emissive="#2d6ea8"
        emissiveIntensity={0.28}
        transparent
        opacity={0.82}
        roughness={0.08}
        metalness={0.55}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
