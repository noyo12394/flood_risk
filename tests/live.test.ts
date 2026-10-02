import test from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS } from "../src/game/data";
import { evaluate, emptyEffects, riverElevAt } from "../src/game/drill";
import {
  createLocalResultStore,
  parseResult,
  type TeamResult,
} from "../src/game/results";
const result: TeamResult = {
  version: 1,
  id: "run-1",
  team: "Team One",
  session: "FYRE",
  stormId: "major",
  score: 80,
  lossAvoided: 1000000,
  peopleProtected: 100,
  budgetSpent: 2000000,
  decisions: [],
  createdAt: "2026-10-02T20:00:00Z",
};
test("each storm produces identical flood curves and baseline damage across teams", () => {
  for (const s of SCENARIOS) {
    const run = () =>
      Array.from({ length: 101 }, (_, i) =>
        evaluate(
          emptyEffects(),
          riverElevAt(i / 100, s.peakElevation),
          s.peakElevation,
        ),
      );
    assert.deepEqual(run(), run());
  }
  assert.ok(
    evaluate(
      emptyEffects(),
      SCENARIOS[3].peakElevation,
      SCENARIOS[3].peakElevation,
    ).totalLoss >
      evaluate(
        emptyEffects(),
        SCENARIOS[0].peakElevation,
        SCENARIOS[0].peakElevation,
      ).totalLoss,
  );
});
test("local result storage deduplicates imports and persists across instances", () => {
  let raw: string | null = null;
  const adapter = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
  };
  const store = createLocalResultStore(() => adapter);
  store.save(result);
  store.save(result);
  assert.equal(store.read().length, 1);
  assert.deepEqual(createLocalResultStore(() => adapter).read()[0], result);
});
test("unavailable storage retains page results and reports failure", () => {
  const store = createLocalResultStore(() => {
    throw new Error("blocked");
  });
  assert.equal(store.save(result), false);
  assert.equal(store.read().length, 1);
});
test("imports reject invalid storm, nonfinite or out-of-range scores, excessive spend and malformed decisions", () => {
  for (const patch of [
    { stormId: "random" },
    { score: 101 },
    { lossAvoided: -1 },
    { budgetSpent: 4000000 },
    { team: "" },
    { decisions: [{ label: 3 }] },
  ])
    assert.throws(() => parseResult(JSON.stringify({ ...result, ...patch })));
  assert.deepEqual(parseResult(JSON.stringify(result)), result);
});
