// Insurance pricing module — the FYRE Week-4 CAT insurance math, adapted from
// Sushreyo Misra's insurance_pricing_tool.py to our FLOOD campus.
//
// Same three-part CAT structure and the same actuarial vocabulary:
//   HAZARD        -> the flood scenarios and their annual probabilities
//   VULNERABILITY -> our depth-damage fragility (per building, per scenario)
//   FINANCIAL     -> Pure / Gross / Net premium, insured value, deductible,
//                    reinsurance,
//                    PML at return periods, loss / expense / combined ratio.
//
// The one adaptation: the reference tool is seismic (PGA) with household-income
// affordability. Our game is flood, on a campus, so:
//   * EAL is integrated over the flood loss-exceedance curve (the 4 scenarios),
//     not a seismic hazard curve.
//   * "Affordability" is expressed as a rate-on-line cap (premium as a % of
//     insured value) rather than a household-income threshold.
// All premium-component formulas, the scoring triad (Coverage / Affordability /
// Profitability) and the 0–100 composite mirror the reference implementation.

import { ASSETS, SCENARIOS, type Asset } from './data'
import { EMPTY_MITIGATIONS, computeAssets, formatUSD } from './model'

// ---- HAZARD × VULNERABILITY → per-building loss at each scenario -------------

// Direct flood property loss for every building at each scenario, no mitigation.
// (Insurance prices the physical damage; the power cascade drives downtime, not
// replacement cost, so we use direct loss here.)
const SCENARIO_LOSS: Record<string, number>[] = SCENARIOS.map((s) => {
  const assets = computeAssets(EMPTY_MITIGATIONS, s.peakElevation)
  const map: Record<string, number> = {}
  for (const r of assets) map[r.asset.id] = r.loss
  return map
})

// Expected Annual Loss (USD/yr) for a building: the area under its
// loss-vs-annual-exceedance-rate curve, integrated across the scenarios.
export function computeEAL(assetId: string): number {
  // Points (lambda = annual exceedance rate, L = loss), most→least frequent.
  const pts: [number, number][] = [[0.2, 0]] // floods below the 10-yr do ~no structural damage
  SCENARIOS.forEach((s, i) => pts.push([s.annualProbability, SCENARIO_LOSS[i][assetId] ?? 0]))
  // pts are in decreasing lambda already (0.2 > 0.1 > 0.02 > 0.01 > 0.002).
  let eal = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [l0, L0] = pts[i]
    const [l1, L1] = pts[i + 1]
    eal += 0.5 * (L0 + L1) * (l0 - l1) // trapezoid on the loss-exceedance curve
  }
  // Tail beyond the 500-yr: hold the loss flat down to lambda = 0.
  const [lLast, LLast] = pts[pts.length - 1]
  eal += LLast * lLast
  return eal
}

// Probable Maximum Loss at a return period = the loss at that scenario severity.
export function computePML(assetId: string, returnPeriod: number): number {
  const idx = SCENARIOS.findIndex((s) => s.returnPeriod === returnPeriod)
  if (idx < 0) return 0
  return SCENARIO_LOSS[idx][assetId] ?? 0
}

// ---- FINANCIAL: premium components (ported formulas) -------------------------

// Progressive data-reveal levels (ported from the reference tool's game flow).
export interface LevelInfo {
  level: number
  title: string
  unlocks: string
}
export const INSURANCE_LEVELS: LevelInfo[] = [
  { level: 1, title: 'Inventory', unlocks: 'Building inventory only — insured value, use and occupants. Price blind.' },
  { level: 2, title: 'Hazard', unlocks: 'Flood exposure + PML. Compare flat pricing with a hazard-scaled rate.' },
  { level: 3, title: 'Vulnerability', unlocks: 'Expected Annual Loss (fragility) and the actuarial pricing black box.' },
  { level: 4, title: 'Affordability', unlocks: 'An equity lens: balance risk coverage against a rate-on-line cap.' },
  { level: 5, title: 'Financial model', unlocks: 'Open the black box: insured value, deductible and reinsurance.' },
]

export type Strategy = 'flat' | 'hazard' | 'fair' | 'capped'

