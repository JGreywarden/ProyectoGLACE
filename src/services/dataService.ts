// data service — lazy fetch + Map cache for all static game content
// pure module: no React, no Zustand; call from stores or features directly

import type { FaseSeason } from '@/types'
import type { InstallationId } from '@/types'
import traitsRaw from '@/data/traits.json'

// ─── event types ──────────────────────────────────────────────────────────────

export type EventType =
  | 'revelacion'
  | 'crisis'
  | 'decision_moral'
  | 'terceros'
  | 'cotidiano'
  | 'logro_compartido'

const EVENT_TYPES: readonly EventType[] = [
  'revelacion', 'crisis', 'decision_moral', 'terceros', 'cotidiano', 'logro_compartido',
]

const EVENT_PATHS: Record<EventType, string> = {
  revelacion:      '/data/events/revelacion.json',
  crisis:          '/data/events/crisis.json',
  decision_moral:  '/data/events/decision_moral.json',
  terceros:        '/data/events/terceros.json',
  cotidiano:       '/data/events/cotidiano.json',
  logro_compartido: '/data/events/logro_compartido.json',
}

// ─── narrative event types ────────────────────────────────────────────────────

export interface NarrativeEffects {
  vinculoDelta?:         number
  estresDelta?:          number
  fatigueDelta?:         number
  atributosDelta?:       Partial<Record<string, number>>
  narrativeFlags?:       Record<string, boolean | number | string>
  /** traitId that risks mutation if this option is chosen repeatedly */
  rasgoRiesgo?:          string | null
  probabilidadMutacion?: number
}

export interface NarrativeOption {
  id:      string
  texto:   string
  efectos: NarrativeEffects
}

export interface NarrativeEventConditions {
  minVinculo?:      number
  maxVinculo?:      number
  minEstres?:       number
  maxEstres?:       number
  minFatiga?:       number
  maxFatiga?:       number
  /** event only fires during one of these season phases */
  faseTemporada?:   FaseSeason[]
  /** all listed traitIds must be active */
  rasgosActivos?:   string[]
  /** all listed flags must be set in narrativeFlags */
  flagsRequeridos?: string[]
}

export interface NarrativeEvent {
  id:          string
  tipo:        EventType
  titulo:      string
  descripcion: string
  condiciones: NarrativeEventConditions
  opciones:    NarrativeOption[]
  /** origin of the event — 'static' for file-loaded, 'generated' for Claude-API output */
  source?:      'static' | 'generated'
  /** ISO-8601 timestamp when a generated event was produced */
  generatedAt?: string
  /** seed used to produce a generated event; enables reproducibility */
  promptSeed?:  string
  /** model id that produced a generated event (e.g. 'claude-opus-4-7') */
  model?:       string
}

// ─── judge types ──────────────────────────────────────────────────────────────

export interface JudgePCSBias {
  sk?: number  // Skating Skills
  tr?: number  // Transitions
  pe?: number  // Performance
  co?: number  // Composition
  in?: number  // Interpretation
}

export interface Judge {
  id:          string
  nombre:      string
  pais:        string
  /** years active as ISU technical specialist or judge */
  experiencia: number
  sesgos: {
    /** general TES generosity; positive = grades elements higher */
    tes?: number
    /** per-component PCS bias; positive = generous, negative = strict */
    pcs?: JudgePCSBias
  }
}

// ─── trait types ──────────────────────────────────────────────────────────────

export interface TraitMutationCondition {
  traitDestino:            string
  estresMinimoAcumulado?:  number
  vinculoMaximo?:          number
  semanasEnRiesgo?:        number
  flagRequerido?:          string
  probabilidadBase:        number
}

export interface TraitData {
  id:                  string
  nombre:              string
  descripcion:         string
  categoria:           'tec' | 'fis' | 'psi' | 'ide'
  variante:            'positivo' | 'negativo' | 'neutro'
  /** bond threshold layer at which this trait becomes visible (0–3) */
  capaVisibilidad:     0 | 1 | 2 | 3
  /** attribute multipliers applied while trait is active */
  efectoMultiplicador: Partial<Record<string, number>>
  /** mutation this trait can undergo and the conditions required */
  mutacion?:           TraitMutationCondition
}

// ─── installation types ───────────────────────────────────────────────────────

export interface InstallationBonuses {
  saltosMejora?:          number
  girosMejora?:           number
  recuperacionBonus?:     number
  lesionRiesgoReduccion?: number
  estresMejora?:          number
  vinculoBonus?:          number
  pcsBonus?:              number
  ingresoSemanal?:        number
}

