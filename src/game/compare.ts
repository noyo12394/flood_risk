// Plan-comparison engine for the Decision Lab.
//
// Students weigh "Plan A: what happens" against "Plan B: what happens" on the
// SAME flood, see the implications side-by-side, and learn the concept behind
// the difference. Two surfaces use this:
//   - Guided dilemmas: pre-authored A-vs-B lessons with a prediction + reveal.
//   - Free compare: build your own two plans and compare.

import { MITIGATIONS, SCENARIOS, type MitigationId } from './data'
import {
  EMPTY_MITIGATIONS,
  formatUSD,
  runModel,
  type MitigationState,
  type ModelResult,
} from './model'

export type ScenarioId = (typeof SCENARIOS)[number]['id']

export interface Plan {
  scenarioId: ScenarioId
  mitigations: MitigationState
}

export interface PlanRun {
  result: ModelResult
  spend: number
  scenarioId: ScenarioId
}

export function mit(...ids: MitigationId[]): MitigationState {
  const m = { ...EMPTY_MITIGATIONS }
  for (const id of ids) m[id] = true
  return m
}

export function runPlan(plan: Plan): PlanRun {
  const scenario = SCENARIOS.find((s) => s.id === plan.scenarioId)!
  const result = runModel(scenario, plan.mitigations)
  const spend = MITIGATIONS.filter((m) => plan.mitigations[m.id]).reduce((s, m) => s + m.cost, 0)
  result.mitigationSpend = spend
  return { result, spend, scenarioId: plan.scenarioId }
}

// Plain-language "what happens" for a plan.
export function outcomeBullets(run: PlanRun): string[] {
  const r = run.result
  const flooded = r.assets.filter((a) => a.floodDepth > 0).length
  const maxDepth = Math.max(0, ...r.assets.map((a) => a.floodDepth))
  const out: string[] = []
  out.push(`${flooded}/${r.assets.length} buildings take on water (up to ${maxDepth.toFixed(1)} m).`)
  if (r.powerOut) {
    out.push(
      `Substation floods → ${r.buildingsUnpowered} buildings lose power` +
        (r.dryButDark > 0 ? `, ${r.dryButDark} of them completely dry.` : '.'),
    )
  } else {
    out.push('Power network stays energized — no cascading blackout.')
  }
  out.push(`${formatUSD(r.totalLoss)} in damage · ${r.peopleAffected.toLocaleString()} people affected.`)
  out.push(`Worst-case downtime ${r.maxDowntimeDays} days · you spend ${formatUSD(run.spend)}.`)
  return out
}

export interface Metric {
  label: string
  a: string
  b: string
  better: 'a' | 'b' | 'tie'
}

export interface Comparison {
  metrics: Metric[]
  recommend: 'a' | 'b' | 'tie'
  insight: string
}

// "Cost of risk" = damage you eat + money you spent. Lower is a better bet.
function costOfRisk(run: PlanRun): number {
  return run.result.totalLoss + run.spend
}

export function comparePlans(a: PlanRun, b: PlanRun, labelA = 'Plan A', labelB = 'Plan B'): Comparison {
  const ra = a.result
  const rb = b.result

  const lower = (x: number, y: number): 'a' | 'b' | 'tie' =>
    Math.abs(x - y) < 1 ? 'tie' : x < y ? 'a' : 'b'

  const metrics: Metric[] = [
    { label: 'Damage', a: formatUSD(ra.totalLoss), b: formatUSD(rb.totalLoss), better: lower(ra.totalLoss, rb.totalLoss) },
    { label: 'Buildings dark', a: `${ra.buildingsUnpowered}`, b: `${rb.buildingsUnpowered}`, better: lower(ra.buildingsUnpowered, rb.buildingsUnpowered) },
    { label: 'People affected', a: ra.peopleAffected.toLocaleString(), b: rb.peopleAffected.toLocaleString(), better: lower(ra.peopleAffected, rb.peopleAffected) },
    { label: 'Max downtime', a: `${ra.maxDowntimeDays} d`, b: `${rb.maxDowntimeDays} d`, better: lower(ra.maxDowntimeDays, rb.maxDowntimeDays) },
    { label: 'You spend', a: formatUSD(a.spend), b: formatUSD(b.spend), better: lower(a.spend, b.spend) },
    { label: 'Cost of risk', a: formatUSD(costOfRisk(a)), b: formatUSD(costOfRisk(b)), better: lower(costOfRisk(a), costOfRisk(b)) },
  ]

  const recommend = lower(costOfRisk(a), costOfRisk(b))
  const insight = buildInsight(a, b, labelA, labelB, recommend)
  return { metrics, recommend, insight }
}

