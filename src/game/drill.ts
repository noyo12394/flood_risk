// Live-drill engine: a timed short-term emergency response scenario.

import {
  EMPTY_MITIGATIONS,
  campusWaterElevation,
  computeAssets,
  computeRoads,
  type AssetResult,
  type ExtraRaise,
  type RoadResult,
} from './model'

export const FYRE_VERSION = '1.2'
export const DRILL_DURATION = 150
export const DRILL_DAYS = 7 // Day -5 through Day +2
export const EMERGENCY_BUDGET = 3_000_000

export const STORM_COST_MULT: Record<string, number> = {
  minor: 0.6,
  moderate: 1,
  major: 1.5,
  extreme: 2,
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}

export function riverElevAt(t01: number, peak: number): number {
  const start = -1.5
  const peakAt = 0.8
  if (t01 <= peakAt) return start + (peak - start) * smoothstep(t01 / peakAt)
  return peak - 1.3 * smoothstep((t01 - peakAt) / (1 - peakAt))
}

export interface DrillEffects {
  reductionMetres: number
  extraRaise: ExtraRaise
  evacFraction: number
  healthBackup: boolean
  spend: number
}

export function emptyEffects(): DrillEffects {
  return { reductionMetres: 0, extraRaise: {}, evacFraction: 0, healthBackup: false, spend: 0 }
}

export interface DecisionOption {
  id: string
  label: string
  shortLabel: string
  detail: string
  tradeoff: string
  costBase?: number
  durationDays: number
  futureOnly?: boolean
  apply: (fx: DrillEffects, campusWater: number) => string
}

export interface Decision {
  id: string
  at: number
  title: string
  prompt: string
  readMore: string
  options: DecisionOption[]
}

const SUBSTATION_ID = 'substation'
const HOSPITAL_ID = 'hospital'