// The data level a strategy needs before it can be used.
export const STRATEGY_MIN_LEVEL: Record<Strategy, number> = { flat: 1, hazard: 2, fair: 3, capped: 4 }

export interface Levers {
  strategy: Strategy
  loadingFactor: number // fractional load above pure premium (e.g. 0.40)
  insuredValuePct: number // insured value as fraction of replacement value (e.g. 0.85)
  deductiblePct: number // deductible as fraction of insured value (e.g. 0.03)
  reinsurancePct: number // fraction of claims ceded to a reinsurer (e.g. 0.60)
  fixedExpense: number // flat annual policy expense (USD)
  flatRatePct: number // premium as % of value for the flat strategy
  affordCapPct: number // affordability cap: max premium as % of value (rate on line)
}

export const DEFAULT_LEVERS: Levers = {
  strategy: 'fair',
  loadingFactor: 0.4,
  insuredValuePct: 0.85,
  deductiblePct: 0.03,
  reinsurancePct: 0.6,
  fixedExpense: 250,
  flatRatePct: 0.004,
  affordCapPct: 0.009,
}

export interface PremiumComponents {
  eal: number // gross EAL before policy terms
  policyEal: number // expected annual claim after IV and deductible
  loadingAmount: number
  reinsuranceCost: number
  grossPremium: number
  insuredValue: number
  deductibleUsd: number
  netInsurerEal: number
  netPremium: number // the premium actually charged
  lossRatio: number
  expenseRatio: number
  combinedRatio: number // < 1.0 → underwriting profit
}

// Base (gross) premium after policy terms, per strategy.
function grossForStrategy(strategy: Strategy, policyEal: number, value: number, pml100: number, lv: Levers): number {
  const reinsuranceCost = policyEal * lv.reinsurancePct * 0.15
  const fair = policyEal * (1 + lv.loadingFactor) + reinsuranceCost + lv.fixedExpense
  if (strategy === 'flat') return value * lv.flatRatePct
  if (strategy === 'hazard') {
    const hazardFactor = Math.max(0.6, Math.min(2.2, 0.6 + 3.2 * (pml100 / value)))
    return value * lv.flatRatePct * hazardFactor
  }
  if (strategy === 'capped') return Math.min(fair, value * lv.affordCapPct)
  return fair
}

function policyEAL(assetId: string, value: number, lv: Levers): number {
  const insuredValue = value * lv.insuredValuePct
  const deductible = insuredValue * lv.deductiblePct
  const pts: [number, number][] = [[0.2, 0]]
  SCENARIOS.forEach((s, i) => {
    const loss = SCENARIO_LOSS[i][assetId] ?? 0
    pts.push([s.annualProbability, Math.max(0, Math.min(insuredValue, loss) - deductible)])
  })
  let eal = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [l0, L0] = pts[i]
    const [l1, L1] = pts[i + 1]
    eal += 0.5 * (L0 + L1) * (l0 - l1)
  }
  const [lLast, LLast] = pts[pts.length - 1]
  return eal + LLast * lLast
}

export function premiumComponents(assetId: string, eal: number, value: number, pml100: number, lv: Levers): PremiumComponents {
  const pure = policyEAL(assetId, value, lv)
  const insuredValue = value * lv.insuredValuePct
  // Premium charged = the strategy's gross price (this is what covers the EAL).
  const gross = grossForStrategy(lv.strategy, pure, value, pml100, lv)
  const premium = gross
  const netInsurerEal = pure * (1 - lv.reinsurancePct)
  const reinsuranceCost = pure * lv.reinsurancePct * 0.15
  // Expense load = loading (operating + cat reserve + profit) + fixed expense.
  // Kept as a positive cost so loss + expense = combined ratio behaves sanely
  // even when a (flat) premium is far below the pure premium.
  const expenses = pure * lv.loadingFactor + reinsuranceCost + lv.fixedExpense
  const lossRatio = premium > 0 ? netInsurerEal / premium : NaN
  const expenseRatio = premium > 0 ? expenses / premium : NaN
  return {
    eal,
    policyEal: pure,
    loadingAmount: pure * lv.loadingFactor,
    reinsuranceCost,
    grossPremium: gross,
    insuredValue,
    deductibleUsd: lv.deductiblePct * insuredValue,
    netInsurerEal,
    netPremium: premium,
    lossRatio,
    expenseRatio,
    combinedRatio: lossRatio + expenseRatio,
  }
}

