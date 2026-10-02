// The toy CAT (catastrophe) model.
//
//        risk  =  hazard  ×  exposure  ×  vulnerability
//
// hazard        -> how deep the water gets at each asset
// exposure      -> the value / people that sit in the flooded area
// vulnerability -> how badly a given depth damages each asset (fragility)
//
// Mitigations change the water level (hazard), raise thresholds
// (vulnerability) or protect specific lifelines — never the scenario itself.
// That is the whole teaching point: a bigger flood can still mean lower risk.

import {
  ASSETS,
  POWER_LINES,
  ROADS,
  assetGroundElev,
  type Asset,
  type FloodScenario,
  type MitigationId,
  type PowerLine,
  type Road,
} from './data'
import { terrainElev } from './terrain'

export type MitigationState = Record<MitigationId, boolean>

export const EMPTY_MITIGATIONS: MitigationState = {
  floodGates: false,
  buildLevee: false,
  roomForRiver: false,
  improveDrainage: false,
  elevateBuildings: false,
  raiseSubstation: false,
  elevateRoads: false,
}

// Depth-based fragility: probability-of-damage / damage ratio as a function of
// water depth above an asset's threshold. A smooth saturating curve.
function damageRatio(depth: number, fullDamageDepth: number): number {
  if (depth <= 0) return 0
  const x = depth / fullDamageDepth
  // 1 - e^-kx gives a realistic fast-then-saturating fragility shape.
  const r = 1 - Math.exp(-2.3 * x)
  return Math.min(1, r)
}

export type DamageState = 'safe' | 'minor' | 'moderate' | 'severe'

export function damageStateFor(ratio: number): DamageState {
  if (ratio <= 0.02) return 'safe'
  if (ratio < 0.25) return 'minor'
  if (ratio < 0.6) return 'moderate'
  return 'severe'
}

export interface AssetResult {
  asset: Asset
  groundElev: number
  threshold: number // elevation water must exceed to start damaging
  waterElev: number // effective water elevation at this asset
  floodDepth: number // metres of water above threshold
  damage: number // 0..1 damage ratio
  state: DamageState
  loss: number // USD
  peopleAffected: number
  downtimeDays: number
  functional: boolean
  // Power network state (cascading):
  powered: boolean // receives grid power right now
  dryButDark: boolean // undamaged by water yet knocked offline by the network
  powerReason: 'ok' | 'flooded-substation' | 'downed-feeder' | 'damaged'
}

export interface RoadResult {
  road: Road
  floodedFraction: number // 0..1 of the route under water
  passable: boolean
}

export interface ModelResult {
  scenario: FloodScenario
  effectiveWaterElev: number // campus-wide water surface after hazard mitigations
  hazardReduction: number // metres removed by gates + drainage
  assets: AssetResult[]
  roads: RoadResult[]
  // Portfolio roll-ups
  exposedValue: number
  totalLoss: number
  avoidedLoss: number // vs. the no-mitigation baseline for this scenario
  vulnerabilityIndex: number // loss-weighted mean damage ratio, 0..1
  peopleAffected: number
  criticalDown: number
  maxDowntimeDays: number
  powerOut: boolean // the substation itself is down
  buildingsUnpowered: number // buildings with no grid power (any cause)
  dryButDark: number // undamaged buildings knocked offline by the cascade
  evacuationBlocked: boolean
  // Money
  mitigationSpend: number
  expectedAnnualLoss: number // scenario loss × annual probability
  suggestedPremium: number
}

// Extra, real-time protection (e.g. sandbagging in the live drill) that raises
// a specific asset's threshold on top of any capital mitigations.
export type ExtraRaise = Partial<Record<string, number>> // keyed by asset id

// Threshold elevation for an asset given active mitigations.
function assetThreshold(a: Asset, m: MitigationState, extra?: ExtraRaise): number {
  let raise = 0
  if (m.elevateBuildings && a.kind !== 'substation') raise += 1.2
  if (m.raiseSubstation && a.kind === 'substation') raise += 1.8
  if (extra && extra[a.id]) raise += extra[a.id]!
  return assetGroundElev(a) + a.firstFloorHeight + raise
}

// Campus-wide water surface elevation after hazard-reducing mitigations.
// Barriers only help if they are actually in place (the live drill decides this
// dynamically), so hazard reductions are expressed as a separate metre value.
export function campusWaterElevation(riverElev: number, reductionMetres: number): number {
  return riverElev - reductionMetres
}

