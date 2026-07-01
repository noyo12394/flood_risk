import { useMemo, useState } from 'react'
import { Scene } from './three/Scene'
import { Drill } from './Drill'
import {
  ASSETS,
  MITIGATIONS,
  ROLES,
  SCENARIOS,
  TOTAL_BUDGET,
  type MitigationId,
  type RoleId,
} from './game/data'
import {
  EMPTY_MITIGATIONS,
  formatUSD,
  runModel,
  type MitigationState,
} from './game/model'
import { DAMAGE_COLORS } from './three/Building'

export default function App() {
  const [mode, setMode] = useState<'menu' | 'sandbox' | 'drill'>('menu')
  const [scenarioId, setScenarioId] = useState<(typeof SCENARIOS)[number]['id']>('major')
  const [role, setRole] = useState<RoleId>('engineer')
  const [mitigations, setMitigations] = useState<MitigationState>({ ...EMPTY_MITIGATIONS })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showReflection, setShowReflection] = useState(false)

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!

  const mitigationSpend = useMemo(
    () =>
      MITIGATIONS.filter((m) => mitigations[m.id]).reduce((s, m) => s + m.cost, 0),
    [mitigations],
  )

  const result = useMemo(() => {
    const r = runModel(scenario, mitigations)
    r.mitigationSpend = mitigationSpend
    return r
  }, [scenario, mitigations, mitigationSpend])

  const baseline = useMemo(() => runModel(scenario, EMPTY_MITIGATIONS), [scenario])

  const budgetRemaining = TOTAL_BUDGET - mitigationSpend
  const overBudget = budgetRemaining < 0
  const activeRole = ROLES.find((r) => r.id === role)!
  const selected = result.assets.find((a) => a.asset.id === selectedId) ?? null

  function toggle(id: MitigationId) {
    setMitigations((m) => ({ ...m, [id]: !m[id] }))
  }

  if (mode === 'drill') return <Drill onExit={() => setMode('menu')} />

  return (
    <div className="app">
      <div className="scene-wrap">
        <Scene
          assets={result.assets}
          roads={result.roads}
          waterElev={result.effectiveWaterElev}
          mitigations={mitigations}
          selectedId={selectedId}
          showAllLabels={false}
          onSelect={setSelectedId}
        />
      </div>

      {mode === 'menu' && (
        <IntroScreen onSandbox={() => setMode('sandbox')} onDrill={() => setMode('drill')} />
      )}

      {mode === 'sandbox' && (
        <>
          {/* ---- Top bar: title + scenario + budget ---- */}
          <header className="topbar">
            <div className="brand">
              <button className="logo logo-btn" title="Back to menu" onClick={() => setMode('menu')}>
                ≈
              </button>
              <div>
                <h1>FloodRisk FYRE</h1>
                <p>Sandbox · Lehigh Resilience Challenge</p>
              </div>
            </div>

            <div className="scenario-picker">
              <span className="lbl">Flood scenario</span>
              <div className="chips">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    className={`chip ${s.id === scenarioId ? 'on' : ''}`}
                    onClick={() => setScenarioId(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`budget ${overBudget ? 'bad' : ''}`}>
              <span className="lbl">Budget remaining</span>
              <strong>{formatUSD(budgetRemaining)}</strong>
              <div className="bar">
                <div
                  className="fill"
                  style={{ width: `${Math.max(0, Math.min(100, (budgetRemaining / TOTAL_BUDGET) * 100))}%` }}
                />
              </div>
            </div>
          </header>

          {/* ---- Left: roles + mitigations ---- */}
          <aside className="left">
            <section className="panel">
              <h2>Choose your role</h2>
              <div className="roles">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    className={`role ${r.id === role ? 'on' : ''}`}
                    style={{ ['--rc' as string]: r.color }}
                    onClick={() => setRole(r.id)}
                  >
                    <strong>{r.name}</strong>
                    <span>{r.tagline}</span>
                  </button>
                ))}
              </div>
              <p className="focus">
                <span style={{ color: activeRole.color }}>◆</span> {activeRole.focus}
              </p>
            </section>

            <section className="panel">
              <h2>Mitigations</h2>
              <div className="mits">
                {MITIGATIONS.map((m) => {
                  const on = mitigations[m.id]
                  const roleColor = ROLES.find((r) => r.id === m.role)!.color
                  const mine = m.role === role
                  return (
                    <button
                      key={m.id}
                      className={`mit ${on ? 'on' : ''} ${mine ? 'mine' : ''}`}
                      onClick={() => toggle(m.id)}
                    >
                      <span className="tick" style={{ borderColor: roleColor, background: on ? roleColor : 'transparent' }} />
                      <span className="mtext">
                        <strong>{m.short}</strong>
                        <em>{m.description}</em>
                      </span>
                      <span className="mcost">{formatUSD(m.cost)}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          </aside>

          {/* ---- Right: CAT dashboard ---- */}
          <aside className="right">
            <section className="panel">
              <h2>CAT model dashboard</h2>
              <p className="equation">
                hazard <b>×</b> exposure <b>×</b> vulnerability <b>=</b> risk
              </p>

              <div className="grid">
                <Stat label="Hazard" value={`${result.effectiveWaterElev.toFixed(1)} m`} sub={`peak ${scenario.peakElevation.toFixed(1)} m`} />
                <Stat label="Assets exposed" value={`${result.assets.filter((a) => a.floodDepth > 0).length}/${ASSETS.length}`} sub={formatUSD(result.exposedValue)} />
                <Stat label="Vulnerability" value={`${Math.round(result.vulnerabilityIndex * 100)}%`} sub="mean damage" />
                <Stat label="Total loss" value={formatUSD(result.totalLoss)} sub="this event" danger />
                <Stat label="People affected" value={`${result.peopleAffected.toLocaleString()}`} sub="students / patients" />
                <Stat label="Max downtime" value={`${result.maxDowntimeDays} d`} sub="worst asset" />
                <Stat
                  label="Buildings dark"
                  value={`${result.buildingsUnpowered}`}
                  sub={result.dryButDark > 0 ? `${result.dryButDark} dry & offline` : 'grid cascade'}
                  danger={result.buildingsUnpowered > 0}
                />
              </div>

              <RolePanel role={role} result={result} scenario={scenario} budgetRemaining={budgetRemaining} />

              <div className="statusline">
                <Badge on={result.powerOut} okLabel="Power online" badLabel="POWER OUT" />
                <Badge on={result.evacuationBlocked} okLabel="Routes open" badLabel="EVAC BLOCKED" />
                <Badge on={result.criticalDown > 0} okLabel="Lifelines OK" badLabel={`${result.criticalDown} lifeline down`} />
              </div>

              <button className="reflect-btn" onClick={() => setShowReflection(true)}>
                Run before / after reflection →
              </button>
            </section>
          </aside>

          {/* ---- Object scanner ---- */}
          {selected && (
            <div className="scanner">
              <div className="scanner-head" style={{ borderColor: DAMAGE_COLORS[selected.state] }}>
                <span className="dot" style={{ background: DAMAGE_COLORS[selected.state] }} />
                <strong>{selected.asset.name}</strong>
                <button className="x" onClick={() => setSelectedId(null)}>
                  ✕
                </button>
              </div>
              <div className="scan-rows">
                <ScanRow k="Damage state" v={selected.state.toUpperCase()} color={DAMAGE_COLORS[selected.state]} />
                <ScanRow k="Flood depth" v={selected.floodDepth > 0 ? `${selected.floodDepth.toFixed(2)} m` : 'dry'} />
                <ScanRow
                  k="Grid power"
                  v={selected.powered ? 'powered' : selected.dryButDark ? 'DARK (cascade)' : 'OUT'}
                  color={selected.powered ? '#31c48d' : '#ff4d5e'}
                />
                <ScanRow k="Ground elev." v={`${selected.groundElev.toFixed(1)} m`} />
                <ScanRow k="Threshold" v={`${selected.threshold.toFixed(1)} m`} />
                <ScanRow k="Est. loss" v={formatUSD(selected.loss)} />
                <ScanRow k="Downtime" v={`${selected.downtimeDays} days`} />
                <ScanRow k="People" v={`${selected.peopleAffected.toLocaleString()}`} />
              </div>
            </div>
          )}

          <div className="hint">Drag to orbit · scroll to zoom · click an asset to scan it</div>

          {showReflection && (
            <Reflection
              result={result}
              baseline={baseline}
              spend={mitigationSpend}
              scenarioLabel={scenario.label}
              onClose={() => setShowReflection(false)}
            />
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, sub, danger }: { label: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <div className={`stat ${danger ? 'danger' : ''}`}>
      <span className="s-label">{label}</span>
      <span className="s-value">{value}</span>
      {sub && <span className="s-sub">{sub}</span>}
    </div>
  )
}

function ScanRow({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="scan-row">
      <span>{k}</span>
      <b style={color ? { color } : undefined}>{v}</b>
    </div>
  )
}

function Badge({ on, okLabel, badLabel }: { on: boolean; okLabel: string; badLabel: string }) {
  return <span className={`badge ${on ? 'bad' : 'ok'}`}>{on ? badLabel : okLabel}</span>
}

function RolePanel({
  role,
  result,
  scenario,
  budgetRemaining,
}: {
  role: RoleId
  result: ReturnType<typeof runModel>
  scenario: (typeof SCENARIOS)[number]
  budgetRemaining: number
}) {
  if (role === 'analyst') {
    return (
      <div className="role-panel">
        <RoleRow k="Annual probability" v={`${(scenario.annualProbability * 100).toFixed(1)}% (1-in-${scenario.returnPeriod})`} />
        <RoleRow k="Expected annual loss" v={formatUSD(result.expectedAnnualLoss)} />
        <RoleRow k="Suggested premium" v={formatUSD(result.suggestedPremium)} />
        <RoleRow k="Modelled payout" v={formatUSD(result.totalLoss)} />
      </div>
    )
  }
  if (role === 'budget') {
    return (
      <div className="role-panel">
        <RoleRow k="Mitigation spend" v={formatUSD(result.mitigationSpend)} />
        <RoleRow k="Damage this event" v={formatUSD(result.totalLoss)} danger />
        <RoleRow k="Loss avoided" v={formatUSD(result.avoidedLoss)} good />
        <RoleRow k="Budget remaining" v={formatUSD(budgetRemaining)} danger={budgetRemaining < 0} />
      </div>
    )
  }
  if (role === 'manager') {
    const blocked = result.roads.filter((r) => !r.passable).length
    return (
      <div className="role-panel">
        <RoleRow k="Routes blocked" v={`${blocked}/${result.roads.length}`} danger={blocked > 0} />
        <RoleRow k="Power status" v={result.powerOut ? 'OUT' : 'online'} danger={result.powerOut} />
        <RoleRow k="People affected" v={result.peopleAffected.toLocaleString()} />
        <RoleRow k="Critical facilities down" v={`${result.criticalDown}`} danger={result.criticalDown > 0} />
      </div>
    )
  }
  // engineer
  return (
    <div className="role-panel">
      <RoleRow k="Hazard reduced by" v={`${result.hazardReduction.toFixed(1)} m`} good />
      <RoleRow k="Loss avoided" v={formatUSD(result.avoidedLoss)} good />
      <RoleRow k="Assets still flooding" v={`${result.assets.filter((a) => a.floodDepth > 0).length}`} />
      <RoleRow k="Portfolio vulnerability" v={`${Math.round(result.vulnerabilityIndex * 100)}%`} />
    </div>
  )
}

function RoleRow({ k, v, good, danger }: { k: string; v: string; good?: boolean; danger?: boolean }) {
  return (
    <div className="role-row">
      <span>{k}</span>
      <b className={good ? 'good' : danger ? 'dng' : ''}>{v}</b>
    </div>
  )
}

function IntroScreen({ onSandbox, onDrill }: { onSandbox: () => void; onDrill: () => void }) {
  return (
    <div className="intro">
      <div className="intro-inner">
        <p className="eyebrow">CAT MODEL · FIELD SIMULATION</p>
        <h1>
          FloodRisk <span>FYRE</span>
        </h1>
        <p className="sub">Lehigh Resilience Challenge</p>
        <p className="lead">
          A flood is inbound on the riverside campus. Make the calls before and during the event and
          learn why <b>hazard × exposure × vulnerability = risk</b>.
        </p>

        <div className="mode-cards">
          <button className="mode-card drill" onClick={onDrill}>
            <span className="mc-tag">⏱ REAL-TIME</span>
            <strong>Live Drill</strong>
            <span className="mc-desc">
              A clock runs and the flood rises in real time. Pre-commit capital mitigations, then make
              timed emergency decisions before the deadlines — and get a resilience score.
            </span>
            <span className="mc-go">Start the drill →</span>
          </button>
          <button className="mode-card" onClick={onSandbox}>
            <span className="mc-tag alt">◇ EXPLORE</span>
            <strong>Sandbox</strong>
            <span className="mc-desc">
              No clock. Switch roles, toggle mitigations across four flood scenarios, scan assets and
              compare before/after loss at your own pace.
            </span>
            <span className="mc-go">Open the lab →</span>
          </button>
        </div>

        <p className="foot">Educational MVP · simplified fragility &amp; cost data</p>
      </div>
    </div>
  )
}

function Reflection({
  result,
  baseline,
  spend,
  scenarioLabel,
  onClose,
}: {
  result: ReturnType<typeof runModel>
  baseline: ReturnType<typeof runModel>
  spend: number
  scenarioLabel: string
  onClose: () => void
}) {
  const avoided = Math.max(0, baseline.totalLoss - result.totalLoss)
  const roi = spend > 0 ? avoided / spend : 0
  const noMit = spend === 0
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Before / after — {scenarioLabel} flood</h2>
        <div className="ba">
          <div className="ba-col">
            <span className="ba-h">No mitigation</span>
            <b className="ba-loss">{formatUSD(baseline.totalLoss)}</b>
            <span>loss · {baseline.assets.filter((a) => a.floodDepth > 0).length} assets hit</span>
          </div>
          <div className="ba-arrow">→</div>
          <div className="ba-col good">
            <span className="ba-h">Your plan</span>
            <b className="ba-loss">{formatUSD(result.totalLoss)}</b>
            <span>loss · {result.assets.filter((a) => a.floodDepth > 0).length} assets hit</span>
          </div>
        </div>

        <div className="ba-stats">
          <div>
            <span>Loss avoided</span>
            <b className="good">{formatUSD(avoided)}</b>
          </div>
          <div>
            <span>Mitigation spend</span>
            <b>{formatUSD(spend)}</b>
          </div>
          <div>
            <span>Return on mitigation</span>
            <b className={roi >= 1 ? 'good' : 'dng'}>{noMit ? '—' : `${roi.toFixed(1)}×`}</b>
          </div>
        </div>

        <p className="takeaway">
          {noMit
            ? 'You ran the flood with no mitigation. The same flood can cost far less — go back and change exposure and vulnerability, not the hazard.'
            : result.effectiveWaterElev > baseline.effectiveWaterElev - 0.01 && avoided > 0
              ? `The flood was just as deep, yet your risk dropped by ${formatUSD(avoided)} because you changed what was exposed and how vulnerable it was — not the hazard itself.`
              : `You lowered the water reaching campus and hardened key assets, cutting loss by ${formatUSD(avoided)} for ${formatUSD(spend)} spent.`}
        </p>

        <button className="enter" onClick={onClose}>
          Keep planning
        </button>
      </div>
    </div>
  )
}