export interface InstallationLevelData {
  descripcion:         string
  costoUpgrade:        number
  semanasConstruccion: number
  bonificaciones:      InstallationBonuses
}

export interface InstallationData {
  id:          InstallationId
  nombre:      string
  descripcion: string
  // niveles[0] = null (no construida); niveles[1–4] = efectos por nivel
  niveles: [null, InstallationLevelData, InstallationLevelData, InstallationLevelData, InstallationLevelData]
}

// ─── competition types ────────────────────────────────────────────────────────

export interface CompetitionData {
  id:             string
  nombre:         string
  tipo:           string
  semanaISU:      number
  ubicacion:      string
  nivelPrestigio: number  // 1–5
  puntosRanking:  number
  montosPremio:   Record<string, number>  // posicion (string key) → euros
}

// ─── music library types ─────────────────────────────────────────────────────

export interface MusicLibraryEntry {
  id:               string
  title:            string
  composer:         string
  url:              string
  genero:           string
  duracionSegundos: number
  licencia:         string
}

// ─── skater profile (scouting only) ──────────────────────────────────────────

export interface SkaterProfile {
  id:           string
  nombre:       string
  edad:         number
  nacionalidad: string
  nivelVisible: {
    saltos:           number
    giros:            number
    secuenciaDePasos: number
    amplitudLinea:    number
  }
  potencial:          'bajo' | 'medio' | 'alto' | 'excepcional'
  rasgosVisibles:     string[]
  costeContratacion:  number
  disponible:         boolean
}

// ─── conditions for getRandomEvent ───────────────────────────────────────────

/** current game state snapshot used to filter eligible events */
export interface RandomEventConditions {
  /** current vinculo value (0–100) */
  minVinculo?:    number
  /** current estres value (0–100) */
  maxEstres?:     number
  /** current season phase */
  faseTemporada?: FaseSeason
  /** currently active trait IDs */
  rasgosActivos?: string[]
  /** currently active narrative flags */
  flagsActivos?:  string[]
}

// ─── cache ────────────────────────────────────────────────────────────────────

// module-level; persists for the lifetime of the browser session
const resolved = new Map<string, unknown[]>()
const inFlight = new Map<string, Promise<unknown[]>>()

// runtime-only store for Claude-API-generated events; not fetched from disk.
// populated via registerGeneratedEvent() and consulted by getRandomEvent().
const RUNTIME_GENERATED_KEY = 'runtime:generatedEvents'

async function load<T>(path: string): Promise<T[]> {
  if (resolved.has(path)) return resolved.get(path) as T[]

  if (!inFlight.has(path)) {
    const promise = fetch(path)
      .then(res => {
        if (!res.ok) throw new Error(`dataService: ${path} → HTTP ${res.status}`)
        return res.json() as Promise<unknown[]>
      })
      .then(data => {
        resolved.set(path, data)
        inFlight.delete(path)
        return data
      })
      .catch(err => {
        inFlight.delete(path)
        throw err
      })
    inFlight.set(path, promise)
  }

  return inFlight.get(path) as Promise<T[]>
}

// ─── matching ─────────────────────────────────────────────────────────────────

function matchesConditions(event: NarrativeEvent, ctx: RandomEventConditions): boolean {
  const c = event.condiciones

  if (c.minVinculo !== undefined && (ctx.minVinculo ?? 0)   < c.minVinculo) return false
  if (c.maxVinculo !== undefined && (ctx.minVinculo ?? 100) > c.maxVinculo) return false
  if (c.minEstres  !== undefined && (ctx.maxEstres  ?? 0)   < c.minEstres)  return false
  if (c.maxEstres  !== undefined && (ctx.maxEstres  ?? 100) > c.maxEstres)  return false

  if (c.faseTemporada?.length && ctx.faseTemporada) {
    if (!c.faseTemporada.includes(ctx.faseTemporada)) return false
  }
  if (c.rasgosActivos?.length) {
    const active = ctx.rasgosActivos ?? []
    if (!c.rasgosActivos.every(r => active.includes(r))) return false
  }
  if (c.flagsRequeridos?.length) {
    const active = ctx.flagsActivos ?? []
    if (!c.flagsRequeridos.every(f => active.includes(f))) return false
  }

  return true
}

// deterministic integer hash used to seed the judge panel shuffle
function strHash(s: string): number {
  return [...s].reduce((acc, c) => (Math.imul(31, acc) + c.charCodeAt(0)) | 0, 0)
}

// ─── public API ───────────────────────────────────────────────────────────────

/** returns all events of the given type, loading from /data/events/{type}.json on first call */
export async function getEventsByType(type: EventType): Promise<NarrativeEvent[]> {
  return load<NarrativeEvent>(EVENT_PATHS[type])
}