function hazardReductionFor(m: MitigationState): number {
  return (
    (m.buildLevee ? 1.5 : 0) +
    (m.floodGates ? 0.9 : 0) +
    (m.roomForRiver ? 0.7 : 0) +
    (m.improveDrainage ? 0.6 : 0)
  )
}

function effectiveWaterElevation(scenario: FloodScenario, m: MitigationState): number {
  return campusWaterElevation(scenario.peakElevation, hazardReductionFor(m))
}

function roadThreshold(road: Road, m: MitigationState): number {
  // Mean ground elevation along the route, plus any road-raising.
  const mean = road.points.reduce((s, [x, z]) => s + terrainElev(x, z), 0) / road.points.length
  return mean + (m.elevateRoads ? 0.8 : 0) + 0.15
}

// Restoration assumptions (days), following the repo's tiered downtime idea:
// buildings ~7 / 15 / 60 days by severity; power & roads recover in ~3 days.
const POWER_RESTORE_DAYS = 3
function buildingRepairDays(damage: number): number {
  if (damage <= 0.02) return 0
  if (damage < 0.25) return 7
  if (damage < 0.6) return 15
  return 60
}

// Does a feeder line cross genuinely deep water along its MID span? We skip the
// ends (the substation end is elevated/handled separately, the building end is
// the building's own problem) so the substation stays the primary cascade point
// and raising it can actually restore downstream power.
function feederDown(line: PowerLine, waterElev: number): boolean {
  const [x0, z0] = line.from
  const [x1, z1] = line.to
  for (const t of [0.4, 0.5, 0.6]) {
    const x = x0 + (x1 - x0) * t
    const z = z0 + (z1 - z0) * t
    if (waterElev - terrainElev(x, z) > 1.8) return true
  }
  return false
}

// Optional scenario actions share the existing fragility, exposure, and cascade
// calculation. Omitted options preserve all original Drill / Comparison behavior.
export interface ModelEffects {
  damageScale?: Partial<Record<string,number>>
  backupPower?: string[]
  evacFraction?: number
  shelterCapacity?: number
  recoveryFactor?: number
}
export function computeAssets(m: MitigationState, waterElev: number, extra?: ExtraRaise, effects: ModelEffects = {}): AssetResult[] {
  // Pass 1 — direct flood damage per asset.
  const raw = ASSETS.map((asset) => {
    const groundElev = assetGroundElev(asset)
    const threshold = assetThreshold(asset, m, extra)
    const floodDepth = Math.max(0, waterElev - threshold)
    const damage = damageRatio(floodDepth, asset.fullDamageDepth) * (effects.damageScale?.[asset.id] ?? 1)
    return { asset, groundElev, threshold, floodDepth, damage }
  })

  // Pass 2 — cascading power. The substation is the campus feed; if it is
  // knocked out (or a building's own feeder floods) that building goes dark
  // even if it never saw water.
  const substation = raw.find((r) => r.asset.kind === 'substation')
  const substationUp = !!substation && substation.damage < 0.6

  const results = raw.map(({ asset, groundElev, threshold, floodDepth, damage }) => {
    const state = damageStateFor(damage)
    const loss = damage * asset.value

    let powered = true
    let powerReason: AssetResult['powerReason'] = 'ok'
    if (asset.kind === 'substation') {
      powered = substationUp
      powerReason = substationUp ? 'ok' : 'flooded-substation'
    } else if (!substationUp) {
      powered = false
      powerReason = 'flooded-substation'
    } else {
      const feeder = POWER_LINES.find((l) => l.serves === asset.id)
      if (feeder && feederDown(feeder, waterElev)) {
        powered = false
        powerReason = 'downed-feeder'
      }
    }
    if (damage >= 0.6) powerReason = 'damaged'

    if (effects.backupPower?.includes(asset.id) && damage < 0.6) { powered = true; powerReason = 'ok' }

    // A building is only truly functional if it is both undamaged enough AND
    // powered. Losing power alone takes it offline until the grid is restored.
    const functional = damage < 0.6 && powered
    const dryButDark = damage <= 0.02 && !powered && asset.kind !== 'substation'

    const repairDays = buildingRepairDays(damage)
    const downtimeDays = asset.kind === 'substation'
      ? Math.round(damage * 90) || (powered ? 0 : POWER_RESTORE_DAYS)
      : Math.max(repairDays, powered ? 0 : POWER_RESTORE_DAYS)

    // People are affected by damage OR by loss of power (no heat/light/lifts).
    const damageImpact = Math.min(1, damage * 1.4)
    const impact = powered ? damageImpact : Math.max(damageImpact, 0.5)
    const peopleAffected = Math.round(asset.occupants * impact)

    return {
      asset,
      groundElev,
      threshold,
      waterElev,
      floodDepth,
      damage,
      state,
      loss,
      peopleAffected,
      downtimeDays: Math.ceil(downtimeDays * (effects.recoveryFactor ?? 1)),
      functional,
      powered,
      dryButDark,
      powerReason,
    }
  })
  let shelterLeft = effects.shelterCapacity ?? 0
  return results.map(r => {
    if (r.asset.kind === 'substation') return r // people served are not evacuees
    const afterEvac = Math.round(r.peopleAffected * (1 - Math.min(0.95,effects.evacFraction ?? 0)))
    const sheltered = Math.min(shelterLeft,afterEvac)
    shelterLeft -= sheltered
    return {...r,peopleAffected:afterEvac-sheltered}
  })
}