export const DECISIONS: Decision[] = [
  {
    id: 'barriers',
    at: 0.04,
    title: 'Where should the barrier crews go?',
    prompt: 'The river is rising. Choose the size and location of your temporary barrier response.',
    readMore:
      'Portable water-filled barriers and HESCO units need trucks, crews and setup time. A stronger campus-wide line blocks more water, while targeted barriers protect only the two critical facilities.',
    options: [
      {
        id: 'basic', label: 'Basic campus barrier', shortLabel: 'Basic barrier',
        detail: 'Cuts campus water about 0.45 m. Faster and cheaper, but easier to overtop.',
        tradeoff: 'Protects the whole campus less than the reinforced line.',
        costBase: 450_000, durationDays: 1.25,
        apply: (fx, water) => {
          if (water >= 1.8) return 'The basic line finished after overtopping. It did not reduce this flood.'
          fx.reductionMetres += 0.45
          return 'Basic barriers are holding. Campus water is about 0.45 m lower.'
        },
      },
      {
        id: 'reinforced', label: 'Reinforced campus barrier', shortLabel: 'Reinforced barrier',
        detail: 'Cuts campus water about 0.9 m. Stronger protection, with more cost and setup time.',
        tradeoff: 'This is the largest barrier commitment and needs two full days.',
        costBase: 800_000, durationDays: 2,
        apply: (fx, water) => {
          if (water >= 1.8) return 'The reinforced line finished too late and was overtopped. No flood reduction.'
          fx.reductionMetres += 0.9
          return 'Reinforced barriers are holding. Campus water is about 0.9 m lower.'
        },
      },
      {
        id: 'targeted', label: 'Protect critical buildings', shortLabel: 'Targeted barriers',
        detail: 'Adds temporary protection at the power substation and health center, not the whole campus.',
        tradeoff: 'Other buildings and roads receive no direct protection.',
        costBase: 380_000, durationDays: 0.75,
        apply: (fx, water) => {
          if (water >= 2.4) return 'Crews arrived after deep flooding began. The building barriers could not be sealed.'
          fx.extraRaise[SUBSTATION_ID] = (fx.extraRaise[SUBSTATION_ID] ?? 0) + 0.9
          fx.extraRaise[HOSPITAL_ID] = (fx.extraRaise[HOSPITAL_ID] ?? 0) + 0.9
          return 'Critical-building barriers are sealed. The substation and health center gain 0.9 m of protection.'
        },
      },
      {
        id: 'hold', label: 'Save the crews and budget', shortLabel: 'No barriers',
        detail: 'Keeps the budget available, but leaves flood depth and building thresholds unchanged.',
        tradeoff: 'The campus absorbs the full flood unless later actions compensate.',
        durationDays: 0, apply: () => 'No temporary barriers were installed.',
      },
    ],
  },
  {
    id: 'evacuate',
    at: 0.2,
    title: 'How will you protect people?',
    prompt: 'Low-lying buildings may lose road access. Pick a people-protection plan.',
    readMore:
      'Evacuation takes buses, drivers, accessible transport and time. Starting earlier moves more people before roads close. Sheltering costs less but leaves occupants exposed to outages and building damage.',
    options: [
      {
        id: 'move', label: 'Start phased evacuation', shortLabel: 'Evacuate people',
        detail: 'Moves people over 1.5 days. Effectiveness depends on the water level when transport finishes.',
        tradeoff: 'Requires transport funding and does not prevent physical damage.',
        costBase: 600_000, durationDays: 1.5,
        apply: (fx, water) => {
          const fraction = clamp(1 - water / 4, 0.15, 0.95)
          fx.evacFraction = Math.max(fx.evacFraction, fraction)
          return `Evacuation finished. About ${Math.round(fraction * 100)}% of people were moved before routes closed.`
        },
      },
      {
        id: 'shelter', label: 'Shelter in place', shortLabel: 'Shelter in place',
        detail: 'No transport cost. People remain in buildings and depend on power and safe access.',
        tradeoff: 'Occupants remain exposed if power, access, or buildings fail.',
        durationDays: 0, apply: () => 'Shelter-in-place guidance was issued. No one was moved off campus.',
      },
    ],
  },
  {
    id: 'pumps',
    at: 0.38,
    title: 'Water is pooling behind the defenses',
    prompt: 'Pumps can remove local water, but their capacity is limited in a severe flood.',
    readMore:
      'High-capacity mobile pumps are useful when drainage is overwhelmed. They reduce local water after setup, but cannot stop the river itself and lose effectiveness as flood depth increases.',
    options: [
      {
        id: 'pump', label: 'Deploy high-capacity pumps', shortLabel: 'Deploy pumps',
        detail: 'Operational in half a day. Draws water down about 0.5 m, or 0.3 m in deep flooding.',
        tradeoff: 'Capacity falls in deep water and the pumps do not stop the river.',
        costBase: 500_000, durationDays: 0.5,
        apply: (fx, water) => {
          const effect = water < 3.5 ? 0.5 : 0.3
          fx.reductionMetres += effect
          return `Pumps are running. Local water is about ${effect.toFixed(1)} m lower.`
        },
      },
      {
        id: 'none', label: 'Do not deploy pumps', shortLabel: 'No pumps',
        detail: 'Preserves budget and crews. Water follows the unmitigated flood curve.',
        tradeoff: 'Local ponding and drainage overload continue unchecked.',
        durationDays: 0, apply: () => 'No pumps were deployed.',
      },
    ],
  },
  {
    id: 'lifeline',
    at: 0.55,
    title: 'The power lifeline is threatened',
    prompt: 'Choose an emergency measure, or start a permanent project that cannot finish in time.',
    readMore:
      'Sandbags can temporarily raise the substation threshold. A permanent raised plinth is more reliable, but normally takes design, permitting and months of construction. Starting it now will not protect this event.',
    options: [
      {
        id: 'sandbag', label: 'Sandbag the substation', shortLabel: 'Protect power now',
        detail: 'One-day emergency setup adds about 0.7 m of temporary flood protection.',
        tradeoff: 'It may finish too late and does not protect the health center directly.',
        costBase: 260_000, durationDays: 1,
        apply: (fx, water) => {
          if (water >= 2.2) return 'Deep water reached the substation before sandbagging finished. The lifeline remains exposed.'
          fx.extraRaise[SUBSTATION_ID] = (fx.extraRaise[SUBSTATION_ID] ?? 0) + 0.7
          return 'The substation is sandbagged with 0.7 m of added temporary protection.'
        },
      },
      {
        id: 'generator', label: 'Power the health center with generators', shortLabel: 'Health backup power',
        detail: 'Mobile generators and fuel are ready in 12 hours, keeping health services online if the grid fails.',
        tradeoff: 'Protects health services, but does not restore campus-wide power or prevent flood damage.',
        costBase: 320_000, durationDays: 0.5,
        apply: (fx) => {
          fx.healthBackup = true
          return 'Health-center generators are online with a protected fuel supply.'
        },
      },
      {
        id: 'plinth', label: 'Start a permanent raised plinth', shortLabel: 'Permanent plinth',
        detail: 'A strong long-term fix, but it takes about 90 days and will not help this flood.',
        tradeoff: 'Consumes response funds now while providing no benefit during this event.',
        costBase: 650_000, durationDays: 90, futureOnly: true,
        apply: (fx) => {
          fx.extraRaise[SUBSTATION_ID] = (fx.extraRaise[SUBSTATION_ID] ?? 0) + 1.8
          return 'The permanent plinth is complete and raises the substation 1.8 m.'
        },
      },
      {
        id: 'leave', label: 'Leave the substation unprotected', shortLabel: 'No lifeline action',
        detail: 'No immediate cost, but a flooded substation can darken otherwise dry buildings.',
        tradeoff: 'Both power and dependent health services may be lost.',
        durationDays: 0, apply: () => 'The substation was left unprotected.',
      },
    ],
  },
]

