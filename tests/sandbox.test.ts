import test from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS } from "../src/game/data";
import { computeAssets, EMPTY_MITIGATIONS } from "../src/game/model";
import {
  SANDBOX_ROLES,
  SANDBOX_ACTIONS,
  SANDBOX_BUDGETS,
  UNDERWRITER_DEFAULTS,
} from "../src/game/sandboxConfig";
import {
  evaluateSandbox,
  allowedActions,
  toggleAction,
  actionSpend,
  runUnderwriter,
} from "../src/game/sandbox";
test("five roles face identical unmitigated floods and cannot apply another agency’s actions", () => {
  for (const storm of SCENARIOS) {
    const base = evaluateSandbox("president", [], storm);
    for (const role of SANDBOX_ROLES) {
      const r = evaluateSandbox(role.id, [], storm);
      assert.deepEqual(r.assets, base.assets);
      assert.deepEqual(r.roads, base.roads);
      const foreign = SANDBOX_ACTIONS.find((a) => a.role !== role.id)!;
      assert.deepEqual(
        evaluateSandbox(role.id, [foreign.id], storm).assets,
        base.assets,
      );
      assert.deepEqual(toggleAction(role.id, [], foreign.id), []);
    }
  }
  assert.ok(!allowedActions("underwriter").some((a) => a.id === "substation"));
});
test("wall and levee are mutually exclusive and their failures differ at Extreme", () => {
  assert.deepEqual(toggleAction("mayor", ["wall"], "dike"), ["dike"]);
  assert.deepEqual(toggleAction("mayor", ["dike"], "wall"), ["wall"]);
  const major = SCENARIOS[2],
    extreme = SCENARIOS[3];
  assert.ok(
    evaluateSandbox("mayor", ["dike"], major).lossAvoided >
      evaluateSandbox("mayor", ["wall"], major).lossAvoided,
  );
  assert.equal(evaluateSandbox("mayor", ["dike"], extreme).lossAvoided, 0);
  assert.ok(evaluateSandbox("mayor", ["wall"], extreme).lossAvoided > 0);
  assert.match(evaluateSandbox("mayor", ["dike"], extreme).notes[0], /breach/);
});
test("physical mitigation changes shared CAT damage and a protected lifeline restores downstream services", () => {
  const base = evaluateSandbox("utility", [], SCENARIOS[2]);
  const raised = evaluateSandbox("utility", ["substation"], SCENARIOS[2]);
  assert.ok(raised.loss < base.loss);
  assert.ok(raised.powerDowntime < base.powerDowntime);
  const campus = evaluateSandbox("president", ["elevate"], SCENARIOS[2]);
  assert.ok(campus.lossAvoided > 0);
  assert.equal(campus.spend, 2100000);
});
test("evacuation and shelter protect occupants without pretending to evacuate substation customers", () => {
  const base = evaluateSandbox("emergency", [], SCENARIOS[2]);
  const plan = evaluateSandbox(
    "emergency",
    ["evacTraining", "vehicles", "shelters"],
    SCENARIOS[2],
  );
  assert.ok(plan.peopleProtected > 0);
  assert.equal(plan.loss, base.loss);
  assert.equal(
    plan.assets.find((a) => a.asset.id === "substation")!.peopleAffected,
    base.assets.find((a) => a.asset.id === "substation")!.peopleAffected,
  );
});
test("repair spending reduces recovery time, not initial flood loss", () => {
  const base = evaluateSandbox("president", [], SCENARIOS[2]);
  const r = evaluateSandbox("president", ["campusRepair"], SCENARIOS[2]);
  assert.equal(r.loss, base.loss);
  assert.ok(r.recoveryDays < base.recoveryDays);
});
test("budget guard keeps every role within its funding limit", () => {
  for (const role of SANDBOX_ROLES) {
    let selected: string[] = [];
    for (const a of allowedActions(role.id))
      selected = toggleAction(role.id, selected, a.id);
    assert.ok(actionSpend(role.id, selected) <= SANDBOX_BUDGETS[role.id]);
  }
});
test("each configured action changes a relevant event consequence in at least one storm", () => {
  for (const a of SANDBOX_ACTIONS) {
    const works = SCENARIOS.some((s) => {
      const base = evaluateSandbox(a.role, [], s);
      const r = evaluateSandbox(a.role, [a.id], s);
      return (
        r.loss !== base.loss ||
        r.peopleAffected !== base.peopleAffected ||
        r.powerDowntime !== base.powerDowntime ||
        r.recoveryDays !== base.recoveryDays ||
        JSON.stringify(r.roads) !== JSON.stringify(base.roads)
      );
    });
    assert.ok(works, a.id);
  }
});
test("underwriter price, deductible, limit, discount, and highest-risk choices affect the insurance book", () => {
  const storm = SCENARIOS[2];
  const run = (
    patch: Partial<typeof UNDERWRITER_DEFAULTS>,
    ids: string[] = [],
  ) => runUnderwriter(ids, storm, { ...UNDERWRITER_DEFAULTS, ...patch });
  const base = run({});
  assert.ok(run({ rate: 0.02 }).coverage < run({ rate: 0.001 }).coverage);
  assert.ok(run({ deductible: 0.1 }).claims < run({ deductible: 0 }).claims);
  assert.ok(run({ limit: 0.5 }).eventClaims < run({ limit: 1 }).eventClaims);
  assert.ok(run({ highRisk: "decline" }).coverage < base.coverage);
  assert.ok(run({ highRisk: "cap" }).eventClaims < base.eventClaims);
  assert.notEqual(run({}, ["discount"]).income, base.income);
  for (const limit of [0, 1])
    for (const rate of [0, 0.02]) {
      const r = run({ limit, rate });
      assert.ok(Number.isFinite(r.expectedProfit));
      assert.ok(Number.isFinite(r.eventProfit));
      if (!limit) {
        assert.equal(r.coverage, 0);
        assert.equal(r.eventClaims, 0);
      }
    }
});
test("shared default fragility remains unchanged when no optional role effects are supplied", () =>
  assert.deepEqual(
    computeAssets(EMPTY_MITIGATIONS, 4.4),
    computeAssets(EMPTY_MITIGATIONS, 4.4, {}, {}),
  ));
