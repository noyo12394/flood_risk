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
  ROADS,
  assetGroundElev,
  type Asset,
  type FloodScenario,
  type MitigationId,
  type Road,
} from './data'
import { terrainElev } from './terrain'

export type MitigationState = Record<MitigationId, boolean>

export const EMPTY_MITIGATIONS: MitigationState = {
  floodGates: false,
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
  powerOut: boolean
  evacuationBlocked: boolean
  // Money
  mitigationSpend: number
  expectedAnnualLoss: number // scenario loss × annual probability
  suggestedPremium: number
}

// Threshold elevation for an asset given active mitigations.
function assetThreshold(a: Asset, m: MitigationState): number {
  let raise = 0
  if (m.elevateBuildings && a.kind !== 'substation') raise += 1.2
  if (m.raiseSubstation && a.kind === 'substation') raise += 1.8
  return assetGroundElev(a) + a.firstFloorHeight + raise
}

// Campus-wide water surface elevation after hazard-reducing mitigations.
function effectiveWaterElevation(scenario: FloodScenario, m: MitigationState): number {
  let elev = scenario.peakElevation
  if (m.floodGates) elev -= 0.9
  if (m.improveDrainage) elev -= 0.6
  return elev
}

function roadThreshold(road: Road, m: MitigationState): number {
  // Mean ground elevation along the route, plus any road-raising.
  const mean = road.points.reduce((s, [x, z]) => s + terrainElev(x, z), 0) / road.points.length
  return mean + (m.elevateRoads ? 0.8 : 0) + 0.15
}

function computeAssets(m: MitigationState, waterElev: number): AssetResult[] {
  return ASSETS.map((asset) => {
    const groundElev = assetGroundElev(asset)
    const threshold = assetThreshold(asset, m)
    const floodDepth = Math.max(0, waterElev - threshold)
    const damage = damageRatio(floodDepth, asset.fullDamageDepth)
    const state = damageStateFor(damage)
    const loss = damage * asset.value
    const functional = damage < 0.6
    const downtimeDays = Math.round(damage * (asset.critical ? 90 : 45))
    const peopleAffected = Math.round(asset.occupants * Math.min(1, damage * 1.4))
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
      downtimeDays,
      functional,
    }
  })
}

function computeRoads(m: MitigationState, waterElev: number): RoadResult[] {
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
    evacuationBlocked,
    mitigationSpend: 0, // filled in by the caller (knows costs + selection)
    expectedAnnualLoss,
    suggestedPremium,
  }
}

export function formatUSD(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}