// ---- PORTFOLIO + SCORING (ported triad) -------------------------------------

export interface BuildingLine {
  asset: Asset
  eal: number
  pml100: number
  pml500: number
  comp: PremiumComponents
  coversEal: boolean
  affordable: boolean
  rateOnLine: number // net premium / value
  riskMultiplier: number // this building's technical rate ÷ portfolio-average rate
  event100: FinancialBreakdown
}

export interface FinancialBreakdown {
  repairCost: number
  coveredLoss: number
  ownerPays: number
  insurerPays: number
  reinsurerPays: number
  underinsured: boolean
}

export function financialBreakdown(repairCost: number, value: number, lv: Levers): FinancialBreakdown {
  const insuredValue = value * lv.insuredValuePct
  const deductible = insuredValue * lv.deductiblePct
  const coveredLoss = Math.min(insuredValue, repairCost)
  const claim = Math.max(0, coveredLoss - deductible)
  return {
    repairCost,
    coveredLoss,
    ownerPays: Math.min(deductible, coveredLoss) + Math.max(0, repairCost - insuredValue),
    insurerPays: claim * (1 - lv.reinsurancePct),
    reinsurerPays: claim * lv.reinsurancePct,
    underinsured: repairCost > insuredValue,
  }
}

export interface InsuranceResult {
  lines: BuildingLine[]
  totalEal: number
  totalPremium: number
  netIncome: number
  portfolioLossRatio: number
  portfolioCombinedRatio: number
  coverageScore: number
  affordabilityScore: number
  profitabilityScore: number
  composite: number // 0–100
  grade: string
  nCovers: number
  nAffordable: number
}

const clip = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))

export function runInsurance(lv: Levers): InsuranceResult {
  // Each building's technical rate = its EAL as a fraction of insured value.
  // The per-building risk multiplier expresses that relative to the portfolio
  // average, so a value of 2.0 means "twice the average flood risk per dollar".
  const techRate = (asset: Asset) => computeEAL(asset.id) / Math.max(1, asset.value)
  const avgRate = ASSETS.reduce((s, a) => s + techRate(a), 0) / ASSETS.length

  const lines: BuildingLine[] = ASSETS.map((asset) => {
    const eal = computeEAL(asset.id)
    const pml100 = computePML(asset.id, 100)
    const comp = premiumComponents(asset.id, eal, asset.value, pml100, lv)
    return {
      asset,
      eal,
      pml100,
      pml500: computePML(asset.id, 500),
      comp,
      coversEal: comp.netPremium >= comp.policyEal,
      affordable: comp.netPremium <= lv.affordCapPct * asset.value,
      rateOnLine: comp.netPremium / asset.value,
      riskMultiplier: avgRate > 0 ? techRate(asset) / avgRate : 1,
      event100: financialBreakdown(pml100, asset.value, lv),
    }
  })

  const totalEal = lines.reduce((s, l) => s + l.comp.policyEal, 0)
  const totalPremium = lines.reduce((s, l) => s + l.comp.netPremium, 0)
  const totalInsurerEal = lines.reduce((s, l) => s + l.comp.netInsurerEal, 0)
  const totalExpenses = lines.reduce((s, l) => s + l.comp.loadingAmount + l.comp.reinsuranceCost + lv.fixedExpense, 0)

  // Coverage: does each premium cover its EAL? (mean, capped at 1)
  const coverageScore =
    lines.reduce((s, l) => s + clip(l.comp.policyEal > 0 ? l.comp.netPremium / l.comp.policyEal : 1), 0) / lines.length

  // Affordability: premium at/below the rate-on-line cap (mean).
  const affordabilityScore =
    lines.reduce((s, l) => {
      const cap = lv.affordCapPct * l.asset.value
      return s + (l.comp.netPremium <= cap ? 1 : clip(2 - l.comp.netPremium / cap))
    }, 0) / lines.length

  // Profitability: portfolio premium/EAL vs a 1.20 target margin.
  const target = 1.2
  const ratio = totalEal > 0 ? totalPremium / totalEal : target
  const profitabilityScore = clip((ratio - 1) / (target - 1))

  const composite = (0.35 * coverageScore + 0.3 * affordabilityScore + 0.35 * profitabilityScore) * 100
  const grade =
    composite >= 90 ? 'A' : composite >= 80 ? 'B+' : composite >= 70 ? 'B' : composite >= 60 ? 'C' : composite >= 45 ? 'D' : 'F'

  return {
    lines: lines.sort((a, b) => b.eal - a.eal),
    totalEal,
    totalPremium,
    netIncome: totalPremium - totalInsurerEal - totalExpenses,
    portfolioLossRatio: totalPremium > 0 ? totalInsurerEal / totalPremium : NaN,
    portfolioCombinedRatio: totalPremium > 0 ? (totalInsurerEal + totalExpenses) / totalPremium : NaN,
    coverageScore,
    affordabilityScore,
    profitabilityScore,
    composite: Math.round(composite * 10) / 10,
    grade,
    nCovers: lines.filter((l) => l.coversEal).length,
    nAffordable: lines.filter((l) => l.affordable).length,
  }
}

