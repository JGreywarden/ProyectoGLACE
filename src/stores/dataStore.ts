import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// these types will migrate to features/narrative/types.ts and features/competition/types.ts
// once those features are scaffolded

export interface EventConditions {
  bond?:    number
  fatigue?: number
  stress?:  number
  traits?:  string[]
  season?:  number
  week?:    number
  flags?:   string[]
}

export interface NarrativeOption {
  id:      string
  text:    string
  effects: Record<string, unknown>
}

export interface NarrativeEvent {
  id:          string
  type:        string
  title:       string
  description: string
  conditions: {
    minBond?:        number
    maxBond?:        number
    minFatigue?:     number
    maxFatigue?:     number
    minStress?:      number
    maxStress?:      number
    requiredTraits?: string[]
    season?:         number
    week?:           number
    flags?:          string[]
  }
  options: NarrativeOption[]
}

export interface Judge {
  id:          string
  name:        string
  nationality: string
  /** per-component PCS bias; positive = generous, negative = strict */
  bias: Partial<Record<'sk' | 'tr' | 'pe' | 'co' | 'in', number>>
}

type CacheKey = 'narrative-events' | 'judges'

interface DataStoreState {
  cache:           Map<CacheKey, unknown[]>
  getEventsByType: (type: string) => NarrativeEvent[]
  getRandomEvent:  (conditions: EventConditions) => NarrativeEvent | null
  getJudgePanel:   (competitionId: string) => Judge[]
  preloadAll:      () => Promise<void>
}

async function fetchJson<T>(path: string): Promise<T[]> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`failed to load ${path}: ${res.status}`)
  return res.json() as Promise<T[]>
}

function matchesConditions(event: NarrativeEvent, ctx: EventConditions): boolean {
  const c = event.conditions
  if (c.minBond    !== undefined && (ctx.bond    ?? 0) < c.minBond)    return false
  if (c.maxBond    !== undefined && (ctx.bond    ?? 0) > c.maxBond)    return false
  if (c.minFatigue !== undefined && (ctx.fatigue ?? 0) < c.minFatigue) return false
  if (c.maxFatigue !== undefined && (ctx.fatigue ?? 0) > c.maxFatigue) return false
  if (c.minStress  !== undefined && (ctx.stress  ?? 0) < c.minStress)  return false
  if (c.maxStress  !== undefined && (ctx.stress  ?? 0) > c.maxStress)  return false
  if (c.season !== undefined && ctx.season !== c.season) return false
  if (c.week   !== undefined && ctx.week   !== c.week)   return false
  if (c.requiredTraits?.length) {
    const active = ctx.traits ?? []
    if (!c.requiredTraits.every((t) => active.includes(t))) return false
  }
  if (c.flags?.length) {
    const active = ctx.flags ?? []
    if (!c.flags.every((f) => active.includes(f))) return false
  }
  return true
}

// deterministic integer hash of a string — used to seed judge panel selection
function strHash(s: string): number {
  return [...s].reduce((acc, c) => (Math.imul(31, acc) + c.charCodeAt(0)) | 0, 0)
}

export const useDataStore = create<DataStoreState>()(
  devtools(
    (set, get) => ({
      cache: new Map<CacheKey, unknown[]>(),

      getEventsByType: (type) => {
        const events = get().cache.get('narrative-events') as NarrativeEvent[] | undefined
        return events?.filter((e) => e.type === type) ?? []
      },

      getRandomEvent: (conditions) => {
        const events = get().cache.get('narrative-events') as NarrativeEvent[] | undefined
        if (!events?.length) return null
        const matching = events.filter((e) => matchesConditions(e, conditions))
        if (!matching.length) return null
        return matching[Math.floor(Math.random() * matching.length)]
      },

      getJudgePanel: (competitionId) => {
        const judges = get().cache.get('judges') as Judge[] | undefined
        if (!judges?.length) return []
        const seed = strHash(competitionId)
        // ISU panels: 9 judges total, scores from 7 used (top and bottom trimmed)
        return [...judges]
          .sort((a, b) => (strHash(a.id + seed) >>> 0) - (strHash(b.id + seed) >>> 0))
          .slice(0, 9)
      },

      preloadAll: async () => {
        const [eventsResult, judgesResult] = await Promise.allSettled([
          fetchJson<NarrativeEvent>('/data/narrative-events.json'),
          fetchJson<Judge>('/data/judges.json'),
        ])
        const cache = new Map<CacheKey, unknown[]>(get().cache)
        if (eventsResult.status === 'fulfilled') {
          cache.set('narrative-events', eventsResult.value)
        } else {
          console.warn('dataStore: narrative-events.json not found; events disabled')
        }
        if (judgesResult.status === 'fulfilled') {
          cache.set('judges', judgesResult.value)
        } else {
          console.warn('dataStore: judges.json not found; competition panels disabled')
        }
        set({ cache }, false, 'data/preloadAll')
      },
    }),
    { name: 'glace/data' },
  ),
)