export function decisionCost(option: DecisionOption, stormId: string): number {
  if (!option.costBase) return 0
  return Math.round(option.costBase * (STORM_COST_MULT[stormId] ?? 1))
}

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
  const modelAssets = computeAssets(EMPTY_MITIGATIONS, maxCampusWater, fx.extraRaise)
  const assets = fx.healthBackup
    ? modelAssets.map((result) => {
        if (result.asset.kind !== 'hospital' || result.damage >= 0.6) return result
        const damageImpact = Math.min(1, result.damage * 1.4)
        return {
          ...result,
          powered: true,
          functional: true,
          dryButDark: false,
          powerReason: 'ok' as const,
          peopleAffected: Math.round(result.asset.occupants * damageImpact),
        }
      })
    : modelAssets
  const roads = computeRoads(EMPTY_MITIGATIONS, campusWater)
  const totalLoss = assets.reduce((sum, result) => sum + result.loss, 0)
  const peopleAffected = assets.reduce(
    (sum, result) => sum + (
      result.asset.kind === 'substation'
        ? result.peopleAffected
        : Math.round(result.peopleAffected * (1 - fx.evacFraction))
    ),
    0,
  )
  const substation = assets.find((asset) => asset.asset.kind === 'substation')
  const powerOut = !!substation && !substation.functional
  return {
    campusWater,
    maxCampusWater,
    assets,
    roads,
    totalLoss,
    peopleAffected,
    powerOut,
    buildingsDark: assets.filter((asset) => asset.asset.kind !== 'substation' && !asset.powered).length,
    dryButDark: assets.filter((asset) => asset.dryButDark).length,
    routesBlocked: roads.filter((road) => !road.passable).length,
  }
}

export interface GradeLine {
  label: string
  earned: number
  max: number
  detail: string
}