// ---- Glossary --------------------------------------------------------------
// Plain-language definitions so students can see the logic behind every score.

export interface GlossaryTerm {
  term: string
  def: string
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: 'Expected Annual Loss (EAL)', def: 'The average loss per year, found by integrating loss against how often each flood happens. It is the actuarially "pure" premium — the price with no expenses or profit.' },
  { term: 'Probable Maximum Loss (PML)', def: 'The loss in a single severe event at a given return period (e.g. the 100- or 500-year flood). Reinsurers use it to size how much cover a portfolio needs.' },
  { term: 'Insured value', def: 'The share of a building’s replacement cost that the policy actually covers. Below 100% the owner is under-insured and keeps some risk.' },
  { term: 'Deductible', def: 'The first slice of a loss the policyholder pays before the insurer contributes. A higher deductible lowers claims and the premium.' },
  { term: 'Loading factor', def: 'The mark-up added above the pure premium to fund operating expenses, a catastrophe reserve, and profit. Typically 30–50%.' },
  { term: 'Gross / Net premium', def: 'Gross premium is the price before policy terms; the net (charged) premium is what the policyholder pays after those terms are applied.' },
  { term: 'Reinsurance', def: 'Insurance for the insurer: a share of claims is passed to a reinsurer in exchange for a fee, reducing the primary insurer’s tail risk.' },
  { term: 'Rate on line', def: 'The premium expressed as a percentage of insured value. A quick way to compare how "expensive" cover is across buildings.' },
  { term: 'Risk multiplier', def: 'A building’s technical rate (EAL ÷ value) relative to the portfolio average. Above 1.0 means higher flood risk per dollar than a typical asset here.' },
  { term: 'Loss ratio', def: 'Claims the insurer expects to pay ÷ premium collected. Lower is healthier.' },
  { term: 'Expense ratio', def: 'Expenses (loading + reinsurance + fixed) ÷ premium collected.' },
  { term: 'Combined ratio', def: 'Loss ratio + expense ratio. Below 100% means the book makes an underwriting profit; above 100% it loses money before investment income.' },
  { term: 'Coverage score', def: 'Are premiums high enough to cover each building’s expected loss? Averaged across the portfolio.' },
  { term: 'Affordability score', def: 'An equity check — do premiums stay within a rate-on-line cap so cover is not priced out of reach? Averaged across the portfolio.' },
  { term: 'Profitability score', def: 'Does total premium exceed total expected loss by the target margin (1.20×)? A portfolio-level measure.' },
  { term: 'Composite score', def: 'The overall 0–100 grade: a weighted blend of coverage, affordability and profitability — the three goals a sound book must balance.' },
]

// Convenience for the Sandbox analyst panel: portfolio EAL + fair combined ratio.
export function portfolioSummary() {
  const r = runInsurance(DEFAULT_LEVERS)
  return { totalEal: r.totalEal, combinedRatio: r.portfolioCombinedRatio, totalPremium: r.totalPremium }
}

export { formatUSD }
