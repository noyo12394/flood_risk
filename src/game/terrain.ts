// Shared terrain + coordinate helpers.
// World units are meters. Y = elevation (meters above the river datum).
// The river runs east–west near RIVER_Z; ground rises as you move "uphill"
// (toward smaller z). Keeping the terrain function here means the 3D mesh and
// the risk model agree on exactly how high the ground is under every asset.

export const RIVER_Z = 34 // centre line of the river channel (world z)
export const MAP_HALF = 46 // half-extent of the playable map in world units

// Smooth pseudo-noise so the ground looks natural but stays deterministic.
function ripple(x: number, z: number): number {
  return (
    0.22 * Math.sin(x * 0.14 + 1.3) +
    0.18 * Math.cos(z * 0.17 - 0.6) +
    0.12 * Math.sin((x + z) * 0.09 + 2.1)
  )
}

// Ground elevation (metres) at a world (x, z).
export function terrainElev(x: number, z: number): number {
  const fromRiver = Math.max(0, RIVER_Z - z)
  const slope = 0.4 + 0.145 * fromRiver
  // Carve the river channel down below the datum.
  const channel = Math.max(0, 3.2 - Math.abs(z - RIVER_Z) * 0.5)
  const base = slope - channel + ripple(x, z)
  return Math.max(-2.4, base)
}
