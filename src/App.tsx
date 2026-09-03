import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { Scene } from './three/Scene'
import { Drill } from './Drill'
import { Compare } from './Compare'
import { Insurance } from './Insurance'
import { portfolioSummary } from './game/insurance'
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
  const [mode, setMode] = useState<'menu' | 'sandbox' | 'drill' | 'compare' | 'insurance'>('menu')
  const [scenarioId, setScenarioId] = useState<(typeof SCENARIOS)[number]['id']>('major')
  const [role, setRole] = useState<RoleId>('engineer')
  const [mitigations, setMitigations] = useState<MitigationState>({ ...EMPTY_MITIGATIONS })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showReflection, setShowReflection] = useState(false)
  const [showSandboxGuide, setShowSandboxGuide] = useState(false)
  const [controlsCollapsed, setControlsCollapsed] = useState(false)
  const [controlsPosition, setControlsPosition] = useState<{ x: number; y: number } | null>(null)
  const dragOffset = useRef({ x: 0, y: 0 })

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

  function openSandbox() {
    setMode('sandbox')
    setShowSandboxGuide(true)
  }

  function startControlsDrag(e: PointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 900) return
    const panel = e.currentTarget.parentElement
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const width = rect.width
    const move = (event: globalThis.PointerEvent) => {
      setControlsPosition({
        x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - dragOffset.current.x)),
        y: Math.max(88, Math.min(window.innerHeight - 62, event.clientY - dragOffset.current.y)),
      })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  if (mode === 'drill') return <Drill onExit={() => setMode('menu')} />
  if (mode === 'compare') return <Compare onExit={() => setMode('menu')} />
  if (mode === 'insurance') return <Insurance onExit={() => setMode('menu')} />

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
        <IntroScreen
          onSandbox={openSandbox}
          onDrill={() => setMode('drill')}
          onCompare={() => setMode('compare')}
          onInsurance={() => setMode('insurance')}
        />
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
          <aside className={`hud-left movable-controls ${controlsCollapsed ? 'collapsed' : ''}`} style={controlsPosition ? { left: controlsPosition.x, top: controlsPosition.y } : undefined}>
            <div className="controls-handle" onPointerDown={startControlsDrag} title="Drag to move controls">
              <span>Move controls</span>
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setControlsCollapsed((v) => !v)} title={controlsCollapsed ? 'Expand controls' : 'Collapse controls'}>
                {controlsCollapsed ? '+' : '−'}
              </button>
            </div>
            <div className="controls-body">
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
            <div className="action-impact">
              <strong>What your choices changed</strong>
              <span>{mitigationSpend === 0 ? 'No mitigations selected; this is the baseline event.' : `${formatUSD(result.avoidedLoss)} loss avoided for ${formatUSD(mitigationSpend)} invested.`}</span>
              <span>{result.powerOut ? 'The campus power network still fails.' : baseline.powerOut ? 'Your plan keeps the power network online.' : 'The power network remains online.'}</span>
              <span>{baseline.peopleAffected - result.peopleAffected > 0 ? `${(baseline.peopleAffected - result.peopleAffected).toLocaleString()} fewer people affected.` : `${result.peopleAffected.toLocaleString()} people remain affected.`}</span>
            </div>
            </div>
          </aside>

          {/* ---- Right: CAT dashboard ---- */}
          <aside className="hud-right">
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

          <div className="hint">Drag the scene to orbit · drag “Move controls” to reposition the panel · click an asset to inspect it</div>

          <button className="sandbox-help" onClick={() => setShowSandboxGuide(true)}>How to use</button>

          {showReflection && (
            <Reflection
              result={result}
              baseline={baseline}
              spend={mitigationSpend}
              scenarioLabel={scenario.label}
              onClose={() => setShowReflection(false)}
            />
          )}
          {showSandboxGuide && <SandboxGuide onClose={() => setShowSandboxGuide(false)} />}
        </>
      )}
    </div>
  )
}

function SandboxGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back tutorial-back">
      <div className="modal sandbox-guide">
        <span className="guide-kicker">Sandbox walkthrough</span>
        <h2>Change one thing, then read the system</h2>
        <div className="guide-steps">
          <div><b>1</b><span><strong>Choose a flood</strong>Start with Moderate, then compare the same plan under Major or Extreme.</span></div>
          <div><b>2</b><span><strong>Choose a role</strong>The role changes which outcomes the dashboard emphasizes; it does not change the physics.</span></div>
          <div><b>3</b><span><strong>Toggle one mitigation</strong>Watch loss, people affected, downtime and the power badges update immediately.</span></div>
          <div><b>4</b><span><strong>Inspect the consequence</strong>Click a building for its local result, then run the before/after reflection for the portfolio result.</span></div>
        </div>
        <p className="takeaway">Try raising the substation during a Major flood. A dry building can still go dark when a shared lifeline fails.</p>
        <button className="enter" onClick={onClose}>Start exploring</button>
      </div>
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
    const ins = portfolioSummary()
    return (
      <div className="role-panel">
        <RoleRow k="Portfolio EAL (pure premium)" v={formatUSD(ins.totalEal)} />
        <RoleRow k="Actuarially-fair premium" v={formatUSD(ins.totalPremium)} />
        <RoleRow k="Combined ratio" v={`${(ins.combinedRatio * 100).toFixed(0)}%`} good={ins.combinedRatio < 1} danger={ins.combinedRatio >= 1} />
        <RoleRow k={`PML (1-in-${scenario.returnPeriod})`} v={formatUSD(result.totalLoss)} />
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

function IntroScreen({
  onSandbox,
  onDrill,
  onCompare,
  onInsurance,
}: {
  onSandbox: () => void
  onDrill: () => void
  onCompare: () => void
  onInsurance: () => void
}) {
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
              Start at Day -5, pause to make each response choice, and watch actions finish as the
              flood approaches. Protect people and lifelines, then see your resilience score.
            </span>
            <span className="mc-go">Start the drill →</span>
          </button>
          <button className="mode-card compare" onClick={onCompare}>
            <span className="mc-tag cmp">⚖ COMPARE</span>
            <strong>Decision Lab</strong>
            <span className="mc-desc">
              Plan A vs Plan B. Predict, then see the implications of each side-by-side — guided
              dilemmas that teach the concepts, plus a free builder to compare your own two plans.
            </span>
            <span className="mc-go">Compare plans →</span>
          </button>
          <button className="mode-card insurance" onClick={onInsurance}>
            <span className="mc-tag ins">$ PRICE RISK</span>
            <strong>Insurance Desk</strong>
            <span className="mc-desc">
              Price the flood risk like an actuary: expected annual loss, premiums, deductibles, PML
              and the combined ratio — with a coverage / affordability / profitability score.
            </span>
            <span className="mc-go">Open the desk →</span>
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

        <p className="foot">FYRE v1.1 · Educational model with simplified fragility &amp; cost data</p>
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
