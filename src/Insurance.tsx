import { useMemo, useState } from "react";
import { Scene } from "./three/Scene";
import { ASSETS, SCENARIOS } from "./game/data";
import {
  EMPTY_MITIGATIONS,
  computeAssets,
  computeRoads,
  formatUSD,
} from "./game/model";
import {
  DEFAULT_LEVERS,
  INSURANCE_LEVELS,
  STRATEGY_MIN_LEVEL,
  VULNERABILITY_STAGE,
  leversForStage,
  runInsurance,
  type Levers,
  type Strategy,
} from "./game/insurance";
const STRATEGIES: { id: Strategy; label: string; blurb: string }[] = [
  {
    id: "flat",
    label: "Flat rate",
    blurb: "One annual percentage for every insured building.",
  },
  {
    id: "hazard",
    label: "Hazard-scaled",
    blurb: "Adjust the rate for each building’s flood exposure.",
  },
  {
    id: "fair",
    label: "Expected-claims pricing",
    blurb: "Expected claims plus loading and policy expense.",
  },
  {
    id: "capped",
    label: "Affordability-capped",
    blurb: "Expected-claims price limited to an affordable share of value.",
  },
];
export function Insurance({ onExit }: { onExit: () => void }) {
  const [level, setLevel] = useState(1);
  const [lv, setLv] = useState<Levers>({ ...DEFAULT_LEVERS, strategy: "flat" });
  const [submitted, setSubmitted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<
    { stage: number; result: ReturnType<typeof runInsurance> }[]
  >([]);
  const dry = useMemo(
    () => ({
      assets: computeAssets(EMPTY_MITIGATIONS, -3),
      roads: computeRoads(EMPTY_MITIGATIONS, -3),
    }),
    [],
  );
  const result = useMemo(
    () => runInsurance(leversForStage(lv, level)),
    [lv, level],
  );
  const info = INSURANCE_LEVELS[level - 1];
  const selected = result.lines.find((l) => l.asset.id === selectedId);
  function set(patch: Partial<Levers>) {
    if (!submitted) setLv((p) => ({ ...p, ...patch }));
  }
  function submit() {
    if (submitted) return;
    setSubmitted(true);
    setHistory((h) => [...h, { stage: level, result }]);
  }
  return (
    <div className="app insurance-app">
      <div className="scene-wrap">
        <Scene
          assets={dry.assets}
          roads={dry.roads}
          waterElev={-3}
          mitigations={EMPTY_MITIGATIONS}
          selectedId={selectedId}
          showAllLabels={false}
          onSelect={setSelectedId}
        />
      </div>
      <header className="lab-top">
        <button className="menu-back sm" onClick={onExit}>
          ← Menu
        </button>
        <div className="brand">
          <div>
            <h1>Decision Lab · Insurance Desk</h1>
            <p>
              Read the information, make a decision, then examine the
              consequences.
            </p>
          </div>
        </div>
      </header>
      <div className="insurance-layout">
        <section className="panel insurance-sheet">
          <p className="eyebrow">INFORMATION SHEET · STAGE {level} / 5</p>
          <h2>{info.title}</h2>
          <p>{info.unlocks}</p>
          <p>
            There is no single correct answer. Each choice balances the
            insurer’s income with the cost and reach of protection.
          </p>
          <div className="stage-track" aria-label="Stage progress">
            {INSURANCE_LEVELS.map((s) => (
              <span key={s.level} className={s.level === level ? "active" : ""}>
                {s.level}. {s.title}
              </span>
            ))}
          </div>
          {level === 1 && (
            <p>
              The portfolio has {ASSETS.length} buildings worth{" "}
              {formatUSD(ASSETS.reduce((s, a) => s + a.value, 0))}. Choose what
              share of insured value to charge each year.
            </p>
          )}
          {level >= 2 && (
            <div className="sheet-facts">
              <h3>Flood information</h3>
              {SCENARIOS.map((s) => (
                <p key={s.id}>
                  <b>{s.label}</b> · {s.peakElevation.toFixed(1)} m peak · 1-in-
                  {s.returnPeriod} annual chance
                </p>
              ))}
            </div>
          )}
          {level >= 3 && (
            <div className="table-scroll">
              <table className="info-table">
                <thead>
                  <tr>
                    <th>Building</th>
                    <th>Value</th>
                    <th>Occupants / served</th>
                  </tr>
                </thead>
                <tbody>
                  {ASSETS.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{formatUSD(a.value)}</td>
                      <td>{a.occupants.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {level >= VULNERABILITY_STAGE && (
            <div className="sheet-facts">
              <h3>Vulnerability revealed</h3>
              <p>
                Water above a building’s first floor causes increasing damage.
                Vulnerability is shown as a damage ratio: 0% means no physical
                damage, 100% means the full replacement value is lost.
              </p>
              <p>
                Expected claims combine these damage estimates with how often
                each flood occurs. Loading adds a price margin above the base
                rate or expected claims.
              </p>
            </div>
          )}
          {level === 5 && (
            <p>
              A deductible is the amount the owner pays first. The coverage
              limit caps the insurer’s payment. Higher deductibles and lower
              limits leave more loss with the owner.
            </p>
          )}
          <p className="ins-note">
            All values and the affordability response are illustrative teaching
            assumptions. Residential occupancy is used as a proxy for
            households.
          </p>
        </section>
        <section className="panel insurance-decision">
          <h2>Your decision</h2>
          <fieldset disabled={submitted} className="pricing-controls">
            {level >= 4 && (
              <div className="ins-strats">
                {STRATEGIES.filter(
                  (s) => STRATEGY_MIN_LEVEL[s.id] <= level,
                ).map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={`ins-strat ${lv.strategy === s.id ? "on" : ""}`}
                    aria-pressed={lv.strategy === s.id}
                    onClick={() => set({ strategy: s.id })}
                  >
                    <strong>{s.label}</strong>
                    <span>{s.blurb}</span>
                  </button>
                ))}
              </div>
            )}
            {(level < 4 ||
              lv.strategy === "flat" ||
              lv.strategy === "hazard") && (
              <PricingSlider
                label="Flat rate"
                value={lv.flatRatePct}
                min={0}
                max={0.02}
                step={0.001}
                onChange={(v) => set({ flatRatePct: v })}
                format={(v) => `${(v * 100).toFixed(1)}%`}
                hint="Annual premium as a share of insured value."
              />
            )}
            {level >= VULNERABILITY_STAGE && (
              <>
                <PricingSlider
                  label="Loading factor"
                  value={lv.loadingFactor}
                  min={0}
                  max={0.6}
                  step={0.05}
                  onChange={(v) => set({ loadingFactor: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                  hint="Price margin above the base rate or expected claims."
                />
                <PricingSlider
                  label="Affordability threshold"
                  value={lv.affordCapPct}
                  min={0}
                  max={0.02}
                  step={0.001}
                  onChange={(v) => set({ affordCapPct: v })}
                  format={(v) => `${(v * 100).toFixed(1)}%`}
                  hint="Annual price tolerance; higher thresholds allow more households to buy coverage."
                />
              </>
            )}
            {level === 5 && (
              <>
                <PricingSlider
                  label="Coverage limit"
                  value={lv.insuredValuePct}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => set({ insuredValuePct: v })}
                  format={(v) => `${Math.round(v * 100)}% of value`}
                  hint="Maximum insurer payment per event."
                />
                <PricingSlider
                  label="Deductible"
                  value={lv.deductiblePct}
                  min={0}
                  max={0.1}
                  step={0.01}
                  onChange={(v) => set({ deductiblePct: v })}
                  format={(v) => `${Math.round(v * 100)}% of limit`}
                  hint="The owner pays this amount before the policy responds."
                />
                <PricingSlider
                  label="Policy expense"
                  value={lv.fixedExpense}
                  min={0}
                  max={1000}
                  step={50}
                  onChange={(v) => set({ fixedExpense: v })}
                  format={formatUSD}
                  hint="Annual operating cost for each purchased policy."
                />
              </>
            )}
          </fieldset>
          {!submitted ? (
            <button className="enter" onClick={submit}>
              Submit decision
            </button>
          ) : (
            <>
              <p className="ins-note">
                Decision submitted. Inputs are locked while you examine this
                stage’s result.
              </p>
              <h3>Stage {level} consequences</h3>
              <InsuranceConsequences result={result} />
              {level === 5 && selected && (
                <div className="sheet-facts">
                  <h3>{selected.asset.name}: Major flood</h3>
                  <p>
                    Owner pays {formatUSD(selected.event100.ownerPays)} ·
                    insurer pays {formatUSD(selected.event100.insurerPays)}
                  </p>
                </div>
              )}
              <div className="reflection-task">
                <p>
                  How did your price change profit and coverage? Who carries the
                  remaining loss? Compare your reasoning with another team.
                </p>
              </div>
              {level < 5 ? (
                <button
                  className="enter"
                  onClick={() => {
                    setSubmitted(false);
                    setLevel(level + 1);
                  }}
                >
                  Next stage →
                </button>
              ) : (
                <button
                  className="enter"
                  onClick={() => {
                    setLevel(1);
                    setSubmitted(false);
                    setHistory([]);
                    setLv({ ...DEFAULT_LEVERS, strategy: "flat" });
                  }}
                >
                  Start a new decision sheet
                </button>
              )}
            </>
          )}
          {history.length > 0 && (
            <details className="stage-history">
              <summary>Earlier stage decisions</summary>
              {history.map((h) => (
                <div key={h.stage}>
                  <b>Stage {h.stage}</b>
                  <p>
                    Profit {formatUSD(h.result.netIncome)} · households covered{" "}
                    {(h.result.coverageShare * 100).toFixed(0)}%
                  </p>
                </div>
              ))}
            </details>
          )}
        </section>
      </div>
      {selected && (
        <div className="scanner ins-scanner">
          <div className="scanner-head">
            <strong>{selected.asset.name}</strong>
            <button className="x" onClick={() => setSelectedId(null)}>
              ✕
            </button>
          </div>
          <p>Replacement value: {formatUSD(selected.asset.value)}</p>
          {submitted && (
            <p>Annual policy price: {formatUSD(selected.comp.netPremium)}</p>
          )}
        </div>
      )}
    </div>
  );
}
export function InsuranceConsequences({
  result,
}: {
  result: ReturnType<typeof runInsurance>;
}) {
  return (
    <dl className="consequence-list">
      <dt>Premium income / year</dt>
      <dd>{formatUSD(result.totalPremium)}</dd>
      <dt>Expected claims / year</dt>
      <dd>{formatUSD(result.totalEal)}</dd>
      <dt>Expected profit / year</dt>
      <dd>{formatUSD(result.netIncome)}</dd>
      <dt>Share of households covered</dt>
      <dd>{(result.coverageShare * 100).toFixed(0)}%</dd>
    </dl>
  );
}
export function PricingSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  hint: string;
}) {
  return (
    <label className="pricing-slider">
      <span>
        <b>{label}</b>
        <output>{format(value)}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <small>{hint}</small>
    </label>
  );
}
