// Procedural facade textures.
//
// Realistic-looking buildings without any downloaded assets: we draw a facade
// onto a <canvas> (base wall + a grid of windows with mullions, some lit) and
// return matching colour + emissive + roughness maps. A per-building seed makes
// each tower unique, and lit windows at night sell the "operations lab" mood.

import * as THREE from 'three'

export type FacadeStyle = 'glass' | 'brick' | 'concrete' | 'utility'

interface FacadeSpec {
  wall: string
  wall2: string
  frame: string
  glass: string
  glassDark: string
  litColor: string
  cols: number
  rows: number
  litChance: number
}

const STYLES: Record<FacadeStyle, FacadeSpec> = {
  glass: {
    wall: '#2a3550', wall2: '#324066', frame: '#0e1626',
    glass: '#4a6ea8', glassDark: '#1d2b46', litColor: '#ffd98a',
    cols: 10, rows: 16, litChance: 0.34,
  },
  brick: {
    wall: '#6d3f34', wall2: '#7a4a3c', frame: '#e7dccb',
    glass: '#26364f', glassDark: '#101a2a', litColor: '#ffe1a0',
    cols: 7, rows: 9, litChance: 0.42,
  },
  concrete: {
    wall: '#5b6270', wall2: '#666e7d', frame: '#3a4049',
    glass: '#2b3a54', glassDark: '#131d2c', litColor: '#ffdf9c',
    cols: 8, rows: 11, litChance: 0.3,
  },
  utility: {
    wall: '#4a4f57', wall2: '#40454c', frame: '#2b2e33',
    glass: '#5a6470', glassDark: '#2c3138', litColor: '#8ff0c0',
    cols: 5, rows: 3, litChance: 0.15,
  },
}

// Tiny deterministic PRNG so a given seed always yields the same facade.
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface FacadeMaps {
  map: THREE.CanvasTexture
  emissive: THREE.CanvasTexture
  roughness: THREE.CanvasTexture
}

const cache = new Map<string, FacadeMaps>()

export function makeFacade(style: FacadeStyle, seed: number, floors: number): FacadeMaps {
  const key = `${style}:${seed}:${floors}`
  const cached = cache.get(key)
  if (cached) return cached

  const spec = STYLES[style]
  const rand = mulberry32(seed * 2654435761)
  const W = 256
  const H = 512

  const base = document.createElement('canvas')
  base.width = W
  base.height = H
  const c = base.getContext('2d')!

  const emis = document.createElement('canvas')
  emis.width = W
  emis.height = H
  const e = emis.getContext('2d')!

  const rough = document.createElement('canvas')
  rough.width = W
  rough.height = H
  const r = rough.getContext('2d')!

  // Wall base with subtle vertical variation.
  const grad = c.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, spec.wall2)
  grad.addColorStop(1, spec.wall)
  c.fillStyle = grad
  c.fillRect(0, 0, W, H)
  e.fillStyle = '#000000'
  e.fillRect(0, 0, W, H)
  // Roughness: walls fairly rough (light), glass smooth (dark) — filled per-cell.
  r.fillStyle = '#c8c8c8'
  r.fillRect(0, 0, W, H)

  // Speckle / grime on the wall for texture.
  for (let i = 0; i < 900; i++) {
    const x = rand() * W
    const y = rand() * H
    const a = 0.04 + rand() * 0.06
    c.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`
    c.fillRect(x, y, 1.5, 1.5)
  }

  const rows = style === 'utility' ? spec.rows : Math.max(spec.rows, floors * 2)
  const cols = spec.cols
  const marginX = W * 0.08
  const marginY = H * 0.05
  const cellW = (W - marginX * 2) / cols
  const cellH = (H - marginY * 2) / rows
  const winW = cellW * 0.62
  const winH = cellH * 0.66

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = marginX + col * cellW + (cellW - winW) / 2
      const cy = marginY + row * cellH + (cellH - winH) / 2

      // Window frame / recess.
      c.fillStyle = spec.frame
      c.fillRect(cx - 2, cy - 2, winW + 4, winH + 4)

      const lit = rand() < spec.litChance
      const glassBase = lit ? spec.litColor : rand() > 0.5 ? spec.glass : spec.glassDark

      // Glass with a soft top-down reflection gradient.
      const gg = c.createLinearGradient(cx, cy, cx, cy + winH)
      gg.addColorStop(0, shade(glassBase, lit ? 1.05 : 1.25))
      gg.addColorStop(1, shade(glassBase, lit ? 0.9 : 0.7))
      c.fillStyle = gg
      c.fillRect(cx, cy, winW, winH)

      // Mullion.
      c.strokeStyle = 'rgba(0,0,0,0.35)'
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(cx, cy + winH / 2)
      c.lineTo(cx + winW, cy + winH / 2)
      c.moveTo(cx + winW / 2, cy)
      c.lineTo(cx + winW / 2, cy + winH)
      c.stroke()

      // Emissive: lit windows glow.
      if (lit) {
        e.fillStyle = spec.litColor
        e.fillRect(cx, cy, winW, winH)
      }
      // Roughness: glass is smooth (dark value).
      r.fillStyle = '#2a2a2a'
      r.fillRect(cx - 2, cy - 2, winW + 4, winH + 4)
    }
  }

  const map = new THREE.CanvasTexture(base)
  const emissive = new THREE.CanvasTexture(emis)
  const roughness = new THREE.CanvasTexture(rough)
  for (const t of [map, emissive, roughness]) {
    t.colorSpace = t === map ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    t.anisotropy = 4
  }
  const maps = { map, emissive, roughness }
  cache.set(key, maps)
  return maps
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16)
  const rC = Math.min(255, Math.round(((n >> 16) & 255) * factor))
  const gC = Math.min(255, Math.round(((n >> 8) & 255) * factor))
  const bC = Math.min(255, Math.round((n & 255) * factor))
  return `rgb(${rC},${gC},${bC})`
}
