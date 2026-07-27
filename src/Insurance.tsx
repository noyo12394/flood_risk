import { useMemo, useState } from 'react'
import { Scene } from './three/Scene'
import { ASSETS } from './game/data'
import { EMPTY_MITIGATIONS, computeAssets, computeRoads, formatUSD } from './game/model'
import {
  DEFAULT_LEVERS,
  GLOSSARY,
  INSURANCE_LEVELS,
  STRATEGY_MIN_LEVEL,
  runInsurance,
  type Levers,
  type Strategy,
} from './game/insurance'

const STRATEGIES: { id: Strategy; label: string; blurb: string }[] = [
  { id: 'flat', label: 'Flat rate', blurb: 'Charge a fixed % of value — ignores hazard.' },
  { id: 'hazard', label: 'Hazard-scaled', blurb: 'Scale the base rate using each building’s 100-year PML.' },
  { id: 'fair', label: 'Actuarially fair', blurb: 'EAL × (1 + loading) + expense.' },
  { id: 'capped', label: 'Affordability-capped', blurb: 'Fair premium, capped at the rate-on-line limit.' },
]

export function Insurance({ onExit }: { onExit: () => void }) {
  // Start at Level 1 with the only strategy you can price blind.
  const [lv, setLv] = useState<Levers>({ ...DEFAULT_LEVERS, strategy: 'flat' })
  const [level, setLevel] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showGlossary, setShowGlossary] = useState(false)

  const result = useMemo(() => runInsurance(lv), [lv])

  // Data gates: what the current level has unlocked.
  const hasHazard = level >= 2 // PML / flood exposure
  const hasEAL = level >= 3 // fragility → expected annual loss & fair pricing
  const hasAfford = level >= 4 // affordability caps
  const hasFinancial = level >= 5 // insured value, deductible and reinsurance

  // A calm, dry campus for context (no flood, all powered).
  const dry = useMemo(() => {
    const assets = computeAssets(EMPTY_MITIGATIONS, -3)
    const roads = computeRoads(EMPTY_MITIGATIONS, -3)
    return { assets, roads }
  }, [])

  // Colour buildings green/red by coverage once EAL is known; neutral before.
  const ringOverride = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of result.lines) m[l.asset.id] = hasEAL ? (l.coversEal ? '#31c48d' : '#ff4d5e') : '#5a6b86'
    return m
  }, [result, hasEAL])

  const set = (patch: Partial<Levers>) => setLv((p) => ({ ...p, ...patch }))
  const selected = result.lines.find((l) => l.asset.id === selectedId) ?? null
  const allocationLine = selected ?? result.lines[0]

  // Composite is built only from the score components the level has unlocked.
  const scoreParts: [number, number][] = []
  if (hasEAL) scoreParts.push([0.35, result.coverageScore], [0.35, result.profitabilityScore])
  if (hasAfford) scoreParts.push([0.3, result.affordabilityScore])
  const composite =
    scoreParts.length > 0
      ? Math.round((scoreParts.reduce((s, [w, v]) => s + w * v, 0) / scoreParts.reduce((s, [w]) => s + w, 0)) * 100)
      : null
  const grade =
    composite === null
      ? '—'
      : composite >= 90 ? 'A' : composite >= 80 ? 'B+' : composite >= 70 ? 'B' : composite >= 60 ? 'C' : composite >= 45 ? 'D' : 'F'

  function pickStrategy(s: Strategy) {
    if (level >= STRATEGY_MIN_LEVEL[s]) set({ strategy: s })
  }
  function unlockNext() {
    setLevel((l) => Math.min(5, l + 1))
  }

  return (
    <div className="app">
      <div className="scene-wrap">
        <Scene
          assets={dry.assets}
          roads={dry.roads}
          waterElev={-3}
          mitigations={EMPTY_MITIGATIONS}
          selectedId={selectedId}
          showAllLabels={false}
          ringOverride={ringOverride}
          onSelect={setSelectedId}
        />
      </div>

      <div className="lab-top">
        <button className="menu-back sm" onClick={onExit}>
          ✕
        </button>
        <div className="brand">
          <div>
            <h1>Insurance Desk</h1>
            <p>
              Price the flood risk — EAL, premiums, and the combined ratio ·{' '}
              <a className="glossary-link" role="button" tabIndex={0} onClick={() => setShowGlossary(true)}>
                Glossary of terms
              </a>
            </p>
          </div>
        </div>
      </div>

      {showGlossary && (
        <div className="modal-back" onClick={() => setShowGlossary(false)}>
          <div className="modal glossary-modal" onClick={(e) => e.stopPropagation()}>
            <div className="glossary-head">
              <h2>Glossary — the logic behind the numbers</h2>
              <button className="x" onClick={() => setShowGlossary(false)}>✕</button>
            </div>
            <div className="glossary-list">
              {GLOSSARY.map((g) => (
                <div key={g.term} className="glossary-item">
                  <strong>{g.term}</strong>
                  <span>{g.def}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Pricing levers (left) ---- */}
      <aside className="ins-left">
        <section className="panel">
          <h2>Data level {level} / 5</h2>
          <div className="ins-levels">
            {INSURANCE_LEVELS.map((L) => (
              <div key={L.level} className={`ins-level ${L.level === level ? 'on' : ''} ${L.level < level ? 'done' : ''} ${L.level > level ? 'locked' : ''}`}>
                <span className="ilv-dot">{L.level < level ? '✓' : L.level > level ? '🔒' : L.level}</span>
                <span className="ilv-text">
                  <strong>{L.title}</strong>
                  {L.level === level && <em>{L.unlocks}</em>}
                </span>
              </div>
            ))}
          </div>
          {level < 5 ? (
            <button className="ins-unlock" onClick={unlockNext}>
              Unlock Level {level + 1}: {INSURANCE_LEVELS[level].title} →
            </button>
          ) : (
            <p className="ins-note" style={{ marginTop: 10 }}>The black box is open. Change policy terms and trace who carries the loss.</p>
          )}
        </section>

        <section className="panel">
          <h2>Pricing strategy</h2>
          <div className="ins-strats">
            {STRATEGIES.map((s) => {
              const locked = level < STRATEGY_MIN_LEVEL[s.id]
              return (
                <button
                  key={s.id}
                  className={`ins-strat ${lv.strategy === s.id ? 'on' : ''} ${locked ? 'locked' : ''}`}
                  onClick={() => pickStrategy(s.id)}
                  disabled={locked}
                >
                  <strong>
                    {s.label}
                    {locked && <span className="ins-lock"> 🔒 Lv {STRATEGY_MIN_LEVEL[s.id]}</span>}
                  </strong>
                  <span>{s.blurb}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="panel">
          <h2>{hasFinancial ? 'Financial model levers' : 'Pricing inputs'}</h2>
          <Slider label="Loading factor" value={lv.loadingFactor} min={0} max={0.6} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ loadingFactor: v })} hint="Expenses, capital and margin above the pure premium." />
          {hasFinancial ? (
            <>
              <Slider label="Insured value" value={lv.insuredValuePct} min={0.5} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ insuredValuePct: v })} hint="Share of replacement value covered by the policy." />
              <Slider label="Deductible" value={lv.deductiblePct} min={0} max={0.1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ deductiblePct: v })} hint="The owner pays this share of insured value first." />
              <Slider label="Reinsurance ceded" value={lv.reinsurancePct} min={0} max={0.7} step={0.1} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ reinsurancePct: v })} hint="Moves claim volatility to a reinsurer, with a treaty cost." />
            </>
          ) : (
            <p className="ins-locked-copy">Insured value, deductible and reinsurance are held inside the actuarial black box until Level 5.</p>
          )}
          {(lv.strategy === 'flat' || lv.strategy === 'hazard') && (
            <Slider label="Flat rate" value={lv.flatRatePct} min={0.001} max={0.02} step={0.001} fmt={(v) => `${(v * 100).toFixed(1)}%`} onChange={(v) => set({ flatRatePct: v })} hint="Premium as a flat % of insured value." />
          )}
        </section>
      </aside>

      {/* ---- Portfolio scorecard (right) ---- */}
      <aside className="ins-right">
        <section className="panel">
          <h2>Portfolio scorecard</h2>
          <div className="ins-hero">
            <div className={`score-ring g-${grade[0]}`}>
              <span className="score-num">{composite === null ? '—' : composite}</span>
              <span className="score-of">/ 100</span>
            </div>
            <div className="score-side">
              <span className="grade">{grade}</span>
              <span className="grade-lbl">{composite === null ? 'reach Level 3' : hasAfford ? 'Composite' : 'partial (Lv 3)'}</span>
            </div>
          </div>

          {hasEAL ? (
            <>
              <ScoreBar label="Coverage" value={result.coverageScore} note={`${result.nCovers}/${ASSETS.length} cover EAL`} />
              <ScoreBar label="Profitability" value={result.profitabilityScore} note="ratio target 1.20×" />
            </>
          ) : (
            <LockedBar label="Coverage" need={3} />
          )}
          {hasAfford ? (
            <ScoreBar label="Affordability" value={result.affordabilityScore} note={`${result.nAffordable}/${ASSETS.length} within cap`} />
          ) : (
            <LockedBar label="Affordability" need={4} />
          )}

          <div className="ins-rows">
            <Row k="Total premium" v={formatUSD(result.totalPremium)} good={hasEAL && result.totalPremium >= result.totalEal} danger={hasEAL && result.totalPremium < result.totalEal} />
            {hasEAL ? (
              <>
                <Row k="Total EAL (pure)" v={formatUSD(result.totalEal)} />
                <Row k="Net income" v={formatUSD(result.netIncome)} good={result.netIncome > 0} danger={result.netIncome < 0} />
                <Row k="Combined ratio" v={pct(result.portfolioCombinedRatio)} good={result.netIncome > 0} danger={result.netIncome <= 0} note={result.netIncome > 0 ? 'underwriting profit' : 'underwriting loss'} />
              </>
            ) : (
              <Row k="Total EAL (pure)" v="🔒 unlock at Level 3" />
            )}
          </div>
          <p className="ins-note">
            {hasEAL
              ? 'Combined ratio < 100% = underwriting profit. Push it down with loading, but keep premiums covering EAL and under the affordability cap.'
              : 'Without loss data you are pricing blind. Unlock hazard, then vulnerability (EAL), to price the risk properly.'}
          </p>
        </section>
        {hasFinancial && (
          <section className="panel allocation-panel">
            <h2>100-year event: who pays?</h2>
            <p className="allocation-asset">{allocationLine.asset.name}{selected ? '' : ' (highest EAL)'}</p>
            <AllocationBar label="Owner" value={allocationLine.event100.ownerPays} total={allocationLine.event100.repairCost} color="#f6c945" />
            <AllocationBar label="Primary insurer" value={allocationLine.event100.insurerPays} total={allocationLine.event100.repairCost} color="#6c9bff" />
            <AllocationBar label="Reinsurer" value={allocationLine.event100.reinsurerPays} total={allocationLine.event100.repairCost} color="#31c48d" />
            <div className="ins-rows">
              <Row k="Repair cost" v={formatUSD(allocationLine.event100.repairCost)} />
              <Row k="Policy limit" v={formatUSD(allocationLine.comp.insuredValue)} />
              <Row k="Treaty cost / year" v={formatUSD(allocationLine.comp.reinsuranceCost)} />
            </div>
            <p className="ins-note allocation-note">
              {allocationLine.event100.underinsured
                ? 'The event loss exceeds the insured value. The owner carries the deductible and the uninsured gap.'
                : 'The policy limit contains this loss. Raising the deductible still shifts more of it to the owner.'}
            </p>
          </section>
        )}
      </aside>

      {/* ---- Per-building breakdown ---- */}
      {selected && (
        <div className="scanner ins-scanner">
          <div className="scanner-head" style={{ borderColor: hasEAL ? (selected.coversEal ? '#31c48d' : '#ff4d5e') : '#5a6b86' }}>
            <span className="dot" style={{ background: hasEAL ? (selected.coversEal ? '#31c48d' : '#ff4d5e') : '#5a6b86' }} />
            <strong>{selected.asset.name}</strong>
            <button className="x" onClick={() => setSelectedId(null)}>
              ✕
            </button>
          </div>
          <div className="scan-rows">
            {/* Level 1 — inventory (always) */}
            <Row k="Occupancy" v={occupancyLabel(selected.asset.kind)} />
            <Row k="Replacement value" v={formatUSD(selected.asset.value)} />
            <Row k="Occupants served" v={selected.asset.occupants.toLocaleString()} />
            {/* Level 2 — hazard */}
            <div className="scan-div" />
            {hasHazard ? (
              <>
                <Row k="PML 100-yr" v={formatUSD(selected.pml100)} />
                <Row k="PML 500-yr" v={formatUSD(selected.pml500)} />
                <Row
                  k="Risk multiplier"
                  v={`×${selected.riskMultiplier.toFixed(2)}`}
                  good={selected.riskMultiplier < 0.85}
                  danger={selected.riskMultiplier > 1.3}
                  note="vs. portfolio avg"
                />
              </>
            ) : (
              <Row k="Flood exposure / PML" v="🔒 Level 2" />
            )}
            {/* Level 3 — vulnerability / EAL */}
            {hasEAL ? (
              <>
                <Row k="Gross EAL" v={formatUSD(selected.eal)} />
                <Row k="Policy EAL" v={formatUSD(selected.comp.policyEal)} />
              </>
            ) : (
              <Row k="EAL (pure premium)" v="🔒 Level 3" />
            )}
            <div className="scan-div" />
            {/* Pricing (always visible once a premium is set) */}
            <Row k="Premium charged" v={formatUSD(selected.comp.netPremium)} strong />
            {hasFinancial && <Row k="Insured value" v={formatUSD(selected.comp.insuredValue)} />}
            {hasFinancial && <Row k="Deductible" v={formatUSD(selected.comp.deductibleUsd)} />}
            <Row k="Rate on line" v={`${(selected.rateOnLine * 100).toFixed(2)}%`} />
            {hasEAL && <Row k="Combined ratio" v={pct(selected.comp.combinedRatio)} good={selected.coversEal} danger={!selected.coversEal} />}
            <div className="scan-badges">
              {hasEAL && <span className={`badge ${selected.coversEal ? 'ok' : 'bad'}`}>{selected.coversEal ? 'covers EAL' : 'under-priced'}</span>}
              {hasAfford && <span className={`badge ${selected.affordable ? 'ok' : 'bad'}`}>{selected.affordable ? 'affordable' : 'over cap'}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="hint">
        {hasEAL
          ? 'Green ring = premium covers its EAL · red = under-priced · click a building for its breakdown'
          : `Level ${level}: unlock more data to see loss & price the risk · click a building for what you know so far`}
      </div>
    </div>
  )
}

function AllocationBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const width = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0
  return (
    <div className="allocation-row">
      <div className="isb-top">
        <span>{label}</span>
        <b>{formatUSD(value)}</b>
      </div>
      <div className="isb-track">
        <div className="isb-fill" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  )
}

