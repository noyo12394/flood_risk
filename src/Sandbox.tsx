import { useMemo, useState } from "react";
import { Scene } from "./three/Scene";
import { StormSelector, type StormId } from "./StormSelector";
import { PricingSlider } from "./Insurance";
import { SCENARIOS } from "./game/data";
import {
  EMPTY_MITIGATIONS,
  computeAssets,
  computeRoads,
  formatUSD,
} from "./game/model";
import {
  SANDBOX_ROLES,
  SANDBOX_BUDGETS,
  UNDERWRITER_DEFAULTS,
  type SandboxRoleId,
} from "./game/sandboxConfig";
import {
  allowedActions,
  evaluateSandbox,
  runUnderwriter,
  toggleAction,
  type UnderwriterTerms,
} from "./game/sandbox";
export function Sandbox({ onExit }: { onExit: () => void }) {
  const [role, setRole] = useState<SandboxRoleId | "">("");
  const [storm, setStorm] = useState<StormId | "">("");
  const [started, setStarted] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [terms, setTerms] = useState<UnderwriterTerms>({
    ...UNDERWRITER_DEFAULTS,
  });
  const [showResults, setShowResults] = useState(false);
  const scenario = SCENARIOS.find((s) => s.id === storm) ?? SCENARIOS[2];
  const activeRole = SANDBOX_ROLES.find((r) => r.id === role);
  const result = useMemo(
    () => evaluateSandbox(role || "president", ids, scenario),
    [role, ids, scenario],
  );
  const baseline = useMemo(
    () => evaluateSandbox(role || "president", [], scenario),
    [role, scenario],
  );
  const insurance = useMemo(
    () =>
      role === "underwriter" ? runUnderwriter(ids, scenario, terms) : null,
    [role, ids, scenario, terms],
  );
  const dry = useMemo(
    () => ({
      assets: computeAssets(EMPTY_MITIGATIONS, -3),
      roads: computeRoads(EMPTY_MITIGATIONS, -3),
    }),
    [],
  );
  const actions = role ? allowedActions(role) : [];
  const selected = result.assets.find((a) => a.asset.id === selectedId);
  const ratio = result.spend > 0 ? result.lossAvoided / result.spend : null;
  function changeSetup() {
    setStarted(false);
    setShowResults(false);
    setIds([]);
    setSelectedId(null);
  }
  return (
    <div className="app role-sandbox">
      <div className="scene-wrap">
        <Scene
          assets={started ? result.assets : dry.assets}
          roads={started ? result.roads : dry.roads}
          waterElev={started ? result.water : -3}
          mitigations={started ? result.mitigations : EMPTY_MITIGATIONS}
          selectedId={selectedId}
          showAllLabels={false}
          ringOverride={Object.fromEntries(
            Object.keys(result.extraRaise).map((id) => [id, "#27d9c2"]),
          )}
          onSelect={setSelectedId}
        />
      </div>
      {!started ? (
        <div className="intro">
          <section className="prep sandbox-setup">
            <button className="menu-back" onClick={onExit}>
              ← Menu
            </button>
            <p className="eyebrow">
              SANDBOX · ONE FLOOD, DIFFERENT RESPONSIBILITIES
            </p>
            <h2>Who are you responsible for?</h2>
            <div className="roles">
              {SANDBOX_ROLES.map((r) => (
                <button
                  key={r.id}
                  className={`role ${role === r.id ? "on" : ""}`}
                  aria-pressed={role === r.id}
                  style={{ ["--rc" as string]: r.color }}
                  onClick={() => {
                    setRole(r.id);
                    setIds([]);
                    setTerms({ ...UNDERWRITER_DEFAULTS });
                  }}
                >
                  <strong>{r.name}</strong>
                  <span>
                    {r.domain} · {r.focus}
                  </span>
                </button>
              ))}
            </div>
            <StormSelector value={storm} onChange={setStorm} />
            <p className="ins-note">
              Each role faces the same flood, terrain, buildings, and service
              network. Your role determines the decisions you can make and the
              outcomes you track.
            </p>
            <button
              className="enter"
              disabled={!role || !storm}
              onClick={() => setStarted(true)}
            >
              Start Sandbox →
            </button>
          </section>
        </div>
      ) : (
        <>
          <header className="lab-top">
            <button className="menu-back sm" onClick={onExit}>
              ← Menu
            </button>
            <div className="brand">
              <div>
                <h1>{activeRole!.name}</h1>
                <p>
                  {activeRole!.domain} · {scenario.label} storm ·{" "}
                  {scenario.peakElevation.toFixed(1)} m peak
                </p>
              </div>
            </div>
            <button className="chip" onClick={changeSetup}>
              Change role / storm
            </button>
          </header>
          <div className="sandbox-layout">
            <section className="panel sandbox-controls">
              <h2>Your decisions</h2>
              <p>{activeRole!.focus}</p>
              <p className="budget-line">
                Budget left:{" "}
                <b>
                  {formatUSD(
                    SANDBOX_BUDGETS[role as SandboxRoleId] - result.spend,
                  )}
                </b>
              </p>
              {role === "underwriter" && (
                <>
                  <PricingSlider
                    label="Policy rate"
                    value={terms.rate}
                    min={0}
                    max={0.02}
                    step={0.001}
                    onChange={(v) => setTerms((t) => ({ ...t, rate: v }))}
                    format={(v) => `${(v * 100).toFixed(1)}%`}
                    hint="Annual price as a share of insured value."
                  />
                  <PricingSlider
                    label="Deductible"
                    value={terms.deductible}
                    min={0}
                    max={0.1}
                    step={0.01}
                    onChange={(v) => setTerms((t) => ({ ...t, deductible: v }))}
                    format={(v) => `${Math.round(v * 100)}%`}
                    hint="Owner’s first payment, as a share of the policy limit."
                  />
                  <PricingSlider
                    label="Coverage limit"
                    value={terms.limit}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => setTerms((t) => ({ ...t, limit: v }))}
                    format={(v) => `${Math.round(v * 100)}% of value`}
                    hint="Maximum claim payment per property."
                  />
                  <label className="field-label">
                    Highest-risk zones
                    <select
                      value={terms.highRisk}
                      onChange={(e) =>
                        setTerms((t) => ({
                          ...t,
                          highRisk: e.target
                            .value as UnderwriterTerms["highRisk"],
                        }))
                      }
                    >
                      <option value="all">Offer full selected coverage</option>
                      <option value="cap">Cap coverage at 50% of value</option>
                      <option value="decline">Decline coverage</option>
                    </select>
                  </label>
                  <p className="ins-note">
                    Highest risk means at least 60% physical damage in the Major
                    baseline scenario. Declining risk reduces claims and leaves
                    exposure uninsured.
                  </p>
                </>
              )}
              <div className="mits">
                {actions.map((a) => {
                  const on = ids.includes(a.id);
                  const next = toggleAction(role as SandboxRoleId, ids, a.id);
                  const blocked = !on && !next.includes(a.id);
                  const standalone = evaluateSandbox(
                    role as SandboxRoleId,
                    [a.id],
                    scenario,
                  );
                  return (
                    <button
                      key={a.id}
                      className={`mit ${on ? "on" : ""}`}
                      aria-pressed={on}
                      disabled={blocked}
                      onClick={() => setIds(next)}
                    >
                      <span
                        className="tick"
                        style={{
                          borderColor: activeRole!.color,
                          background: on ? activeRole!.color : "transparent",
                        }}
                      />
                      <span className="mtext">
                        <strong>{a.label}</strong>
                        <em>{a.description}</em>
                        <small>
                          {formatUSD(a.cost)} ·{" "}
                          {formatUSD(standalone.lossAvoided)} loss prevented
                          alone{blocked ? " · exceeds budget" : ""}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="ins-note">
                Action previews compare each action alone with no action.
                Benefits may overlap when combined.
              </p>
              <button className="chip" onClick={() => setIds([])}>
                Reset decisions
              </button>
            </section>
            <section className="panel sandbox-dashboard">
              <h2>
                {role === "underwriter"
                  ? "Insurance market"
                  : "Your consequences"}
              </h2>
              <p>Hazard × exposure × vulnerability = risk</p>
              <dl className="consequence-list">
                <dt>Money spent</dt>
                <dd>{formatUSD(result.spend)}</dd>
                <dt>Loss prevented</dt>
                <dd>{formatUSD(result.lossAvoided)}</dd>
                <dt>Benefit / cost ratio</dt>
                <dd>
                  {ratio === null ? "— (no spending)" : `${ratio.toFixed(2)}×`}
                </dd>
              </dl>
              <RoleMetrics
                role={role as SandboxRoleId}
                result={result}
                baseline={baseline}
                insurance={insurance}
              />
              {result.notes.map((n) => (
                <p key={n} className="barrier-note">
                  {n}
                </p>
              ))}
              <button className="enter" onClick={() => setShowResults(true)}>
                Review role results →
              </button>
              <p className="ins-note">
                Illustrative teaching values. The campus health center
                represents the shared hospital service; an elevated wing models
                replacement care on this site.
              </p>
            </section>
          </div>
          {selected && (
            <div className="scanner">
              <div className="scanner-head">
                <strong>{selected.asset.name}</strong>
                <button className="x" onClick={() => setSelectedId(null)}>
                  ✕
                </button>
              </div>
              <dl className="consequence-list">
                <dt>Water above threshold</dt>
                <dd>{selected.floodDepth.toFixed(2)} m</dd>
                <dt>Damage</dt>
                <dd>{(selected.damage * 100).toFixed(0)}%</dd>
                <dt>Loss</dt>
                <dd>{formatUSD(selected.loss)}</dd>
                <dt>Power</dt>
                <dd>{selected.powered ? "Online" : "Offline"}</dd>
              </dl>
            </div>
          )}
          {showResults && (
            <div className="modal-back">
              <section
                className="modal sandbox-results"
                role="dialog"
                aria-modal="true"
                aria-label="Role results"
              >
                <button
                  className="x"
                  onClick={() => setShowResults(false)}
                  aria-label="Close results"
                >
                  ✕
                </button>
                <p className="eyebrow">
                  {scenario.label.toUpperCase()} STORM · ROLE REFLECTION
                </p>
                <h2>{activeRole!.name}</h2>
                <RoleMetrics
                  role={role as SandboxRoleId}
                  result={result}
                  baseline={baseline}
                  insurance={insurance}
                />
                <dl className="consequence-list">
                  <dt>Spent</dt>
                  <dd>{formatUSD(result.spend)}</dd>
                  <dt>Loss prevented</dt>
                  <dd>{formatUSD(result.lossAvoided)}</dd>
                  <dt>Benefit / cost</dt>
                  <dd>{ratio === null ? "—" : `${ratio.toFixed(2)}×`}</dd>
                </dl>
                <h3>Your decisions</h3>
                {role === "underwriter" && (
                  <p>
                    Policy rate {(terms.rate * 100).toFixed(1)}% · deductible{" "}
                    {(terms.deductible * 100).toFixed(0)}% · limit{" "}
                    {(terms.limit * 100).toFixed(0)}% · highest-risk zones:{" "}
                    {terms.highRisk}
                  </p>
                )}
                <ol>
                  {actions
                    .filter((a) => ids.includes(a.id))
                    .map((a) => (
                      <li key={a.id}>
                        {a.label} · {formatUSD(a.cost)}
                      </li>
                    ))}
                </ol>
                {ids.length === 0 && <p>No funded actions selected.</p>}
                <div className="reflection-task">
                  <p>
                    Compare with someone who had another role in this same
                    storm. Which outcomes did your agency improve? Which needs
                    must another agency address?
                  </p>
                </div>
                <button className="enter" onClick={() => setShowResults(false)}>
                  Revise decisions
                </button>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
function RoleMetrics({
  role,
  result,
  baseline,
  insurance,
}: {
  role: SandboxRoleId;
  result: ReturnType<typeof evaluateSandbox>;
  baseline: ReturnType<typeof evaluateSandbox>;
  insurance: ReturnType<typeof runUnderwriter> | null;
}) {
  if (role === "underwriter" && insurance)
    return (
      <dl className="consequence-list">
        <dt>Premium income / year</dt>
        <dd>{formatUSD(insurance.income)}</dd>
        <dt>Expected claims / year</dt>
        <dd>{formatUSD(insurance.claims)}</dd>
        <dt>First-year expected profit</dt>
        <dd>{formatUSD(insurance.expectedProfit)}</dd>
        <dt>Profit in this flood year</dt>
        <dd>{formatUSD(insurance.eventProfit)}</dd>
        <dt>Share of exposure insured</dt>
        <dd>{(insurance.coverage * 100).toFixed(0)}%</dd>
        <dt>Claims in this flood</dt>
        <dd>{formatUSD(insurance.eventClaims)}</dd>
      </dl>
    );
  if (role === "utility")
    return (
      <dl className="consequence-list">
        <dt>Power downtime (weighted days)</dt>
        <dd>{result.powerDowntime.toFixed(1)} d</dd>
        <dt>Downtime reduced</dt>
        <dd>
          {Math.max(0, baseline.powerDowntime - result.powerDowntime).toFixed(
            1,
          )}{" "}
          d
        </dd>
        <dt>Buildings receiving power</dt>
        <dd>
          {
            result.assets.filter(
              (a) => a.asset.kind !== "substation" && a.powered,
            ).length
          }{" "}
          / 7
        </dd>
        <dt>Hospital power</dt>
        <dd>
          {result.assets.find((a) => a.asset.id === "hospital")?.powered
            ? "Online"
            : "Offline"}
        </dd>
      </dl>
    );
  return (
    <>
      <dl className="consequence-list">
        <dt>People protected*</dt>
        <dd>{result.peopleProtected.toLocaleString()}</dd>
        <dt>People impacted*</dt>
        <dd>{result.peopleAffected.toLocaleString()}</dd>
        <dt>Flood damage</dt>
        <dd>{formatUSD(result.loss)}</dd>
        {role === "emergency" && (
          <>
            <dt>Recovery time</dt>
            <dd>{result.recoveryDays} d</dd>
            <dt>Hospital functional</dt>
            <dd>
              {result.assets.find((a) => a.asset.id === "hospital")?.functional
                ? "Yes"
                : "No"}
            </dd>
            <dt>Routes blocked</dt>
            <dd>
              {result.roads.filter((r) => !r.passable).length} /{" "}
              {result.roads.length}
            </dd>
          </>
        )}
      </dl>
      <p className="ins-note">
        *Occupants and service impacts; not a count of unique people. Repairs
        speed recovery but do not prevent initial damage.
      </p>
    </>
  );
}