/**
 * returns a random event whose conditions match the current game state.
 * searches across all event type files + runtime-generated events;
 * skips files that fail to load.
 */
export async function getRandomEvent(
  conditions: RandomEventConditions,
): Promise<NarrativeEvent | null> {
  const results = await Promise.allSettled(
    EVENT_TYPES.map(type => load<NarrativeEvent>(EVENT_PATHS[type])),
  )
  const staticEvents    = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  const generatedEvents = (resolved.get(RUNTIME_GENERATED_KEY) ?? []) as NarrativeEvent[]
  const all = [...staticEvents, ...generatedEvents]
  const matching = all.filter(e => matchesConditions(e, conditions))
  if (!matching.length) return null
  return matching[Math.floor(Math.random() * matching.length)]
}

/**
 * inserts a Claude-API-generated event into the runtime cache so it becomes
 * eligible for getRandomEvent. persist these via SaveFile.generatedEvents.
 */
export function registerGeneratedEvent(event: NarrativeEvent): void {
  const existing = (resolved.get(RUNTIME_GENERATED_KEY) ?? []) as NarrativeEvent[]
  resolved.set(RUNTIME_GENERATED_KEY, [...existing, { ...event, source: 'generated' }])
}

/** rehydrate the runtime-generated cache from a loaded SaveFile */
export function hydrateGeneratedEvents(events: NarrativeEvent[]): void {
  resolved.set(RUNTIME_GENERATED_KEY, events)
}

/**
 * assembles a 9-judge ISU panel for the given competition.
 * the same competitionId always produces the same panel (deterministic seed).
 */
export async function getJudgePanel(competitionId: string): Promise<Judge[]> {
  const judges = await load<Judge>('/data/judges.json')
  const seed = strHash(competitionId)
  return [...judges]
    .sort((a, b) => (strHash(a.id + seed) >>> 0) - (strHash(b.id + seed) >>> 0))
    .slice(0, 9)
}

// traits live as a compile-time JSON import: needed synchronously by athlete
// service, no runtime fetch, single source of truth.
const TRAITS_STATIC = traitsRaw as TraitData[]

/** returns the full trait catalog including mutation conditions */
export async function getAllTraits(): Promise<TraitData[]> {
  return TRAITS_STATIC
}

/** returns the static data for one installation (all 4 level effects) or null if not found */
export async function getInstallationData(id: InstallationId): Promise<InstallationData | null> {
  const all = await load<InstallationData>('/data/installations.json')
  return all.find(i => i.id === id) ?? null
}

// ─── music library ────────────────────────────────────────────────────────────

import { isFiniteNumber, isPlainObject } from '@/utils/validation'

function isMusicLibraryEntry(v: unknown): v is MusicLibraryEntry {
  if (!isPlainObject(v)) return false
  return typeof v['id']               === 'string'
      && typeof v['title']            === 'string'
      && typeof v['composer']         === 'string'
      && typeof v['url']              === 'string'
      && typeof v['genero']           === 'string'
      && typeof v['licencia']         === 'string'
      && isFiniteNumber(v['duracionSegundos'])
      && v['duracionSegundos'] > 0
}

/** validates a parsed music_library.json payload; returns null on any failure */
export function validateMusicLibrary(data: unknown): MusicLibraryEntry[] | null {
  if (!Array.isArray(data)) return null
  if (!data.every(isMusicLibraryEntry)) return null
  // narrow via cast at the boundary — entries individually validated above
  return data as MusicLibraryEntry[]
}

/** returns the full music library, validated; returns [] on load or validation failure */
export async function getMusicLibrary(): Promise<MusicLibraryEntry[]> {
  try {
    const raw = await load<unknown>('/data/music_library.json')
    return validateMusicLibrary(raw) ?? []
  } catch {
    return []
  }
}

/** finds a single library entry by id; null when not found or library failed to load */
export async function getMusicLibraryEntry(id: string): Promise<MusicLibraryEntry | null> {
  const all = await getMusicLibrary()
  return all.find(e => e.id === id) ?? null
}

/**
 * fetches all static data files in parallel and populates the cache.
 * call during BOOT to avoid hitches on the first game week.
 * individual file failures are warned but do not reject the promise.
 */
export async function preloadAll(): Promise<void> {
  const paths = [
    ...EVENT_TYPES.map(t => EVENT_PATHS[t]),
    '/data/judges.json',
    '/data/installations.json',
    '/data/competitions.json',
    '/data/music_library.json',
  ]

  const results = await Promise.allSettled(paths.map(path => load(path)))
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`dataService: ${paths[i]} no disponible — funcionalidad limitada`)
    }
  })
}
