import { useMemo, useState } from 'react'
import { Scene } from './three/Scene'
import { ASSETS } from './game/data'
import { EMPTY_MITIGATIONS, computeAssets, computeRoads, formatUSD } from './game/model'
import {
  DEFAULT_LEVERS,
  runInsurance,
  type Levers,
  type Strategy,
} from './game/insurance'

const STRATEGIES: { id: Strategy; label: string; blurb: string }[] = [
  { id: 'flat', label: 'Flat rate', blurb: 'Charge a fixed % of value — ignores hazard.' },
  { id: 'fair', label: 'Actuarially fair', blurb: 'EAL × (1 + loading) + expense.' },
  { id: 'capped', label: 'Affordability-capped', blurb: 'Fair premium, capped at the rate-on-line limit.' },
]

export function Insurance({ onExit }: { onExit: () => void }) {
  const [lv, setLv] = useState<Levers>({ ...DEFAULT_LEVERS })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const result = useMemo(() => runInsurance(lv), [lv])

  // A calm, dry campus for context (no flood, all powered).
  const dry = useMemo(() => {
    const assets = computeAssets(EMPTY_MITIGATIONS, -3)
    const roads = computeRoads(EMPTY_MITIGATIONS, -3)
    return { assets, roads }
  }, [])

  // Colour each building green (premium covers EAL) or red (under-priced).
  const ringOverride = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of result.lines) m[l.asset.id] = l.coversEal ? '#31c48d' : '#ff4d5e'
    return m
  }, [result])

  const set = (patch: Partial<Levers>) => setLv((p) => ({ ...p, ...patch }))
  const selected = result.lines.find((l) => l.asset.id === selectedId) ?? null

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
            <p>Price the flood risk — EAL, premiums, and the combined ratio</p>
          </div>
        </div>
      </div>

      {/* ---- Pricing levers (left) ---- */}
      <aside className="ins-left">
        <section className="panel">
          <h2>Pricing strategy</h2>
          <div className="ins-strats">
            {STRATEGIES.map((s) => (
              <button key={s.id} className={`ins-strat ${lv.strategy === s.id ? 'on' : ''}`} onClick={() => set({ strategy: s.id })}>
                <strong>{s.label}</strong>
                <span>{s.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Levers</h2>
          <Slider label="Loading factor" value={lv.loadingFactor} min={0} max={0.6} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ loadingFactor: v })} hint="Expenses + cat reserve + profit above the pure premium." />
          <Slider label="Deductible" value={lv.deductiblePct} min={0} max={0.1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ deductiblePct: v })} hint="Share of value the policyholder pays first." />
          <Slider label="Co-insurance" value={lv.coinsurancePct} min={0.5} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ coinsurancePct: v })} hint="Insurer's share of covered loss." />
          {lv.strategy === 'flat' && (
            <Slider label="Flat rate" value={lv.flatRatePct} min={0.001} max={0.02} step={0.001} fmt={(v) => `${(v * 100).toFixed(1)}%`} onChange={(v) => set({ flatRatePct: v })} hint="Premium as a flat % of insured value." />
          )}
        </section>
      </aside>

      {/* ---- Portfolio scorecard (right) ---- */}
      <aside className="ins-right">
        <section className="panel">
          <h2>Portfolio scorecard</h2>
          <div className="ins-hero">
            <div className={`score-ring g-${result.grade[0]}`}>
              <span className="score-num">{Math.round(result.composite)}</span>
              <span className="score-of">/ 100</span>
            </div>
            <div className="score-side">
              <span className="grade">{result.grade}</span>
              <span className="grade-lbl">Composite</span>
            </div>
          </div>

          <ScoreBar label="Coverage" value={result.coverageScore} note={`${result.nCovers}/${ASSETS.length} cover EAL`} />
          <ScoreBar label="Affordability" value={result.affordabilityScore} note={`${result.nAffordable}/${ASSETS.length} within cap`} />
          <ScoreBar label="Profitability" value={result.profitabilityScore} note={`ratio target 1.20×`} />

          <div className="ins-rows">
            <Row k="Total EAL (pure)" v={formatUSD(result.totalEal)} />
            <Row k="Total premium" v={formatUSD(result.totalPremium)} good={result.totalPremium >= result.totalEal} danger={result.totalPremium < result.totalEal} />
            <Row k="Net income" v={formatUSD(result.netIncome)} good={result.netIncome > 0} danger={result.netIncome < 0} />
            <Row k="Combined ratio" v={pct(result.portfolioCombinedRatio)} good={result.netIncome > 0} danger={result.netIncome <= 0} note={result.netIncome > 0 ? 'underwriting profit' : 'underwriting loss'} />
          </div>
          <p className="ins-note">
            <b>Combined ratio &lt; 100%</b> = the book makes an underwriting profit. Push it down with
            loading, but keep premiums covering EAL and under the affordability cap.
          </p>
        </section>
      </aside>

      {/* ---- Per-building breakdown ---- */}
      {selected && (
        <div className="scanner ins-scanner">
          <div className="scanner-head" style={{ borderColor: selected.coversEal ? '#31c48d' : '#ff4d5e' }}>
            <span className="dot" style={{ background: selected.coversEal ? '#31c48d' : '#ff4d5e' }} />
            <strong>{selected.asset.name}</strong>
            <button className="x" onClick={() => setSelectedId(null)}>
              ✕
            </button>
          </div>
          <div className="scan-rows">
            <Row k="Insured value" v={formatUSD(selected.asset.value)} />
            <Row k="EAL (pure premium)" v={formatUSD(selected.eal)} />
            <Row k="PML 100-yr" v={formatUSD(selected.pml100)} />
            <Row k="PML 500-yr" v={formatUSD(selected.pml500)} />
            <div className="scan-div" />
            <Row k="Premium charged" v={formatUSD(selected.comp.netPremium)} strong />
            <Row k="Loading" v={formatUSD(selected.comp.loadingAmount)} />
            <Row k="Deductible" v={formatUSD(selected.comp.deductibleUsd)} />
            <Row k="Rate on line" v={`${(selected.rateOnLine * 100).toFixed(2)}%`} />
            <Row k="Loss ratio" v={pct(selected.comp.lossRatio)} />
            <Row k="Combined ratio" v={pct(selected.comp.combinedRatio)} good={selected.coversEal} danger={!selected.coversEal} />
            <div className="scan-badges">
              <span className={`badge ${selected.coversEal ? 'ok' : 'bad'}`}>{selected.coversEal ? 'covers EAL' : 'under-priced'}</span>
              <span className={`badge ${selected.affordable ? 'ok' : 'bad'}`}>{selected.affordable ? 'affordable' : 'over cap'}</span>
            </div>
          </div>
        </div>
      )}

      <div className="hint">Green ring = premium covers its EAL · red = under-priced · click a building for its premium breakdown</div>
    </div>
  )
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
