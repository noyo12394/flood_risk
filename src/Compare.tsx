import { useMemo, useState } from 'react'
import { Scene } from './three/Scene'
import { useDraggable } from './useDraggable'
import { MITIGATIONS, SCENARIOS, TOTAL_BUDGET, type MitigationId } from './game/data'
import { EMPTY_MITIGATIONS, formatUSD, type MitigationState } from './game/model'
import {
  DILEMMAS,
  comparePlans,
  outcomeBullets,
  runPlan,
  type Plan,
  type PlanRun,
  type ScenarioId,
} from './game/compare'

type Tab = 'guided' | 'free'
type Focus = 'a' | 'b'

export function Compare({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<Tab>('guided')
  const [focus, setFocus] = useState<Focus>('a')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <div className="app">
      <div className="lab-top">
        <button className="menu-back sm" onClick={onExit}>
          ✕
        </button>
        <div className="brand">
          <div>
            <h1>Decision Lab</h1>
            <p>Plan A vs Plan B — see the implications, then decide</p>
          </div>
        </div>
        <div className="lab-tabs">
          <button className={`chip ${tab === 'guided' ? 'on' : ''}`} onClick={() => setTab('guided')}>
            Guided dilemmas
          </button>
          <button className={`chip ${tab === 'free' ? 'on' : ''}`} onClick={() => setTab('free')}>
            Free compare
          </button>
        </div>
      </div>

      {tab === 'guided' ? (
        <Guided focus={focus} setFocus={setFocus} selectedId={selectedId} setSelectedId={setSelectedId} />
      ) : (
        <FreeCompare focus={focus} setFocus={setFocus} selectedId={selectedId} setSelectedId={setSelectedId} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Guided dilemmas
// ---------------------------------------------------------------------------

function Guided({
  focus,
  setFocus,
  selectedId,
  setSelectedId,
}: {
  focus: Focus
  setFocus: (f: Focus) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
}) {
  const [index, setIndex] = useState(0)
  const [prediction, setPrediction] = useState<Focus | null>(null)
  const [revealed, setRevealed] = useState(false)
  const drag = useDraggable({ x: 24, y: 150 })

  const d = DILEMMAS[index]
  const runA = useMemo(() => runPlan({ scenarioId: d.planA.scenarioId, mitigations: d.planA.mitigations }), [d])
  const runB = useMemo(() => runPlan({ scenarioId: d.planB.scenarioId, mitigations: d.planB.mitigations }), [d])
  const cmp = useMemo(() => comparePlans(runA, runB, d.planA.label, d.planB.label), [runA, runB, d])
  const focused = focus === 'a' ? runA : runB
  const focusedPlan = focus === 'a' ? d.planA : d.planB

  function reset() {
    setPrediction(null)
    setRevealed(false)
    setFocus('a')
    setSelectedId(null)
  }
  function go(delta: number) {
    const n = Math.max(0, Math.min(DILEMMAS.length - 1, index + delta))
    setIndex(n)
    reset()
  }

  const recommendedFocus: Focus = d.recommended

  return (
    <>
      <div className="scene-wrap">
        <Scene
          assets={focused.result.assets}
          roads={focused.result.roads}
          waterElev={focused.result.effectiveWaterElev}
          mitigations={focusedPlan.mitigations}
          selectedId={selectedId}
          showAllLabels={false}
          onSelect={setSelectedId}
        />
      </div>

      <div className="lab-panel movable" style={drag.style}>
        <div className="panel-drag" onPointerDown={drag.onHandleDown} title="Drag to move">
          ⠿ Move
        </div>
        <div className="dil-head">
          <span className="dil-count">
            Dilemma {index + 1} / {DILEMMAS.length}
          </span>
          <span className="dil-concept">{d.concept}</span>
        </div>
        <h2>{d.title}</h2>
        <p className="dil-sit">{d.situation}</p>

        <div className="plan-tabs">
          <PlanChip label={d.planA.label} tag="Plan A" active={focus === 'a'} onClick={() => setFocus('a')} recommended={revealed && recommendedFocus === 'a'} />
          <PlanChip label={d.planB.label} tag="Plan B" active={focus === 'b'} onClick={() => setFocus('b')} recommended={revealed && recommendedFocus === 'b'} />
        </div>
        <p className="view-hint">Viewing {focus === 'a' ? 'Plan A' : 'Plan B'} in 3D — click the other chip to flip the campus.</p>

        {!revealed ? (
          <div className="predict">
            <span className="predict-q">Which trade-off would you choose for this objective?</span>
            <div className="predict-btns">
              <button className="predict-btn" onClick={() => { setPrediction('a'); setRevealed(true) }}>
                Plan A
              </button>
              <button className="predict-btn" onClick={() => { setPrediction('b'); setRevealed(true) }}>
                Plan B
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="verdict neutral">
              You chose <b>{prediction === 'a' ? d.planA.label : d.planB.label}</b>. For the stated objective, the model recommends{' '}
              <b>{recommendedFocus === 'a' ? d.planA.label : d.planB.label}</b>; the comparison below shows what each plan gains and gives up.
            </div>

            <div className="reveal-cols">
              <RevealCol tag="Plan A" label={d.planA.label} run={runA} recommended={recommendedFocus === 'a'} />
              <RevealCol tag="Plan B" label={d.planB.label} run={runB} recommended={recommendedFocus === 'b'} />
            </div>

            <p className="insight">{cmp.insight}</p>
            <p className="teaching">
              <b>Concept — {d.concept}.</b> {d.teaching}
            </p>

            <div className="dil-nav">
              <button className="enter alt" onClick={() => reset()}>
                ↻ Retry
              </button>
              {index < DILEMMAS.length - 1 ? (
                <button className="enter" onClick={() => go(1)}>
                  Next dilemma →
                </button>
              ) : (
                <button className="enter" onClick={onExitToStart}>
                  Done
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )

  function onExitToStart() {
    setIndex(0)
    reset()
  }
}

function PlanChip({
  label,
  tag,
  active,
  recommended,
  onClick,
}: {
  label: string
  tag: string
  active: boolean
  recommended: boolean
  onClick: () => void
}) {
  return (
    <button className={`plan-chip ${active ? 'on' : ''} ${recommended ? 'recommended' : ''}`} onClick={onClick}>
      <span className="pc-tag">{tag}{recommended ? ' · model recommendation' : ''}</span>
      <strong>{label}</strong>
    </button>
  )
}

function RevealCol({ tag, label, run, recommended }: { tag: string; label: string; run: PlanRun; recommended: boolean }) {
  return (
    <div className={`reveal-col ${recommended ? 'recommended' : ''}`}>
      <span className="rc-tag">{tag}{recommended ? ' · recommended for this objective' : ''}</span>
      <strong>{label}</strong>
      <ul>
        {outcomeBullets(run).map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Free compare
// ---------------------------------------------------------------------------

function FreeCompare({
  focus,
  setFocus,
  selectedId,
  setSelectedId,
}: {
  focus: Focus
  setFocus: (f: Focus) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
}) {
  const [planA, setPlanA] = useState<Plan>({ scenarioId: 'major', mitigations: emptyMit() })
  const [planB, setPlanB] = useState<Plan>({ scenarioId: 'major', mitigations: mitSet('raiseSubstation', 'improveDrainage') })

  const runA = useMemo(() => runPlan(planA), [planA])
  const runB = useMemo(() => runPlan(planB), [planB])
  const cmp = useMemo(() => comparePlans(runA, runB), [runA, runB])
  const focused = focus === 'a' ? runA : runB
  const focusedPlan = focus === 'a' ? planA : planB

  return (
    <>
      <div className="scene-wrap">
        <Scene
          assets={focused.result.assets}
          roads={focused.result.roads}
          waterElev={focused.result.effectiveWaterElev}
          mitigations={focusedPlan.mitigations}
          selectedId={selectedId}
          showAllLabels={false}
          onSelect={setSelectedId}
        />
      </div>

      <PlanEditor side="A" plan={planA} setPlan={setPlanA} run={runA} focused={focus === 'a'} onFocus={() => setFocus('a')} />
      <PlanEditor side="B" plan={planB} setPlan={setPlanB} run={runB} focused={focus === 'b'} onFocus={() => setFocus('b')} />

      <div className="scoreboard">
        <table>
          <thead>
            <tr>
              <th></th>
              <th className={cmp.recommend === 'a' ? 'rec' : ''}>Plan A</th>
              <th className={cmp.recommend === 'b' ? 'rec' : ''}>Plan B</th>
            </tr>
          </thead>
          <tbody>
            {cmp.metrics.map((m) => (
              <tr key={m.label}>
                <td className="m-label">{m.label}</td>
                <td className={m.better === 'a' ? 'win' : ''}>{m.a}</td>
                <td className={m.better === 'b' ? 'win' : ''}>{m.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rec-banner">
          {cmp.recommend === 'tie' ? 'Too close to call' : `Recommended: Plan ${cmp.recommend.toUpperCase()}`}
        </div>
        <p className="insight">{cmp.insight}</p>
      </div>
    </>
  )
}

function PlanEditor({
  side,
  plan,
  setPlan,
  run,
  focused,
  onFocus,
}: {
  side: 'A' | 'B'
  plan: Plan
  setPlan: (p: Plan) => void
  run: PlanRun
  focused: boolean
  onFocus: () => void
}) {
  const overBudget = run.spend > TOTAL_BUDGET
  return (
    <aside className={`plan-editor ${side === 'A' ? 'left' : 'right'} ${focused ? 'focused' : ''}`}>
      <div className="pe-head" onClick={onFocus}>
        <span className="pe-tag">Plan {side}</span>
        <span className={`pe-view ${focused ? 'on' : ''}`}>{focused ? '● viewing' : 'view in 3D'}</span>
      </div>

      <div className="pe-scenario">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            className={`chip sm ${s.id === plan.scenarioId ? 'on' : ''}`}
            onClick={() => setPlan({ ...plan, scenarioId: s.id as ScenarioId })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="pe-mits">
        {MITIGATIONS.map((m) => {
          const on = plan.mitigations[m.id]
          return (
            <button
              key={m.id}
              className={`pe-mit ${on ? 'on' : ''}`}
              onClick={() => setPlan({ ...plan, mitigations: { ...plan.mitigations, [m.id]: !on } })}
            >
              <span className="tick sm" style={{ borderColor: '#4f8bff', background: on ? '#4f8bff' : 'transparent' }} />
              {m.short}
            </button>
          )
        })}
      </div>

      <div className="pe-foot">
        <span>Spend</span>
        <b className={overBudget ? 'dng' : ''}>{formatUSD(run.spend)}</b>
      </div>
    </aside>
  )
}

function emptyMit(): MitigationState {
  return { ...EMPTY_MITIGATIONS }
}
function mitSet(...ids: MitigationId[]): MitigationState {
  const m = emptyMit()
  for (const id of ids) m[id] = true
  return m
}