function LockedBar({ label, need }: { label: string; need: number }) {
  return (
    <div className="ins-scorebar locked">
      <div className="isb-top">
        <span>{label}</span>
        <b>🔒 Lv {need}</b>
      </div>
      <div className="isb-track">
        <div className="isb-fill" style={{ width: '0%' }} />
      </div>
      <em>unlock the data to score this</em>
    </div>
  )
}

function occupancyLabel(kind: string): string {
  const m: Record<string, string> = {
    classroom: 'Academic / classroom',
    dorm: 'Residential dorm',
    hospital: 'Health center (critical)',
    library: 'Library',
    lab: 'Laboratory',
    admin: 'Administrative',
    substation: 'Utility / lifeline',
  }
  return m[kind] ?? kind
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  fmt,
  hint,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  fmt: (v: number) => string
  hint: string
  onChange: (v: number) => void
}) {
  return (
    <div className="ins-slider">
      <div className="ins-slider-top">
        <span>{label}</span>
        <b>{fmt(value)}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <em>{hint}</em>
    </div>
  )
}

function ScoreBar({ label, value, note }: { label: string; value: number; note: string }) {
  const pctv = Math.round(value * 100)
  const color = value >= 0.8 ? '#31c48d' : value >= 0.5 ? '#f6c945' : '#ff4d5e'
  return (
    <div className="ins-scorebar">
      <div className="isb-top">
        <span>{label}</span>
        <b style={{ color }}>{pctv}%</b>
      </div>
      <div className="isb-track">
        <div className="isb-fill" style={{ width: `${pctv}%`, background: color }} />
      </div>
      <em>{note}</em>
    </div>
  )
}

function Row({
  k,
  v,
  good,
  danger,
  strong,
  note,
}: {
  k: string
  v: string
  good?: boolean
  danger?: boolean
  strong?: boolean
  note?: string
}) {
  return (
    <div className="scan-row">
      <span>{k}{note ? <em className="row-note"> · {note}</em> : null}</span>
      <b className={good ? 'good' : danger ? 'dng' : ''} style={strong ? { fontSize: '14px' } : undefined}>
        {v}
      </b>
    </div>
  )
}

function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : '—'
}
