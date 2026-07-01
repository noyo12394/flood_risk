// Campus assets, flood scenarios, mitigations and fragility data.
// Values are made-up-but-reasonable for a teaching MVP (see README).

import { terrainElev } from './terrain'

export type AssetKind =
  | 'classroom'
  | 'dorm'
  | 'hospital'
  | 'library'
  | 'lab'
  | 'admin'
  | 'substation'

export interface Asset {
  id: string
  name: string
  kind: AssetKind
  // World footprint centre (x, z) and size (width, depth) in metres.
  x: number
  z: number
  w: number
  d: number
  height: number // building height in metres
  floors: number
  value: number // replacement value, USD
  occupants: number // people or beds served
  // Height of the lowest vulnerable opening above local ground, in metres.
  firstFloorHeight: number
  // Depth (m of water above the threshold) at which damage ratio ~= 1.0.
  fullDamageDepth: number
  critical?: boolean // life-safety / lifeline asset
}

export interface FloodScenario {
  id: 'minor' | 'moderate' | 'major' | 'extreme'
  label: string
  // Annual exceedance probability (used for expected-loss framing).
  annualProbability: number
  returnPeriod: number
  // Peak river water-surface elevation, metres above datum.
  peakElevation: number
  blurb: string
}

export type MitigationId =
  | 'floodGates'
  | 'improveDrainage'
  | 'elevateBuildings'
  | 'raiseSubstation'
  | 'elevateRoads'

export interface Mitigation {
  id: MitigationId
  label: string
  short: string
  cost: number
  role: RoleId
  description: string
}

export type RoleId = 'manager' | 'engineer' | 'budget' | 'analyst'

export interface Role {
  id: RoleId
  name: string
  tagline: string
  color: string
  focus: string
}

// ---------------------------------------------------------------------------
// Campus layout — a stylised Lehigh-like riverside campus.
// Assets near the river (low ground) are deliberately more exposed so students
// can see that "big flood" is not the whole story.
// ---------------------------------------------------------------------------

function place(a: Omit<Asset, 'firstFloorHeight' | 'fullDamageDepth'> & Partial<Asset>): Asset {
  return {
    firstFloorHeight: 0.4,
    fullDamageDepth: 3.5,
    ...a,
  }
}

export const ASSETS: Asset[] = [
  place({ id: 'substation', name: 'Power Substation', kind: 'substation', x: -6, z: 28, w: 9, d: 7, height: 4, floors: 1, value: 4_200_000, occupants: 5200, firstFloorHeight: 0.9, fullDamageDepth: 1.6, critical: true }),
  place({ id: 'library', name: 'Linderman Library', kind: 'library', x: 12, z: 26, w: 12, d: 10, height: 15, floors: 4, value: 6_800_000, occupants: 900 }),
  place({ id: 'dorm-a', name: 'Riverside Dorm A', kind: 'dorm', x: -18, z: 22, w: 10, d: 9, height: 20, floors: 6, value: 5_400_000, occupants: 320 }),
  place({ id: 'classroom-1', name: 'Packard Classroom Hall', kind: 'classroom', x: 2, z: 19, w: 14, d: 9, height: 13, floors: 3, value: 3_900_000, occupants: 640 }),
  place({ id: 'lab', name: 'Fluids & Hazards Lab', kind: 'lab', x: 20, z: 16, w: 11, d: 8, height: 10, floors: 2, value: 4_600_000, occupants: 140, fullDamageDepth: 2.4 }),
  place({ id: 'dorm-b', name: 'Hillside Dorm B', kind: 'dorm', x: -20, z: 8, w: 10, d: 9, height: 23, floors: 7, value: 5_900_000, occupants: 360 }),
  place({ id: 'admin', name: 'Administration', kind: 'admin', x: 6, z: 6, w: 13, d: 10, height: 12, floors: 3, value: 4_100_000, occupants: 210 }),
  place({ id: 'hospital', name: 'Campus Health Center', kind: 'hospital', x: 22, z: 2, w: 14, d: 11, height: 16, floors: 4, value: 9_200_000, occupants: 120, critical: true, fullDamageDepth: 3.0 }),
]

// Roads as poly-lines (list of [x, z] waypoints) with a threshold elevation
// derived from the terrain they sit on.
export interface Road {
  id: string
  name: string
  points: [number, number][]
  width: number
}

export const ROADS: Road[] = [
  { id: 'river-rd', name: 'River Road', points: [[-42, 31], [-10, 30], [16, 30], [40, 30.5]], width: 4.5 },
  { id: 'campus-dr', name: 'Campus Drive', points: [[-30, 24], [-16, 18], [0, 14], [18, 12], [34, 8]], width: 4 },
  { id: 'hill-st', name: 'Hillcrest Street', points: [[-24, 6], [-8, 5], [8, 4], [26, 3]], width: 3.5 },
  { id: 'connector', name: 'Quad Connector', points: [[2, 30], [2, 19], [6, 6]], width: 3 },
]

