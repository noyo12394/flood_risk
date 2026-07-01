import { useEffect, useMemo, useRef, useState } from 'react'
import { Scene } from './three/Scene'
import {
  MITIGATIONS,
  SCENARIOS,
  TOTAL_BUDGET,
  type MitigationId,
} from './game/data'
import { EMPTY_MITIGATIONS, formatUSD, type MitigationState } from './game/model'
import {
  DECISIONS,
  DRILL_DURATION,
  PREP_MITIGATIONS,
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
  const [prep, setPrep] = useState<MitigationState>({ ...EMPTY_MITIGATIONS })

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!
  const prepSpend = useMemo(
    () => MITIGATIONS.filter((m) => PREP_MITIGATIONS.includes(m.id) && prep[m.id]).reduce((s, m) => s + m.cost, 0),
    [prep],
  )

  // Live-phase mutable state.
  const effectsRef = useRef<DrillEffects>(emptyEffects())
  const maxWaterRef = useRef(-3)
  const snapshotRef = useRef<DrillSnapshot | null>(null)
  const [clock, setClock] = useState(0)
  const [snapshot, setSnapshot] = useState<DrillSnapshot | null>(null)
  const [resolved, setResolved] = useState<Record<string, { note: string; expired?: boolean }>>({})
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
      const snap = evaluate(prep, effectsRef.current, river, maxWaterRef.current)
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
          if (d.onlyIf && !d.onlyIf(prep)) continue
          if (tt > d.deadline) {
            next[d.id] = { note: `${d.title}: no action taken.`, expired: true }
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
    setSnapshot(null)
    setPhase('live')
  }

  function finish(final: DrillSnapshot) {
    const baseline = evaluate(EMPTY_MITIGATIONS, emptyEffects(), scenario.peakElevation, 0)
    const card = scoreDrill(effectsRef.current, prepSpend, final, baseline)
    setScorecard(card)
    setPhase('debrief')
  }

  function choose(decisionId: string, optionId: string) {
    const decision = DECISIONS.find((d) => d.id === decisionId)!
    const option = decision.options.find((o) => o.id === optionId)!
    const water = snapshotRef.current?.campusWater ?? 0
    const note = option.apply(effectsRef.current, water)
    setResolved((prev) => ({ ...prev, [decisionId]: { note } }))
  }

  function togglePrep(id: MitigationId) {
    setPrep((m) => ({ ...m, [id]: !m[id] }))
  }

  // What the 3D scene should show right now.
  const sceneAssets = snapshot?.assets ?? evaluate(prep, emptyEffects(), -1.5, -3).assets
  const sceneRoads = snapshot?.roads ?? evaluate(prep, emptyEffects(), -1.5, -3).roads
  const sceneWater = snapshot?.campusWater ?? -1.5

  const activeDecisions = DECISIONS.filter(
    (d) => t01 >= d.at && t01 <= d.deadline && !resolved[d.id] && (!d.onlyIf || d.onlyIf(prep)),
  )

  const selected = snapshot?.assets.find((a) => a.asset.id === selectedId) ?? null
  const remaining = TOTAL_BUDGET - prepSpend - effectsRef.current.spend
  const clockLabel = formatClock(t01)

  return (
    <div className="app">
      <div className="scene-wrap">
        <Scene
          assets={sceneAssets}
          roads={sceneRoads}
          waterElev={sceneWater}
          mitigations={prep}
          selectedId={selectedId}
          showAllLabels={phase === 'prep'}
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
            <p className="eyebrow">LIVE DRILL · PRE-EVENT BRIEFING</p>
            <h2>Prepare the campus</h2>
            <p className="prep-lead">
              A storm is forecast. Commit your <b>capital mitigations</b> now within a{' '}
              {formatUSD(TOTAL_BUDGET)} budget. Once the drill starts the clock runs, the river rises,
              and you'll make emergency calls in real time (barriers, evacuation, sandbagging) before
              the deadlines.
            </p>

            <div className="prep-scenario">
              <span>Storm severity</span>
              <div className="chips">
                {SCENARIOS.map((s) => (
                  <button key={s.id} className={`chip ${s.id === scenarioId ? 'on' : ''}`} onClick={() => setScenarioId(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="prep-mits">
              {MITIGATIONS.filter((m) => PREP_MITIGATIONS.includes(m.id)).map((m) => {
                const on = prep[m.id]
                return (
                  <button key={m.id} className={`mit ${on ? 'on' : ''}`} onClick={() => togglePrep(m.id)}>
                    <span className="tick" style={{ borderColor: '#31c48d', background: on ? '#31c48d' : 'transparent' }} />
                    <span className="mtext">
                      <strong>{m.short}</strong>
                      <em>{m.description}</em>
                    </span>
                    <span className="mcost">{formatUSD(m.cost)}</span>
                  </button>
                )
              })}
            </div>

            <div className="prep-foot">
              <div className={`budget ${prepSpend > TOTAL_BUDGET ? 'bad' : ''}`}>
                <span className="lbl">Remaining before live spend</span>
                <strong>{formatUSD(TOTAL_BUDGET - prepSpend)}</strong>
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
              <LiveStat label="Routes blocked" value={`${snapshot.routesBlocked}`} danger={snapshot.routesBlocked > 0} />
              <LiveStat label="Budget left" value={formatUSD(remaining)} danger={remaining < 0} />
            </div>
          </div>

          {/* Decision cards */}
          <div className="decisions">
            {activeDecisions.map((d) => {
              const left = (d.deadline - t01) / (d.deadline - d.at)
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
                        <button key={o.id} className={`d-opt ${o.cost ? 'costed' : ''}`} onClick={() => choose(d.id, o.id)}>
                          {o.label}
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

      {/* ---------- DEBRIEF ---------- */}
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

            <div className="score-lines">
              {scorecard.lines.map((l) => (
                <div key={l.label} className={`score-line ${l.ok ? 'ok' : 'bad'}`}>
                  <span className="sl-ico">{l.ok ? '✓' : '✕'}</span>
                  <span className="sl-label">{l.label}</span>
                  <span className="sl-detail">{l.detail}</span>
                </div>
              ))}
            </div>

            <p className="takeaway">
              {scorecard.grade === 'F'
                ? 'The flood overwhelmed the campus. Pre-committing elevation/drainage and making the emergency calls earlier changes exposure and vulnerability — not the storm.'
                : scorecard.lossAvoided > 0
                  ? `You avoided ${formatUSD(scorecard.lossAvoided)} of the ${formatUSD(scorecard.baselineLoss)} a do-nothing response would have cost — by changing exposure and vulnerability before and during the event.`
                  : 'Timing matters: decisions taken after the water arrives have little effect. Try deploying barriers and ordering evacuation earlier.'}
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
