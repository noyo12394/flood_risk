// Live-drill engine: a timed SHORT-TERM emergency-operations scenario.
//
// The drill is now purely short-term response — no capital projects (those live
// in the Decision Lab / long-term planning). During the event you have three
// emergency levers, each with a cost that scales with the storm:
//   1) Install TEMPORARY flood barriers   — lower the water reaching campus
//   2) Move the people (evacuate)          — operational cost, protects people
//   3) Deploy pumps to drain the water     — draw the water level down
// Acting late reduces or nullifies the benefit. The debrief shows a transparent
// grade book so every point is explained.
//
// The engine here is pure/stateless helpers; Drill.tsx runs the clock.

import { EMPTY_MITIGATIONS, campusWaterElevation, computeAssets, computeRoads, type AssetResult, type RoadResult } from './model'

export const DRILL_DURATION = 108 // seconds of real time for the whole event

// Emergency-operations budget (separate from capital planning).
export const EMERGENCY_BUDGET = 3_000_000

// Costs scale with the storm — a bigger event needs more barriers, more buses,
// more pumps. Multiplier applied to each action's base cost.
export const STORM_COST_MULT: Record<string, number> = {
  minor: 0.6,
  moderate: 1.0,
  major: 1.5,
  extreme: 2.0,
}

const smoothstep = (x: number) => {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// River water-surface elevation as a function of normalised drill time (0..1).
// Rises to the scenario peak at ~80% of the drill, then recedes.
export function riverElevAt(t01: number, peak: number): number {
  const start = -1.5
  const peakAt = 0.8
  if (t01 <= peakAt) return start + (peak - start) * smoothstep(t01 / peakAt)
  const recede = (t01 - peakAt) / (1 - peakAt)
  return peak - 1.3 * smoothstep(recede)
}

// Benefits earned through timely short-term decisions.
export interface DrillEffects {
  reductionMetres: number // water reduction from barriers + pumps
  evacFraction: number // 0..1 of people moved out in time
  spend: number // emergency spend
}

export function emptyEffects(): DrillEffects {
  return { reductionMetres: 0, evacFraction: 0, spend: 0 }
}

export interface DecisionOption {
  id: string
  label: string
  costed?: boolean // this option costs money (scaled by storm)
  apply: (fx: DrillEffects, campusWater: number, cost: number) => string
}

export interface Decision {
  id: string
  at: number // normalised time the card appears
  deadline: number // normalised time it auto-expires
  title: string
  situation: string
  costBase: number // base cost before the storm multiplier
  options: DecisionOption[]
}

export const DECISIONS: Decision[] = [
  {
    id: 'barriers',
    at: 0.05,
    deadline: 0.46,
    title: 'Deploy temporary flood barriers?',
    situation:
      'Portable barriers (Tiger Dams / HESCO) can lower the water reaching campus by ~0.9 m — but only if they are up before the water overtops them (~1.8 m).',
    costBase: 800_000,
    options: [
      {
        id: 'deploy',
        label: 'Install temporary barriers',
        costed: true,
        apply: (fx, w, cost) => {
          fx.spend += cost
          if (w < 1.8) {
            fx.reductionMetres += 0.9
            return 'Temporary barriers up in time — campus water cut by ~0.9 m.'
          }
          return 'Too late — the water already overtopped the barrier line. No effect.'
        },
      },
      { id: 'hold', label: 'Hold', apply: () => 'No barriers deployed.' },
    ],
  },
  {
    id: 'evacuate',
    at: 0.12,
    deadline: 0.62,
    title: 'Move the people out?',
    situation:
      'Ordering evacuation and running the buses costs money and rises with the storm — but the earlier you move people, the more get clear before routes are cut.',
    costBase: 600_000,
    options: [
      {
        id: 'move',
        label: 'Move the people (evacuate)',
        costed: true,
        apply: (fx, w, cost) => {
          fx.spend += cost
          const frac = clamp(1 - w / 4, 0.15, 0.95)
          fx.evacFraction = Math.max(fx.evacFraction, frac)
          return `Evacuation underway — ~${Math.round(frac * 100)}% of people moved out before routes were cut.`
        },
      },
      { id: 'stay', label: 'Shelter in place', apply: () => 'No evacuation ordered.' },
    ],
  },
  {
    id: 'pumps',
    at: 0.2,
    deadline: 0.72,
    title: 'Deploy pumps to drain the water?',
    situation:
      'High-capacity pumps draw the water level down. They keep up in a moderate flood but get overwhelmed in an extreme one — and earlier is better.',
    costBase: 500_000,
    options: [
      {
        id: 'pump',
        label: 'Deploy pumps',
        costed: true,
        apply: (fx, w, cost) => {
          fx.spend += cost
          const eff = w < 3.5 ? 0.5 : 0.3
          fx.reductionMetres += eff
          return `Pumps running — water level drawn down ~${eff.toFixed(1)} m.`
        },
      },
      { id: 'nopump', label: 'No pumps', apply: () => 'No pumps deployed.' },
    ],
  },
]

// Storm-scaled cost for a decision.
export function decisionCost(d: Decision, stormId: string): number {
  return Math.round(d.costBase * (STORM_COST_MULT[stormId] ?? 1))
}

// A single evaluated instant of the drill.
export interface DrillSnapshot {
  campusWater: number
  maxCampusWater: number
  assets: AssetResult[]
  roads: RoadResult[]
  totalLoss: number
  peopleAffected: number
  powerOut: boolean
  buildingsDark: number
  dryButDark: number
  routesBlocked: number
}

export function evaluate(fx: DrillEffects, riverElev: number, maxCampusWaterPrev: number): DrillSnapshot {
  const campusWater = campusWaterElevation(riverElev, fx.reductionMetres)
  const maxCampusWater = Math.max(maxCampusWaterPrev, campusWater)

  const assets = computeAssets(EMPTY_MITIGATIONS, maxCampusWater)
  const roads = computeRoads(EMPTY_MITIGATIONS, campusWater)

  let totalLoss = 0
  let peopleAffected = 0
  for (const r of assets) {
    totalLoss += r.loss
    // Moving people out reduces the human impact campus-wide.
    peopleAffected += Math.round(r.peopleAffected * (1 - fx.evacFraction))
  }
  const substation = assets.find((a) => a.asset.kind === 'substation')
  const powerOut = !!substation && !substation.functional
  const buildingsDark = assets.filter((a) => a.asset.kind !== 'substation' && !a.powered).length
  const dryButDark = assets.filter((a) => a.dryButDark).length
  const routesBlocked = roads.filter((r) => !r.passable).length

  return {
    campusWater,
    maxCampusWater,
    assets,
    roads,
    totalLoss,
    peopleAffected,
    powerOut,
    buildingsDark,
    dryButDark,
    routesBlocked,
  }
}

// ---- Scoring (transparent grade book) ---------------------------------------

export interface GradeLine {
  label: string
  earned: number // points earned
  max: number // points available
  detail: string // how it was computed
}

export interface Scorecard {
  score: number // 0..100
  grade: string
  lossAvoided: number
  finalLoss: number
  baselineLoss: number
  peopleSafe: number
  peopleAtRisk: number
  lifelinesOnline: boolean
  overBudget: number
  totalSpend: number
  gradebook: GradeLine[]
}

// Weights (points out of 100) — shown to the student in the grade book.
// Weighted toward the things you can always influence (cutting loss and moving
// people), with lifelines a smaller bonus since a big enough flood will drown
// the substation no matter what you do in a short-term response.
const W_LOSS = 40
const W_PEOPLE = 35
const W_LIFELINE = 10
const W_BUDGET = 15

export function scoreDrill(fx: DrillEffects, final: DrillSnapshot, baseline: DrillSnapshot): Scorecard {
  const finalLoss = final.totalLoss
  const baselineLoss = baseline.totalLoss
  const lossAvoided = Math.max(0, baselineLoss - finalLoss)
  const lossRatio = baselineLoss > 0 ? clamp(lossAvoided / baselineLoss, 0, 1) : 1

  const peopleAtRisk = baseline.peopleAffected
  const peopleSafe = Math.max(0, peopleAtRisk - final.peopleAffected)
  const peopleRatio = peopleAtRisk > 0 ? clamp(peopleSafe / peopleAtRisk, 0, 1) : 1

  const substation = final.assets.find((a) => a.asset.kind === 'substation')!
  const hospital = final.assets.find((a) => a.asset.kind === 'hospital')!
  const lifeCount = (substation.functional ? 1 : 0) + (hospital.functional ? 1 : 0)
  const lifelineScore = lifeCount / 2
  const lifelinesOnline = substation.functional && hospital.functional

  const totalSpend = fx.spend
  const overBudget = Math.max(0, totalSpend - EMERGENCY_BUDGET)
  const budgetScore = overBudget > 0 ? clamp(1 - overBudget / EMERGENCY_BUDGET, 0, 1) : 1

  const eLoss = Math.round(W_LOSS * lossRatio)
  const ePeople = Math.round(W_PEOPLE * peopleRatio)
  const eLife = Math.round(W_LIFELINE * lifelineScore)
  const eBudget = Math.round(W_BUDGET * budgetScore)
  const score = eLoss + ePeople + eLife + eBudget

  const grade =
    score >= 90 ? 'A' : score >= 80 ? 'B+' : score >= 70 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F'

  const gradebook: GradeLine[] = [
    {
      label: 'Loss avoided',
      earned: eLoss,
      max: W_LOSS,
      detail: `${fmt(lossAvoided)} of ${fmt(baselineLoss)} avoided → ${Math.round(lossRatio * 100)}% × ${W_LOSS} pts`,
    },
    {
      label: 'People protected',
      earned: ePeople,
      max: W_PEOPLE,
      detail: `${peopleSafe.toLocaleString()} of ${peopleAtRisk.toLocaleString()} kept safe → ${Math.round(peopleRatio * 100)}% × ${W_PEOPLE} pts`,
    },
    {
      label: 'Lifelines online',
      earned: eLife,
      max: W_LIFELINE,
      detail: `${lifeCount}/2 lifelines up (power, health center) → ${Math.round(lifelineScore * 100)}% × ${W_LIFELINE} pts`,
    },
    {
      label: 'Budget discipline',
      earned: eBudget,
      max: W_BUDGET,
      detail:
        overBudget > 0
          ? `over emergency budget by ${fmt(overBudget)} → ${Math.round(budgetScore * 100)}% × ${W_BUDGET} pts`
          : `within the ${fmt(EMERGENCY_BUDGET)} emergency budget → full ${W_BUDGET} pts`,
    },
  ]

  return {
    score,
    grade,
    lossAvoided,
    finalLoss,
    baselineLoss,
    peopleSafe,
    peopleAtRisk,
    lifelinesOnline,
    overBudget,
    totalSpend,
    gradebook,
  }
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}