// Surface the single most instructive difference between the two plans.
function buildInsight(a: PlanRun, b: PlanRun, labelA: string, labelB: string, rec: 'a' | 'b' | 'tie'): string {
  const ra = a.result
  const rb = b.result

  // 1) The system-of-systems lesson: one kept the lifeline, the other didn't.
  if (ra.powerOut !== rb.powerOut) {
    const litLabel = ra.powerOut ? labelB : labelA
    const darkLabel = ra.powerOut ? labelA : labelB
    const darkRun = ra.powerOut ? a : b
    return (
      `${litLabel} keeps the power network up, while the substation under ${darkLabel} floods and blacks out ` +
      `${darkRun.result.buildingsUnpowered} buildings` +
      (darkRun.result.dryButDark > 0 ? ` (${darkRun.result.dryButDark} of them completely dry). ` : '. ') +
      `Protecting the lifeline can matter more than shaving flood depth — that's the cascade in action.`
    )
  }

  // 2) Similar spend, different loss — efficiency of where the money went.
  const spendClose = Math.abs(a.spend - b.spend) < 400_000
  const lossGap = Math.abs(ra.totalLoss - rb.totalLoss)
  if (spendClose && lossGap > 500_000) {
    const winner = ra.totalLoss < rb.totalLoss ? labelA : labelB
    return `For roughly the same money, ${winner} avoids ${formatUSD(lossGap)} more damage — same budget, smarter placement.`
  }

  // 3) Paying more for protection — is it worth it?
  const spendGap = Math.abs(a.spend - b.spend)
  if (spendGap >= 400_000) {
    const cheaper = a.spend < b.spend ? a : b
    const dearer = a.spend < b.spend ? b : a
    const cheaperLabel = a.spend < b.spend ? labelA : labelB
    const dearerLabel = a.spend < b.spend ? labelB : labelA
    const avoided = cheaper.result.totalLoss - dearer.result.totalLoss
    if (avoided > spendGap) {
      return `${dearerLabel} spends ${formatUSD(spendGap)} more but avoids ${formatUSD(avoided)} of extra damage — the mitigation more than pays for itself.`
    }
    return `${dearerLabel} spends ${formatUSD(spendGap)} more for only ${formatUSD(Math.max(0, avoided))} less damage — ${cheaperLabel} is the more efficient bet here.`
  }

  if (rec === 'tie') return 'The two plans land in nearly the same place — the trade-offs cancel out.'
  return `Overall, ${rec === 'a' ? labelA : labelB} carries the lower total cost of risk.`
}

// ---------------------------------------------------------------------------
// Guided dilemmas — pre-authored A-vs-B lessons.
// ---------------------------------------------------------------------------

export interface DilemmaPlan {
  label: string
  scenarioId: ScenarioId
  mitigations: MitigationState
}

export interface Dilemma {
  id: string
  title: string
  situation: string
  planA: DilemmaPlan
  planB: DilemmaPlan
  correct: 'a' | 'b' // the more resilient choice
  concept: string
  teaching: string
}

export const DILEMMAS: Dilemma[] = [
  {
    id: 'depth-vs-lifeline',
    title: 'Lower the water, or protect the lifeline?',
    situation:
      'A 100-year (Major) flood is forecast. You can spend on lowering the water reaching campus, or on protecting the power substation. Which plan leaves the campus more resilient?',
    planA: { label: 'Flood barriers + drainage', scenarioId: 'major', mitigations: mit('floodGates', 'improveDrainage') },
    planB: { label: 'Raise substation + drainage', scenarioId: 'major', mitigations: mit('raiseSubstation', 'improveDrainage') },
    correct: 'b',
    concept: 'Cascading failure / system-of-systems',
    teaching:
      "Plan A cuts flood depth and property damage — but the substation still drowns, so the whole campus goes dark and far more people are affected. Plan B accepts more building damage yet keeps the power on for less money, so the campus keeps functioning. Resilience is about keeping the system running, not just minimizing the repair bill.",
  },
  {
    id: 'buildings-vs-network',
    title: 'Harden the buildings, or the network?',
    situation:
      'A 50-year (Moderate) flood is coming. Plan A elevates every building. Plan B protects the substation and improves drainage for less money. Which is smarter?',
    planA: { label: 'Elevate all buildings', scenarioId: 'moderate', mitigations: mit('elevateBuildings') },
    planB: { label: 'Raise substation + drainage', scenarioId: 'moderate', mitigations: mit('raiseSubstation', 'improveDrainage') },
    correct: 'b',
    concept: 'Exposure vs. vulnerability of the right asset',
    teaching:
      'Elevating buildings reduces water damage, but they still lose power when the substation floods — so they go dark anyway. Plan B protects the lifeline for less. Resilience is about the whole system, not just the buildings.',
  },
  {
    id: 'do-nothing-vs-cheap',
    title: 'Is mitigation even worth it in a mega-flood?',
    situation:
      'A 500-year (Extreme) flood — the worst case. Plan A saves the money and does nothing. Plan B spends on barriers, drainage and raising the substation. In such an extreme event, is mitigation worth it?',
    planA: { label: 'Do nothing', scenarioId: 'extreme', mitigations: mit() },
    planB: { label: 'Barriers + drainage + raise substation', scenarioId: 'extreme', mitigations: mit('floodGates', 'improveDrainage', 'raiseSubstation') },
    correct: 'b',
    concept: 'Value of mitigation for tail risk',
    teaching:
      'Even a 500-year flood is not all-or-nothing. Plan B still cuts damage, keeps more people safe and buys recovery time — mitigation pays off precisely when the hazard is largest, not just for small events.',
  },
]
