import { SCENARIOS, ASSETS, type FloodScenario } from "./data";
import {
  EMPTY_MITIGATIONS,
  campusWaterElevation,
  computeAssets,
  computeRoads,
  type ModelEffects,
  type ExtraRaise,
} from "./model";
import {
  premiumFromLosses,
  coverageUptake,
  financialBreakdown,
  DEFAULT_LEVERS,
} from "./insurance";
import {
  SANDBOX_ACTIONS,
  SANDBOX_BUDGETS,
  HIGH_RISK_POLICY,
  type SandboxRoleId,
} from "./sandboxConfig";
export interface UnderwriterTerms {
  rate: number;
  deductible: number;
  limit: number;
  highRisk: "all" | "cap" | "decline";
}
export function allowedActions(role: SandboxRoleId) {
  return SANDBOX_ACTIONS.filter((a) => a.role === role);
}
export function toggleAction(
  role: SandboxRoleId,
  selected: string[],
  id: string,
): string[] {
  const action = allowedActions(role).find((a) => a.id === id);
  if (!action) return selected;
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  const next = [
    ...selected.filter(
      (x) =>
        !action.exclusiveGroup ||
        SANDBOX_ACTIONS.find((a) => a.id === x)?.exclusiveGroup !==
          action.exclusiveGroup,
    ),
    id,
  ];
  return actionSpend(role, next) <= SANDBOX_BUDGETS[role] ? next : selected;
}
export function actionSpend(role: SandboxRoleId, ids: string[]) {
  return allowedActions(role)
    .filter((a) => ids.includes(a.id))
    .reduce((s, a) => s + a.cost, 0);
}
export function evaluateSandbox(
  role: SandboxRoleId,
  ids: string[],
  scenario: FloodScenario,
) {
  const extraRaise: ExtraRaise = {};
  const effects: ModelEffects = {
    damageScale: {},
    backupPower: [],
    evacFraction: 0,
    shelterCapacity: 0,
    recoveryFactor: 1,
  };
  let reduction = 0;
  let discount = 0;
  const notes: string[] = [];
  const m = { ...EMPTY_MITIGATIONS };
  for (const action of allowedActions(role).filter((a) => ids.includes(a.id))) {
    const e = action.effect;
    reduction += e.reduction ?? 0;
    for (const [id, v] of Object.entries(e.raise ?? {}))
      extraRaise[id] = (extraRaise[id] ?? 0) + v;
    for (const [id, v] of Object.entries(e.damageScale ?? {}))
      effects.damageScale![id] = (effects.damageScale![id] ?? 1) * v;
    effects.backupPower!.push(...(e.backup ?? []));
    effects.evacFraction =
      1 - (1 - effects.evacFraction!) * (1 - (e.evacFraction ?? 0));
    effects.shelterCapacity! += e.shelterCapacity ?? 0;
    effects.recoveryFactor! *= e.recoveryFactor ?? 1;
    if (e.elevateRoads) m.elevateRoads = true;
    discount = Math.max(discount, e.mitigationDiscount ?? 0);
    if (e.barrier) {
      const fails = scenario.peakElevation > e.barrier.height;
      reduction += fails ? e.barrier.failureReduction : e.barrier.reduction;
      notes.push(
        fails
          ? `${action.label}: ${e.barrier.failure} above ${e.barrier.height.toFixed(1)} m; ${e.barrier.failureReduction.toFixed(1)} m protection remains.`
          : `${action.label} holds at this storm level.`,
      );
    }
  }
  const water = campusWaterElevation(scenario.peakElevation, reduction);
  const assets = computeAssets(m, water, extraRaise, effects);
  const roads = computeRoads(m, water);
  const baseline = computeAssets(EMPTY_MITIGATIONS, scenario.peakElevation);
  const loss = assets.reduce((s, a) => s + a.loss, 0);
  const baselineLoss = baseline.reduce((s, a) => s + a.loss, 0);
  const affected = assets.reduce((s, a) => s + a.peopleAffected, 0);
  const baselineAffected = baseline.reduce((s, a) => s + a.peopleAffected, 0);
  const sub = assets.find((a) => a.asset.kind === "substation")!;
  // Weighted consumer power outage, excluding the substation's served count to
  // avoid counting the same service population twice. Physical repair is separate.
  const consumers = assets.filter((a) => a.asset.kind !== "substation");
  const outage =
    consumers.reduce(
      (s, a) =>
        s +
        (a.powered
          ? 0
          : a.asset.occupants *
            Math.max(3 * (effects.recoveryFactor ?? 1), sub.downtimeDays)),
      0,
    ) / consumers.reduce((s, a) => s + a.asset.occupants, 0);
  const spend = actionSpend(role, ids);
  return {
    assets,
    roads,
    water,
    extraRaise,
    mitigations: m,
    spend,
    loss,
    lossAvoided: Math.max(0, baselineLoss - loss),
    peopleAffected: affected,
    peopleProtected: Math.max(0, baselineAffected - affected),
    powerDowntime: outage,
    recoveryDays: Math.max(...assets.map((a) => a.downtimeDays)),
    notes,
    discount,
  };
}
export function runUnderwriter(
  ids: string[],
  scenario: FloodScenario,
  terms: UnderwriterTerms,
) {
  const runs = SCENARIOS.map((s) => evaluateSandbox("underwriter", ids, s));
  const event = evaluateSandbox("underwriter", ids, scenario);
  const major = evaluateSandbox("underwriter", [], SCENARIOS[2]);
  const lines = ASSETS.map((asset) => {
    const highRisk =
      major.assets.find((a) => a.asset.id === asset.id)!.damage >=
      HIGH_RISK_POLICY.damageThreshold;
    const limit =
      highRisk && terms.highRisk === "decline"
        ? 0
        : highRisk && terms.highRisk === "cap"
          ? Math.min(terms.limit, HIGH_RISK_POLICY.cappedLimit)
          : terms.limit;
    const mitigated = ids.includes("discount") && asset.kind === "dorm";
    const lv = {
      ...DEFAULT_LEVERS,
      strategy: "flat" as const,
      loadingFactor: 0,
      flatRatePct: terms.rate * (mitigated ? 1 - event.discount : 1),
      insuredValuePct: limit,
      deductiblePct: terms.deductible,
      fixedExpense: HIGH_RISK_POLICY.annualExpense,
    };
    const losses = runs.map(
      (r) => r.assets.find((a) => a.asset.id === asset.id)!.loss,
    );
    const comp = premiumFromLosses(losses, asset.value, losses[2], lv);
    const uptake =
      limit > 0
        ? coverageUptake(
            comp.netPremium,
            asset.value,
            HIGH_RISK_POLICY.affordabilityThreshold,
          )
        : 0;
    const eventClaim =
      financialBreakdown(
        event.assets.find((a) => a.asset.id === asset.id)!.loss,
        asset.value,
        lv,
      ).insurerPays * uptake;
    return { asset, comp, uptake, eventClaim, highRisk };
  });
  const income = lines.reduce((s, l) => s + l.comp.netPremium * l.uptake, 0);
  const claims = lines.reduce((s, l) => s + l.comp.policyEal * l.uptake, 0);
  const costs =
    lines.reduce((s, l) => s + HIGH_RISK_POLICY.annualExpense * l.uptake, 0) +
    event.spend;
  const eventClaims = lines.reduce((s, l) => s + l.eventClaim, 0);
  const coverage =
    lines.reduce((s, l) => s + l.comp.insuredValue * l.uptake, 0) /
    ASSETS.reduce((s, a) => s + a.value, 0);
  return {
    income,
    claims,
    expectedProfit: income - claims - costs,
    eventProfit: income - eventClaims - costs,
    eventClaims,
    coverage,
    lines,
  };
}
