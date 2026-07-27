import { useEffect, useMemo, useRef, useState } from 'react'
import { Scene } from './three/Scene'
import { SCENARIOS } from './game/data'
import { EMPTY_MITIGATIONS, formatUSD } from './game/model'
import {
  DECISIONS,
  DRILL_DURATION,
  EMERGENCY_BUDGET,
  STORM_COST_MULT,
  decisionCost,
  emptyEffects,
  evaluate,
  riverElevAt,
  scoreDrill,
  type DrillEffects,
  type DrillSnapshot,
  type Scorecard,
} from './game/drill'
import { DAMAGE_COLORS } from './three/Building'

type Phase = 'prep' | 'live' | 'debrief'

export function Drill({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('prep')
  const [scenarioId, setScenarioId] = useState<(typeof SCENARIOS)[number]['id']>('major')

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!

  // Live-phase mutable state.
  const effectsRef = useRef<DrillEffects>(emptyEffects())
  const maxWaterRef = useRef(-3)
  const snapshotRef = useRef<DrillSnapshot | null>(null)
  const [clock, setClock] = useState(0)
  const [snapshot, setSnapshot] = useState<DrillSnapshot | null>(null)
  const [resolved, setResolved] = useState<Record<string, { note: string; expired?: boolean }>>({})
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [spend, setSpend] = useState(0)

  const t01 = Math.min(1, clock / DRILL_DURATION)

  // The drill clock.
  useEffect(() => {
    if (phase !== 'live') return
    let raf = 0
    const start = performance.now()
    const loop = (now: number) => {
      const elapsed = (now - start) / 1000
      const tt = Math.min(1, elapsed / DRILL_DURATION)
      const river = riverElevAt(tt, scenario.peakElevation)
      const snap = evaluate(effectsRef.current, river, maxWaterRef.current)
      maxWaterRef.current = snap.maxCampusWater
      snapshotRef.current = snap
      setClock(elapsed)
      setSnapshot(snap)

      // Auto-expire any decision whose deadline passed unanswered.
      setResolved((prev) => {
        let changed = false
        const next = { ...prev }
        for (const d of DECISIONS) {
          if (next[d.id]) continue
          if (tt > d.deadline) {
            next[d.id] = { note: `${d.title} — no action taken.`, expired: true }
            changed = true
          }
        }
        return changed ? next : prev
      })

      if (tt >= 1) {
        finish(snap)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function beginDrill() {
    effectsRef.current = emptyEffects()
    maxWaterRef.current = -3
    setResolved({})
    setClock(0)
    setSpend(0)
    setSnapshot(null)
    setPhase('live')
  }

  function finish(final: DrillSnapshot) {
    const baseline = evaluate(emptyEffects(), scenario.peakElevation, 0)
    setScorecard(scoreDrill(effectsRef.current, final, baseline))
    setPhase('debrief')
  }

  function choose(decisionId: string, optionId: string) {
    const decision = DECISIONS.find((d) => d.id === decisionId)!
    const option = decision.options.find((o) => o.id === optionId)!
    const water = snapshotRef.current?.campusWater ?? 0
    const cost = option.costed ? decisionCost(decision, scenarioId) : 0
    const note = option.apply(effectsRef.current, water, cost)
    setSpend(effectsRef.current.spend)
    setResolved((prev) => ({ ...prev, [decisionId]: { note } }))
  }

  // What the 3D scene should show right now.
  const dryBaseline = useMemo(() => evaluate(emptyEffects(), -1.5, -3), [])
  const sceneAssets = snapshot?.assets ?? dryBaseline.assets
  const sceneRoads = snapshot?.roads ?? dryBaseline.roads
  const sceneWater = snapshot?.campusWater ?? -1.5

  const activeDecisions = DECISIONS.filter((d) => t01 >= d.at && t01 <= d.deadline && !resolved[d.id])

  const selected = snapshot?.assets.find((a) => a.asset.id === selectedId) ?? null
  const remaining = EMERGENCY_BUDGET - spend
  const clockLabel = formatClock(t01)

  return (
    <div className="app">
      <div className="scene-wrap">
        <Scene
          assets={sceneAssets}
          roads={sceneRoads}
          waterElev={sceneWater}
          mitigations={EMPTY_MITIGATIONS}
          selectedId={selectedId}
          showAllLabels={false}
          onSelect={setSelectedId}
        />
      </div>

      {/* ---------- PREP ---------- */}
      {phase === 'prep' && (
        <div className="intro">
          <div className="prep">
            <button className="menu-back" onClick={onExit}>
              ← Menu
            </button>
            <p className="eyebrow">LIVE DRILL · EMERGENCY OPERATIONS</p>
            <h2>Short-term response drill</h2>
            <p className="prep-lead">
              A storm is inbound. This is a <b>short-term emergency</b> — no time to build anything.
              You have an emergency budget of <b>{formatUSD(EMERGENCY_BUDGET)}</b> and three levers to
              use as the water rises. <b>Costs scale with the storm</b>, and acting earlier helps more.
            </p>

            <div className="prep-scenario">
              <span>Storm severity (cost ×{STORM_COST_MULT[scenarioId].toFixed(1)})</span>
              <div className="chips">
                {SCENARIOS.map((s) => (
                  <button key={s.id} className={`chip ${s.id === scenarioId ? 'on' : ''}`} onClick={() => setScenarioId(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="prep-mits">
              {DECISIONS.map((d) => (
                <div key={d.id} className="mit" style={{ cursor: 'default' }}>
                  <span className="mtext">
                    <strong>{d.options[0].label}</strong>
                    <em>{d.situation}</em>
                  </span>
                  <span className="mcost">{formatUSD(decisionCost(d, scenarioId))}</span>
                </div>
              ))}
            </div>

            <div className="prep-foot">
              <div className="budget">
                <span className="lbl">Emergency budget</span>
                <strong>{formatUSD(EMERGENCY_BUDGET)}</strong>
              </div>
              <button className="enter" onClick={beginDrill}>
                Start the drill ⏱ →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- LIVE HUD ---------- */}
      {phase === 'live' && snapshot && (
        <>
          <div className="drill-top">
            <button className="menu-back sm" onClick={onExit}>
              ✕
            </button>
            <div className="clock">
              <span className="clbl">{clockLabel.label}</span>
              <strong>{clockLabel.time}</strong>
              <div className="clock-bar">
                <div className="clock-fill" style={{ width: `${t01 * 100}%` }} />
              </div>
            </div>
            <div className="gauge">
              <span className="clbl">Water at campus ▲</span>
              <strong>{Math.max(0, snapshot.campusWater).toFixed(1)} m</strong>
            </div>
            <div className="live-stats">
              <LiveStat label="Loss so far" value={formatUSD(snapshot.totalLoss)} danger />
              <LiveStat label="People at risk" value={snapshot.peopleAffected.toLocaleString()} />
              <LiveStat label="Power" value={snapshot.powerOut ? 'OUT' : 'ON'} danger={snapshot.powerOut} />
              <LiveStat label="Buildings dark" value={`${snapshot.buildingsDark}`} danger={snapshot.buildingsDark > 0} />
              <LiveStat label="Budget left" value={formatUSD(remaining)} danger={remaining < 0} />
            </div>
          </div>

          {/* Decision cards */}
          <div className="decisions">
            {activeDecisions.map((d) => {
              const left = (d.deadline - t01) / (d.deadline - d.at)
              const cost = decisionCost(d, scenarioId)
              return (
                <div key={d.id} className="decision">
                  <div className="deadline">
                    <div className="deadline-fill" style={{ width: `${Math.max(0, left) * 100}%` }} />
                  </div>
                  <div className="d-body">
                    <strong>⚠ {d.title}</strong>
                    <p>{d.situation}</p>
                    <div className="d-opts">
                      {d.options.map((o) => (
                        <button key={o.id} className={`d-opt ${o.costed ? 'costed' : ''}`} onClick={() => choose(d.id, o.id)}>
                          {o.label}
                          {o.costed && <span className="d-cost"> · {formatUSD(cost)}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Latest resolution note */}
          <ResolutionFeed resolved={resolved} />

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
                <ScanRow k="Damage" v={selected.state.toUpperCase()} color={DAMAGE_COLORS[selected.state]} />
                <ScanRow k="Flood depth" v={selected.floodDepth > 0 ? `${selected.floodDepth.toFixed(2)} m` : 'dry'} />
                <ScanRow
                  k="Grid power"
                  v={selected.powered ? 'powered' : selected.dryButDark ? 'DARK (cascade)' : 'OUT'}
                  color={selected.powered ? '#31c48d' : '#ff4d5e'}
                />
                <ScanRow k="Est. loss" v={formatUSD(selected.loss)} />
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- DEBRIEF (grade book) ---------- */}
      {phase === 'debrief' && scorecard && (
        <div className="modal-back">
          <div className="modal scorecard">
            <p className="eyebrow">DRILL COMPLETE · {scenario.label.toUpperCase()} FLOOD</p>
            <div className="score-hero">
              <div className={`score-ring g-${scorecard.grade[0]}`}>
                <span className="score-num">{scorecard.score}</span>
                <span className="score-of">/ 100</span>
              </div>
              <div className="score-side">
                <span className="grade">{scorecard.grade}</span>
                <span className="grade-lbl">Resilience grade</span>
              </div>
            </div>

            <div className="gradebook">
              <div className="gb-head">Grade book — how your {scorecard.score}/100 was earned</div>
              {scorecard.gradebook.map((l) => (
                <div key={l.label} className="gb-line">
                  <div className="gb-top">
                    <span>{l.label}</span>
                    <b className={l.earned >= l.max * 0.6 ? 'good' : l.earned <= l.max * 0.25 ? 'dng' : ''}>
                      {l.earned} / {l.max} pts
                    </b>
                  </div>
                  <div className="gb-bar">
                    <div
                      className="gb-fill"
                      style={{
                        width: `${(l.earned / l.max) * 100}%`,
                        background: l.earned >= l.max * 0.6 ? '#31c48d' : l.earned <= l.max * 0.25 ? '#ff4d5e' : '#f6c945',
                      }}
                    />
                  </div>
                  <em className="gb-detail">{l.detail}</em>
                </div>
              ))}
            </div>

            <p className="takeaway">
              {scorecard.grade === 'F'
                ? `The response fell short. Deploy the temporary barriers and move people earlier — before the water passes ~1.8 m — and add pumps to hold the level down. Bigger, permanent fixes belong in the Decision Lab.`
                : scorecard.lossAvoided > 0
                  ? `You avoided ${formatUSD(scorecard.lossAvoided)} of the ${formatUSD(scorecard.baselineLoss)} a do-nothing response would have cost, and moved ${scorecard.peopleSafe.toLocaleString()} people to safety. Earlier action scores higher still.`
                  : `Timing matters: actions taken after the water arrives do little. Try barriers and evacuation earlier next run.`}
            </p>

            <div className="score-actions">
              <button className="enter alt" onClick={() => setPhase('prep')}>
                ↻ Re-run drill
              </button>
              <button className="enter" onClick={onExit}>
                Back to menu
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'live' && <div className="hint">Click assets to scan · answer the alerts before the timer runs out</div>}
    </div>
  )
}

function LiveStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="live-stat">
      <span>{label}</span>
      <b className={danger ? 'dng' : ''}>{value}</b>
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

function ResolutionFeed({ resolved }: { resolved: Record<string, { note: string; expired?: boolean }> }) {
  const entries = Object.entries(resolved)
  if (entries.length === 0) return null
  const last = entries[entries.length - 1][1]
  return <div className={`feed ${last.expired ? 'expired' : ''}`}>{last.note}</div>
}

function formatClock(t01: number): { label: string; time: string } {
  // Map the drill to a storm timeline: T-6h at start, peak near the end.
  const hours = -6 + t01 * 9 // -6h .. +3h
  const abs = Math.abs(hours)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  const sign = hours < 0 ? 'T-' : 'T+'
  const time = `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const label = hours < -0.1 ? 'Storm approaching' : hours < 2 ? 'Flood peak' : 'Waters receding'
  return { label, time }
}