// ---------------------------------------------------------------------------
// Power network — the FloodRiskBTP "system-of-systems" piece.
// Grid intake (offsite source) -> on-campus substation -> feeder lines to each
// building. If the substation floods, or a feeder line crosses deep water, the
// buildings DOWNSTREAM lose power even when they are perfectly dry.
// ---------------------------------------------------------------------------

export interface PowerNode {
  id: string
  name: string
  x: number
  z: number
}

export interface PowerLine {
  id: string
  from: [number, number]
  to: [number, number]
  serves?: string // asset id this feeder powers (undefined for the trunk)
  trunk?: boolean
}

// Offsite grid intake / generating source, sitting on high ground across the
// river (stand-in for the repo's Calvert Cliffs / H. A. Wagner feeds).
export const POWER_SOURCE: PowerNode = { id: 'grid', name: 'Regional Grid Intake', x: -40, z: 44 }

export function buildPowerLines(): PowerLine[] {
  const sub = ASSETS.find((a) => a.kind === 'substation')!
  const lines: PowerLine[] = [
    { id: 'trunk', from: [POWER_SOURCE.x, POWER_SOURCE.z], to: [sub.x, sub.z], trunk: true },
  ]
  for (const a of ASSETS) {
    if (a.kind === 'substation') continue
    lines.push({ id: `feed-${a.id}`, from: [sub.x, sub.z], to: [a.x, a.z], serves: a.id })
  }
  return lines
}

export const POWER_LINES: PowerLine[] = buildPowerLines()

// ---------------------------------------------------------------------------

export const SCENARIOS: FloodScenario[] = [
  { id: 'minor', label: 'Minor', annualProbability: 0.1, returnPeriod: 10, peakElevation: 1.6, blurb: '10-year storm. Nuisance flooding along the riverbank.' },
  { id: 'moderate', label: 'Moderate', annualProbability: 0.02, returnPeriod: 50, peakElevation: 3.0, blurb: '50-year storm. Low-lying campus edge inundated.' },
  { id: 'major', label: 'Major', annualProbability: 0.01, returnPeriod: 100, peakElevation: 4.4, blurb: '100-year flood. Widespread ground-floor damage likely.' },
  { id: 'extreme', label: 'Extreme', annualProbability: 0.002, returnPeriod: 500, peakElevation: 5.8, blurb: '500-year event. Catastrophic multi-asset loss.' },
]

export const MITIGATIONS: Mitigation[] = [
  { id: 'floodGates', label: 'Deployable Flood Barriers', short: 'Flood barriers', cost: 1_400_000, role: 'engineer', description: 'A temporary/permanent barrier line lowers the water reaching campus by ~0.9 m.' },
  { id: 'improveDrainage', label: 'Upgrade Storm Drainage', short: 'Drainage', cost: 900_000, role: 'engineer', description: 'Bigger culverts and pumps shave ~0.6 m off local flood depths.' },
  { id: 'elevateBuildings', label: 'Elevate / Wet-Floodproof Buildings', short: 'Elevate buildings', cost: 2_100_000, role: 'engineer', description: 'Raises first-floor thresholds by ~1.2 m across campus buildings.' },
  { id: 'raiseSubstation', label: 'Raise the Power Substation', short: 'Raise substation', cost: 650_000, role: 'engineer', description: 'Puts critical electrical gear on a +1.8 m plinth, protecting the lifeline.' },
  { id: 'elevateRoads', label: 'Elevate Evacuation Roads', short: 'Elevate roads', cost: 1_150_000, role: 'manager', description: 'Raises key routes ~0.8 m so evacuation stays possible for longer.' },
]

export const ROLES: Role[] = [
  { id: 'manager', name: 'Emergency Manager', tagline: 'Keep people safe & moving', color: '#ff7a45', focus: 'Evacuation routes, life-safety, downtime.' },
  { id: 'engineer', name: 'Infrastructure Engineer', tagline: 'Harden the physical campus', color: '#31c48d', focus: 'Barriers, drainage, elevation, retrofits.' },
  { id: 'budget', name: 'Budget Officer', tagline: 'Spend wisely, avoid ruin', color: '#f6c945', focus: 'Mitigation vs. damage vs. remaining budget.' },
  { id: 'analyst', name: 'Risk / Insurance Analyst', tagline: 'Price the tail risk', color: '#6c9bff', focus: 'Expected loss, probability, premium, payout.' },
]

export const TOTAL_BUDGET = 6_000_000

// Local ground elevation under an asset's footprint centre.
export function assetGroundElev(a: Asset): number {
  return terrainElev(a.x, a.z)
}
