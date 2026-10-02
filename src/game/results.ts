import { SCENARIOS } from './data'
export interface TeamResult {
  version: 1
  id: string
  team: string
  session: string
  stormId: (typeof SCENARIOS)[number]['id']
  score: number
  lossAvoided: number
  peopleProtected: number
  budgetSpent: number
  decisions: { label: string; cost: number; day: number; note: string }[]
  createdAt: string
}
export interface ResultStore { read(): TeamResult[]; save(result: TeamResult): boolean }
export interface StorageAdapter { getItem(key: string): string | null; setItem(key: string, value: string): void }
const KEY = 'fyre.drill.results.v1'
export function parseResult(raw: string): TeamResult {
  if (raw.length > 30000) throw new Error('Result is too large.')
  const r = JSON.parse(raw)
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  if (!r || r.version !== 1 || typeof r.id !== 'string' || !r.id || r.id.length > 100 || typeof r.team !== 'string' || !r.team.trim() || r.team.length > 80 || typeof r.session !== 'string' || r.session.length > 40 || !SCENARIOS.some(s => s.id === r.stormId) || !finite(r.score) || r.score > 100 || !finite(r.lossAvoided) || !finite(r.peopleProtected) || !finite(r.budgetSpent) || r.budgetSpent > 3000000 || typeof r.createdAt !== 'string' || !Number.isFinite(Date.parse(r.createdAt)) || !Array.isArray(r.decisions) || r.decisions.length > 4 || !r.decisions.every((d: any) => d && typeof d.label === 'string' && d.label.length <= 100 && finite(d.cost) && typeof d.day === 'number' && Number.isFinite(d.day) && typeof d.note === 'string' && d.note.length <= 600)) throw new Error('Paste a valid FloodRiskFYRE result copied from a completed drill.')
  return r as TeamResult
}
export function createLocalResultStore(storage: () => StorageAdapter): ResultStore {
  let fallback: TeamResult[] = []
  return {
    read() {
      try {
        const raw = JSON.parse(storage().getItem(KEY) ?? '[]')
        if (!Array.isArray(raw)) return fallback
        const valid: TeamResult[] = []
        for (const item of raw.slice(-1000)) { try { valid.push(parseResult(JSON.stringify(item))) } catch { /* Ignore a damaged record. */ } }
        fallback = valid
      } catch { /* Private browsing or full storage: keep this page's runs in memory. */ }
      return [...fallback]
    },
    save(result) {
      const valid = parseResult(JSON.stringify(result))
      const next = [...this.read().filter(r => r.id !== valid.id), valid].slice(-1000)
      fallback = next
      try { storage().setItem(KEY, JSON.stringify(next)); return true } catch { return false }
    },
  }
}
export const resultStore = createLocalResultStore(() => window.localStorage)
