// Live-drill engine: a timed emergency-operations scenario.
//
// PREP phase  -> the student pre-commits capital mitigations within budget.
// LIVE phase  -> a clock runs, the river rises in real time, and timed decision
//                cards demand real-time calls. Acting late reduces or nullifies
//                the benefit — deploy barriers after the water has already
//                overtopped them and they do nothing.
// DEBRIEF     -> a 0–100 resilience score + letter grade.
//
// The engine here is pure/stateless helpers; Drill.tsx runs the clock.

import { ASSETS, TOTAL_BUDGET, type MitigationId } from './data'
import {
  campusWaterElevation,
  computeAssets,
  computeRoads,
  type AssetResult,
  type ExtraRaise,
  type MitigationState,
  type RoadResult,
} from './model'

export const DRILL_DURATION = 108 // seconds of real time for the whole event

// Capital mitigations available to pre-commit before the storm (barriers are a
// real-time deployment, so they are NOT in this list).
export const PREP_MITIGATIONS: MitigationId[] = [
  'improveDrainage',
  'elevateBuildings',
  'raiseSubstation',
  'elevateRoads',
]

const smoothstep = (x: number) => {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

// River water-surface elevation as a function of normalised drill time (0..1).
// Rises to the scenario peak at ~80% of the drill, then recedes.
export function riverElevAt(t01: number, peak: number): number {
  const start = -1.5
  const peakAt = 0.8
  if (t01 <= peakAt) return start + (peak - start) * smoothstep(t01 / peakAt)
  const recede = (t01 - peakAt) / (1 - peakAt)
  return peak - 1.3 * smoothstep(recede)
}

// Mutable pool of benefits the student earns through good, timely decisions.
export interface DrillEffects {
  reductionMetres: number // extra hazard reduction from barriers deployed in time
  extraRaise: ExtraRaise // e.g. sandbagged substation
  evacFraction: number // 0..1 of dorm occupants evacuated in time
  responseBonus: number // 0..1 readiness (road closed, shelter opened)
  spend: number // real-time spend on top of prep capital spend
}

export function emptyEffects(): DrillEffects {
  return { reductionMetres: 0, extraRaise: {}, evacFraction: 0, responseBonus: 0, spend: 0 }
}

export interface DecisionOption {
  id: string
  label: string
  cost?: number
  // Apply the option. `campusWater` is the water level at the moment of choice,
  // so effectiveness can depend on whether the student acted in time.
  apply: (fx: DrillEffects, campusWater: number) => string // returns a result note
}

export interface Decision {
  id: string
  at: number // normalised time the card appears
  deadline: number // normalised time it auto-expires
  title: string
  situation: string
  options: DecisionOption[]
  onlyIf?: (prep: MitigationState) => boolean
}

const SUBSTATION = ASSETS.find((a) => a.kind === 'substation')!

export const DECISIONS: Decision[] = [
  {
    id: 'barriers',
    at: 0.05,
    deadline: 0.5,
    title: 'Storm forecast issued',
    situation: 'Deployable flood barriers can lower the water reaching campus by ~0.9 m — but only if they are up before the water overtops them (~1.8 m).',
    options: [
      {
        id: 'deploy',
        label: 'Deploy barriers — $1.4M',
        cost: 1_400_000,
        apply: (fx, w) => {
          fx.spend += 1_400_000
          if (w < 1.8) {
            fx.reductionMetres += 0.9
            return 'Barriers up in time — campus water cut by 0.9 m.'
          }
          return 'Too late — water already overtopped the barrier line. No effect.'
        },
      },
      { id: 'wait', label: 'Hold — save the money', apply: () => 'No barriers deployed.' },
    ],
  },
  {
    id: 'evacuate',
    at: 0.18,
    deadline: 0.58,
    title: 'River at flood stage — evacuate?',
    situation: 'Riverside dorms are in the flood path. The earlier you order evacuation, the more students get out before routes are cut.',
    options: [
      {
        id: 'evac',
        label: 'Order evacuation now',
        apply: (fx, w) => {
          // Earlier (lower water) => higher fraction out.
          const frac = Math.max(0.15, Math.min(0.95, 1 - w / 4))
          fx.evacFraction = Math.max(fx.evacFraction, frac)
          return `Evacuation ordered — ~${Math.round(frac * 100)}% of dorm residents cleared in time.`
        },
      },
      { id: 'shelter-place', label: 'Shelter in place', apply: () => 'No evacuation ordered.' },
    ],
  },
  {
    id: 'sandbag',
    at: 0.3,
    deadline: 0.64,
    title: 'Substation threatened',
    situation: 'The power substation is un-raised and taking on water risk. Sandbag and de-energize to protect the lifeline — if you act before it floods.',
    onlyIf: (prep) => !prep.raiseSubstation,
    options: [
      {
        id: 'sandbag',
        label: 'Sandbag & de-energize — $0.3M',
        cost: 300_000,
        apply: (fx, w) => {
          fx.spend += 300_000
          // Substation threshold ≈ ground + firstFloor; if water below it, in time.
          const thr = 1.0
          if (w < thr + 0.4) {
            fx.extraRaise[SUBSTATION.id] = (fx.extraRaise[SUBSTATION.id] ?? 0) + 0.7
            return 'Substation sandbagged in time — lifeline protected.'
          }
          return 'Water already at the substation — sandbagging too late.'
        },
      },
      { id: 'leave', label: 'Leave it online', apply: () => 'Substation left unprotected.' },
    ],
  },
  {
    id: 'closeroad',
    at: 0.42,
    deadline: 0.72,
    title: 'River Road overtopping',
    situation: 'Closing River Road early keeps responders and evacuees off a flooding route and improves overall readiness.',
    options: [
      {
        id: 'close',
        label: 'Close River Road',
        apply: (fx) => {
          fx.responseBonus = Math.min(1, fx.responseBonus + 0.5)
          return 'River Road closed — safer evacuation posture.'
        },
      },
      { id: 'keep', label: 'Keep it open', apply: () => 'River Road kept open.' },
    ],
  },
  {
    id: 'shelter',
    at: 0.55,
    deadline: 0.86,
    title: 'Open an emergency shelter?',
    situation: 'Standing up a shelter on high ground protects displaced people and improves the community response.',
    options: [
      {
        id: 'open',
        label: 'Open shelter — $0.2M',
        cost: 200_000,
        apply: (fx) => {
          fx.spend += 200_000
          fx.responseBonus = Math.min(1, fx.responseBonus + 0.5)
          return 'Shelter opened on high ground.'
        },
      },
      { id: 'no', label: 'Not needed', apply: () => 'No shelter opened.' },
    ],
  },
]

// A single evaluated instant of the drill.
export interface DrillSnapshot {
  campusWater: number // current (can recede) — drives the visible water plane
  maxCampusWater: number // peak so far — drives cumulative damage
  assets: AssetResult[]
  roads: RoadResult[]
  totalLoss: number
  peopleAffected: number
  powerOut: boolean
  routesBlocked: number
}

export function evaluate(
  prep: MitigationState,
  fx: DrillEffects,
  riverElev: number,
  maxCampusWaterPrev: number,
): DrillSnapshot {
  const campusWater = campusWaterElevation(riverElev, hazardReduction(prep) + fx.reductionMetres)
  const maxCampusWater = Math.max(maxCampusWaterPrev, campusWater)

  const assets = computeAssets(prep, maxCampusWater, fx.extraRaise)
  const roads = computeRoads(prep, campusWater)

  let totalLoss = 0
  let peopleAffected = 0
  for (const r of assets) {
    totalLoss += r.loss
    // Evacuation reduces the people impact of the riverside dorms.
    const isDorm = r.asset.kind === 'dorm'
    const mult = isDorm ? 1 - fx.evacFraction : 1
    peopleAffected += Math.round(r.peopleAffected * mult)
  }
  const substation = assets.find((a) => a.asset.kind === 'substation')
  const powerOut = !!substation && !substation.functional
  const routesBlocked = roads.filter((r) => !r.passable).length

  return { campusWater, maxCampusWater, assets, roads, totalLoss, peopleAffected, powerOut, routesBlocked }
}

function hazardReduction(m: MitigationState): number {
  return (m.improveDrainage ? 0.6 : 0) // building/road/substation raises are thresholds, not water
}

// ---- Scoring ----------------------------------------------------------------

export interface Scorecard {
  score: number // 0..100
  grade: string
  lossAvoided: number
  finalLoss: number
  baselineLoss: number
  peopleSafe: number
  peopleAtRisk: number
  lifelinesOnline: boolean
  overBudget: number // >0 means over
  totalSpend: number
  lines: { label: string; ok: boolean; detail: string }[]
}

export function scoreDrill(
  fx: DrillEffects,
  prepSpend: number,
  final: DrillSnapshot,
  baseline: DrillSnapshot,
): Scorecard {
  const finalLoss = final.totalLoss
  const baselineLoss = baseline.totalLoss
  const lossAvoided = Math.max(0, baselineLoss - finalLoss)
  const lossRatio = baselineLoss > 0 ? lossAvoided / baselineLoss : 1

  const peopleAtRisk = baseline.peopleAffected
  const peopleSafe = Math.max(0, peopleAtRisk - final.peopleAffected)
  const peopleRatio = peopleAtRisk > 0 ? peopleSafe / peopleAtRisk : 1

  const substation = final.assets.find((a) => a.asset.kind === 'substation')!
  const hospital = final.assets.find((a) => a.asset.kind === 'hospital')!
  const lifelineScore = ((substation.functional ? 1 : 0) + (hospital.functional ? 1 : 0)) / 2
  const lifelinesOnline = substation.functional && hospital.functional

  const totalSpend = prepSpend + fx.spend
  const overBudget = Math.max(0, totalSpend - TOTAL_BUDGET)
  const budgetScore = overBudget > 0 ? Math.max(0, 1 - overBudget / TOTAL_BUDGET) : 1

  const readinessScore = Math.min(1, 0.5 + fx.responseBonus * 0.5)

  const score = Math.round(
    100 *
      (0.4 * lossRatio + 0.25 * peopleRatio + 0.2 * lifelineScore + 0.08 * budgetScore + 0.07 * readinessScore),
  )

  const grade =
    score >= 90 ? 'A' : score >= 80 ? 'B+' : score >= 70 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F'

  const lines = [
    { label: 'Loss avoided', ok: lossRatio > 0.4, detail: fmt(lossAvoided) + ` of ${fmt(baselineLoss)}` },
    { label: 'People protected', ok: peopleRatio > 0.5, detail: `${peopleSafe.toLocaleString()} of ${peopleAtRisk.toLocaleString()}` },
    { label: 'Power lifeline', ok: substation.functional, detail: substation.functional ? 'online' : 'OUT' },
    { label: 'Health center', ok: hospital.functional, detail: hospital.functional ? 'operational' : 'down' },
    { label: 'Budget', ok: overBudget === 0, detail: overBudget === 0 ? 'within budget' : `over by ${fmt(overBudget)}` },
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
    lines,
  }
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n)}`
}