export function computeRoads(m: MitigationState, waterElev: number): RoadResult[] {
  return ROADS.map((road) => {
    let flooded = 0
    for (const [x, z] of road.points) {
      const ground = terrainElev(x, z) + (m.elevateRoads ? 0.8 : 0)
      if (waterElev > ground + 0.15) flooded++
    }
    const floodedFraction = flooded / road.points.length
    void roadThreshold // threshold helper kept for clarity/extension
    return { road, floodedFraction, passable: floodedFraction < 0.5 }
  })
}

export function runModel(scenario: FloodScenario, m: MitigationState): ModelResult {
  const waterElev = effectiveWaterElevation(scenario, m)
  const baselineWater = effectiveWaterElevation(scenario, EMPTY_MITIGATIONS)
  const assets = computeAssets(m, waterElev)
  const baselineAssets = computeAssets(EMPTY_MITIGATIONS, baselineWater)
  const roads = computeRoads(m, waterElev)

  const totalLoss = assets.reduce((s, r) => s + r.loss, 0)
  const baselineLoss = baselineAssets.reduce((s, r) => s + r.loss, 0)
  const exposedValue = assets.filter((r) => r.floodDepth > 0).reduce((s, r) => s + r.asset.value, 0)
  const peopleAffected = assets.reduce((s, r) => s + r.peopleAffected, 0)

  const substation = assets.find((r) => r.asset.kind === 'substation')
  const powerOut = !!substation && !substation.functional
  const buildingsUnpowered = assets.filter((r) => r.asset.kind !== 'substation' && !r.powered).length
  const dryButDark = assets.filter((r) => r.dryButDark).length
  const evacuationBlocked = roads.filter((r) => !r.passable).length >= Math.ceil(roads.length / 2)

  const criticalDown = assets.filter((r) => r.asset.critical && !r.functional).length
  const maxDowntimeDays = assets.reduce((s, r) => Math.max(s, r.downtimeDays), 0)

  // Loss-weighted mean damage = the "vulnerability" the portfolio actually felt.
  const totalValueExposed = assets.reduce((s, r) => s + (r.floodDepth > 0 ? r.asset.value : 0), 0)
  const vulnerabilityIndex =
    totalValueExposed > 0
      ? assets.reduce((s, r) => s + (r.floodDepth > 0 ? r.damage * r.asset.value : 0), 0) / totalValueExposed
      : 0

  const expectedAnnualLoss = totalLoss * scenario.annualProbability
  // Simple actuarial premium: expected loss + a risk/expense load.
  const suggestedPremium = expectedAnnualLoss * 1.35 + 15_000

  return {
    scenario,
    effectiveWaterElev: waterElev,
    hazardReduction: Math.max(0, scenario.peakElevation - waterElev),
    assets,
    roads,
    exposedValue,
    totalLoss,
    avoidedLoss: Math.max(0, baselineLoss - totalLoss),
    vulnerabilityIndex,
    peopleAffected,
    criticalDown,
    maxDowntimeDays,
    powerOut,
    buildingsUnpowered,
    dryButDark,
    evacuationBlocked,
    mitigationSpend: 0, // filled in by the caller (knows costs + selection)
    expectedAnnualLoss,
    suggestedPremium,
  }
}

export function formatUSD(n: number): string {
  const sign = n < 0 ? '-' : ''
  n = Math.abs(n)
  if (Math.abs(n) >= 1_000_000) return `${sign}$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${sign}$${(n / 1_000).toFixed(0)}K`
  return `${sign}$${Math.round(n)}`
}