export interface Scorecard {
  score: number
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

const W_LOSS = 35
const W_PEOPLE = 30
const W_LIFELINE = 20
const W_BUDGET = 15

const RESPONSE_TARGETS: Record<string, { loss: number; people: number; lifeline: number }> = {
  minor: { loss: 1, people: 1, lifeline: 1 },
  moderate: { loss: 0.95, people: 0.95, lifeline: 1 },
  major: { loss: 0.5, people: 0.26, lifeline: 0.5 },
  extreme: { loss: 0.35, people: 0.2, lifeline: 0.5 },
}

export function scoreDrill(fx: DrillEffects, final: DrillSnapshot, baseline: DrillSnapshot, scenarioId = 'major'): Scorecard {
  const baselineLoss = baseline.totalLoss
  const lossAvoided = Math.max(0, baselineLoss - final.totalLoss)
  const lossRatio = baselineLoss > 0 ? clamp(lossAvoided / baselineLoss, 0, 1) : 1
  const peopleAtRisk = baseline.peopleAffected
  const peopleSafe = Math.max(0, peopleAtRisk - final.peopleAffected)
  const peopleRatio = peopleAtRisk > 0 ? clamp(peopleSafe / peopleAtRisk, 0, 1) : 1
  const substation = final.assets.find((asset) => asset.asset.kind === 'substation')!
  const hospital = final.assets.find((asset) => asset.asset.kind === 'hospital')!
  const lifeCount = Number(substation.functional) + Number(hospital.functional)
  const lifelineScore = lifeCount / 2
  const target = RESPONSE_TARGETS[scenarioId] ?? RESPONSE_TARGETS.major
  const lossPerformance = clamp(lossRatio / target.loss, 0, 1)
  const peoplePerformance = clamp(peopleRatio / target.people, 0, 1)
  const lifelinePerformance = clamp(lifelineScore / target.lifeline, 0, 1)
  const overBudget = Math.max(0, fx.spend - EMERGENCY_BUDGET)
  const withinBudget = overBudget === 0 ? 1 : clamp(1 - overBudget / EMERGENCY_BUDGET, 0, 1)
  const responseEffectiveness = 0.5 * lossPerformance + 0.35 * peoplePerformance + 0.15 * lifelinePerformance
  const budgetScore = fx.spend > 0 ? withinBudget * responseEffectiveness : 0

  const earnedLoss = Math.round(W_LOSS * lossPerformance)
  const earnedPeople = Math.round(W_PEOPLE * peoplePerformance)
  const earnedLife = Math.round(W_LIFELINE * lifelinePerformance)
  const earnedBudget = Math.round(W_BUDGET * budgetScore)
  const score = earnedLoss + earnedPeople + earnedLife + earnedBudget
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B+' : score >= 70 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F'

  return {
    score,
    grade,
    lossAvoided,
    finalLoss: final.totalLoss,
    baselineLoss,
    peopleSafe,
    peopleAtRisk,
    lifelinesOnline: substation.functional && hospital.functional,
    overBudget,
    totalSpend: fx.spend,
    gradebook: [
      {
        label: 'Damage prevented', earned: earnedLoss, max: W_LOSS,
        detail: `${fmt(lossAvoided)} prevented → ${Math.round(lossPerformance * 100)}% of the ${scenarioId} response target`,
      },
      {
        label: 'People protected', earned: earnedPeople, max: W_PEOPLE,
        detail: `${peopleSafe.toLocaleString()} protected → ${Math.round(peoplePerformance * 100)}% of the ${scenarioId} response target`,
      },
      {
        label: 'Lifelines online', earned: earnedLife, max: W_LIFELINE,
        detail: `${lifeCount}/2 online (power and health center) → ${Math.round(lifelinePerformance * 100)}% of target`,
      },
      {
        label: 'Smart budget use', earned: earnedBudget, max: W_BUDGET,
        detail: fx.spend === 0
          ? 'No response was funded, so unused money does not earn resilience points.'
          : `${Math.round(responseEffectiveness * 100)}% response effectiveness${overBudget ? `; ${fmt(overBudget)} over budget` : '; within budget'} → ${earnedBudget}/${W_BUDGET} pts`,
      },
    ],
  }
}

function fmt(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${Math.round(value)}`
}
