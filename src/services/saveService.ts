// save service — pure functions for game persistence via safeStorage
// no React, no Zustand; call from saveStore.ts

import { type SkaterData, validateSkaterData } from '@/types'
import { type CoachData,  validateCoachData }  from '@/types'
import { type ClubData,   validateClubData }   from '@/types'
import { type SeasonData, type CompetitionResult, validateSeasonData } from '@/types'
import { type ProgramData, validateProgramData } from '@/types'
import { safeStorage } from '@/utils/safeStorage'
import {
  isInteger,
  isIntegerInRange,
  isPlainObject,
} from '@/utils/validation'
import { validateRivalsPool, type RivalsPool } from '@/features/rivals'
import {
  validateDecisionHistory,
  validateNarrativeEvent,
  type DecisionRecord,
  type NarrativeEvent,
} from '@/features/narrative'

// ─── constants ────────────────────────────────────────────────────────────────

export type SaveSlot = 1 | 2 | 3

const SAVE_KEYS: Record<SaveSlot, string> = {
  1: 'glace_save_1',
  2: 'glace_save_2',
  3: 'glace_save_3',
}

const BACKUP_KEYS: Record<SaveSlot, string> = {
  1: 'glace_save_1_bak',
  2: 'glace_save_2_bak',
  3: 'glace_save_3_bak',
}

// conservative threshold — localStorage is ~5 MB per origin
const SIZE_WARN_BYTES = 4 * 1024 * 1024

// ─── types ────────────────────────────────────────────────────────────────────

/** a single line of coach–skater dialogue, persisted for narrative continuity */
export interface DialogueLine {
  semana:    number
  temporada: number
  /** 'coach' or a skater id */
  speakerId: string
  text:      string
}

/** complete serialized game state for one save slot */
export interface SaveFile {
  saveVersion:     1
  fechaGuardado:   string  // ISO-8601
  isFirstSession:  boolean
  skater:          SkaterData | null
  coach:           CoachData | null
  club:            ClubData | null
  season:          SeasonData | null
  narrativeFlags:  Record<string, boolean | number | string>
  dialogueHistory: DialogueLine[]
  emittedEvents:   string[]
  /** full bodies of Claude-generated events — cached so reloads restore them */
  generatedEvents: NarrativeEvent[]
  /** confirmed programs per skater — both corto and libre across seasons */
  confirmedPrograms: Record<string, ProgramData[]>
  /** persisted rival pool for the current season — null until first generation */
  rivalsPool: RivalsPool | null
  /** chronological log of every decision the player made — Diario del entrenador */
  decisionHistory: DecisionRecord[]
}

/** lightweight summary for save-slot UI — extracted without full validation */
export interface SaveMetadata {
  fechaGuardado:   string
  semanaActual:    number
  temporadaNumero: number
  nombrePatinador: string
}

/** return value of save() */
export interface SaveResult {
  ok:        boolean
  sizeBytes: number
  error?:    'quota_exceeded' | 'serialization_error' | 'storage_unavailable'
  /** present when save size exceeds SIZE_WARN_BYTES */
  warning?:  'approaching_limit'
}

/** return value of load() — differentiates why a slot could not be restored */
export type LoadReason =
  | 'ok'
  | 'not_found'
  | 'corrupt'
  | 'storage_unavailable'

export interface LoadResult {
  file:   SaveFile | null
  reason: LoadReason
}

/** narrative summary shown on the /sesion resume screen */
export interface SessionSummary {
  semanaActual:               number
  ultimaCompeticionResultado: CompetitionResult | null
  /** eventoNarrativoId from the last recorded WeekSummary, or null */
  ultimoEventoNarrativo:      string | null
  estadoVinculo:              number
  mensajeResumen:             string
}

/** snapshot of game state passed to save() — built by saveStore from gameStore */
export interface GameStateSnapshot {
  currentSkater:   SkaterData | null
  currentCoach:    CoachData | null
  currentClub:     ClubData | null
  currentSeason:   SeasonData | null
  isFirstSession:  boolean
  narrativeFlags:  Record<string, boolean | number | string>
  dialogueHistory: DialogueLine[]
  emittedEvents:   string[]
  generatedEvents: NarrativeEvent[]
  confirmedPrograms: Record<string, ProgramData[]>
  rivalsPool:      RivalsPool | null
  decisionHistory: DecisionRecord[]
}

// ─── internal helpers ─────────────────────────────────────────────────────────

function estimateSize(json: string): number {
  return new Blob([json]).size
}

function buildSaveFile(snapshot: GameStateSnapshot): SaveFile {
  return {
    saveVersion:     1,
    fechaGuardado:   new Date().toISOString(),
    isFirstSession:  snapshot.isFirstSession,
    skater:          snapshot.currentSkater,
    coach:           snapshot.currentCoach,
    club:            snapshot.currentClub,
    season:          snapshot.currentSeason,
    narrativeFlags:  snapshot.narrativeFlags,
    dialogueHistory: snapshot.dialogueHistory,
    emittedEvents:   snapshot.emittedEvents,
    generatedEvents: snapshot.generatedEvents,
    confirmedPrograms: snapshot.confirmedPrograms,
    rivalsPool:        snapshot.rivalsPool,
    decisionHistory:   snapshot.decisionHistory,
  }
}

/**
 * validates the confirmedPrograms map: every entry must be an array of valid
 * ProgramData. Returns the data unchanged on success, throws on any failure.
 */
function validateConfirmedPrograms(raw: unknown): Record<string, ProgramData[]> {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('migrateSave: confirmedPrograms debe ser un objeto')
  }
  const obj = raw as Record<string, unknown>
  const out: Record<string, ProgramData[]> = {}
  for (const [skaterId, list] of Object.entries(obj)) {
    if (!Array.isArray(list)) {
      throw new Error(`migrateSave: confirmedPrograms[${skaterId}] debe ser una lista`)
    }
    if (!list.every(validateProgramData)) {
      throw new Error(`migrateSave: confirmedPrograms[${skaterId}] contiene un programa inválido`)
    }
    // each entry passed validateProgramData; the cast at the boundary is allowed
    out[skaterId] = list as ProgramData[]
  }
  return out
}

/** minimal guard — just enough to reject completely invalid payloads */
function isSaveFile(data: unknown): data is SaveFile {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return d['saveVersion'] === 1 && typeof d['fechaGuardado'] === 'string'
}

/** type guard for a single DialogueLine — week 1–30, season ≥ 1, non-empty speakerId */
function validateDialogueLine(v: unknown): v is DialogueLine {
  if (!isPlainObject(v)) return false
  if (!isIntegerInRange(v['semana'], 1, 30)) return false
  if (!isInteger(v['temporada']) || (v['temporada'] as number) < 1) return false
  if (typeof v['speakerId'] !== 'string' || v['speakerId'].length === 0) return false
  if (typeof v['text'] !== 'string') return false
  return true
}

/** narrativeFlags must be a flat record of primitive values */
function validateNarrativeFlags(v: unknown): v is Record<string, boolean | number | string> {
  if (!isPlainObject(v)) return false
  for (const key of Object.keys(v)) {
    const val = v[key]
    if (typeof val !== 'boolean' && typeof val !== 'number' && typeof val !== 'string') return false
  }
  return true
}

function tryParse(raw: string): SaveFile | null {
  try {
    const data = JSON.parse(raw)
    // migrateSave throws for unknown versions
    return migrateSave(data)
  } catch {
    return null
  }
}

const ORDINALS_ES = [
  'primera', 'segunda', 'tercera', 'cuarta', 'quinta',
  'sexta', 'séptima', 'octava', 'novena', 'décima',
]

function formatPosicion(pos: number): string {
  return pos >= 1 && pos <= ORDINALS_ES.length
    ? `${ORDINALS_ES[pos - 1]} posición`
    : `posición ${pos}`
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * serializes the game state snapshot to JSON and writes it to the given slot.
 * creates a backup in glace_save_X_bak before overwriting.
 * warns (but still saves) if the payload exceeds SIZE_WARN_BYTES.
 */
export function save(slot: SaveSlot, snapshot: GameStateSnapshot): SaveResult {
  if (!safeStorage.available) {
    return { ok: false, sizeBytes: 0, error: 'storage_unavailable' }
  }

  let json: string
  try {
    json = JSON.stringify(buildSaveFile(snapshot))
  } catch {
    return { ok: false, sizeBytes: 0, error: 'serialization_error' }
  }

  const sizeBytes = estimateSize(json)
  const warning: SaveResult['warning'] = sizeBytes > SIZE_WARN_BYTES ? 'approaching_limit' : undefined

  // backup before overwrite — the previous primary becomes the new backup
  const existing = safeStorage.get(SAVE_KEYS[slot])
  if (existing) safeStorage.set(BACKUP_KEYS[slot], existing)

  if (safeStorage.set(SAVE_KEYS[slot], json)) {
    return { ok: true, sizeBytes, ...(warning ? { warning } : {}) }
  }
  return { ok: false, sizeBytes, error: 'quota_exceeded', ...(warning ? { warning } : {}) }
}

/**
 * parses and validates the save at the given slot.
 * falls back to the backup if the primary slot is missing or corrupt.
 * returns LoadResult with a reason code — callers should surface `corrupt`
 * to the user instead of treating it as an empty slot.
 */
export function load(slot: SaveSlot): LoadResult {
  if (!safeStorage.available) return { file: null, reason: 'storage_unavailable' }

  const primary = safeStorage.get(SAVE_KEYS[slot])
  if (primary) {
    const parsed = tryParse(primary)
    if (parsed) return { file: parsed, reason: 'ok' }
    console.error(`saveService: slot ${slot} primary corrupt — falling back to backup`)
  }
  const backup = safeStorage.get(BACKUP_KEYS[slot])
  if (backup) {
    const parsed = tryParse(backup)
    if (parsed) return { file: parsed, reason: 'ok' }
    console.error(`saveService: slot ${slot} backup also corrupt`)
    return { file: null, reason: 'corrupt' }
  }
  if (primary) return { file: null, reason: 'corrupt' }
  return { file: null, reason: 'not_found' }
}

/**
 * returns only the four metadata fields without full save validation.
 * used to populate the save-slot UI without loading the complete game state.
 */
export function getMetadata(slot: SaveSlot): SaveMetadata | null {
  if (!safeStorage.available) return null
  for (const key of [SAVE_KEYS[slot], BACKUP_KEYS[slot]]) {
    const raw = safeStorage.get(key)
    if (!raw) continue
    try {
      const d = JSON.parse(raw) as Record<string, unknown>
      if (d['saveVersion'] !== 1 || typeof d['fechaGuardado'] !== 'string') continue
      const season = d['season'] as Record<string, unknown> | null | undefined
      const skater = d['skater'] as Record<string, unknown> | null | undefined
      return {
        fechaGuardado:   d['fechaGuardado'],
        semanaActual:    typeof season?.['semanaActual']    === 'number' ? season['semanaActual']    : 1,
        temporadaNumero: typeof season?.['temporadaNumero'] === 'number' ? season['temporadaNumero'] : 1,
        nombrePatinador: typeof skater?.['name']            === 'string' ? skater['name']            : '',
      }
    } catch {
      continue
    }
  }
  return null
}

/** removes both the primary save and its backup; returns true if the slot existed */
export function deleteSave(slot: SaveSlot): boolean {
  if (!safeStorage.available) return false
  const existed = safeStorage.get(SAVE_KEYS[slot]) !== null
  safeStorage.remove(SAVE_KEYS[slot])
  safeStorage.remove(BACKUP_KEYS[slot])
  return existed
}

/**
 * derives a narrative session summary from a loaded SaveFile.
 * the result is stored in gameStore.sessionSummary and consumed by the /sesion page.
 */
export function generateSessionSummary(save: SaveFile): SessionSummary {
  const semanaActual    = save.season?.semanaActual    ?? 1
  const temporadaNumero = save.season?.temporadaNumero ?? 1
  const resultados      = save.season?.resultadosTemporada ?? []
  const semanas         = save.season?.historialSemanas    ?? []

  const ultimaCompeticionResultado: CompetitionResult | null =
    resultados.length > 0 ? resultados[resultados.length - 1] : null
  const ultimoEventoNarrativo: string | null =
    semanas.length > 0 ? semanas[semanas.length - 1].eventoNarrativoId : null

  const estadoVinculo = save.skater?.weeklyState.vinculo ?? 0
  const nombre        = save.skater?.name ?? '—'

  let mensajeResumen = `Continuando en la semana ${semanaActual}, temporada ${temporadaNumero}.`
  if (ultimaCompeticionResultado) {
    mensajeResumen += ` Tu última competición fue ${ultimaCompeticionResultado.nombreCompeticion} — ${formatPosicion(ultimaCompeticionResultado.posicion)}.`
  }
  mensajeResumen += ` El vínculo con ${nombre} es de ${estadoVinculo}.`

  return {
    semanaActual,
    ultimaCompeticionResultado,
    ultimoEventoNarrativo,
    estadoVinculo,
    mensajeResumen,
  }
}

/**
 * normalizes a raw parsed object into a valid SaveFile.
 * each non-null entity is validated before being accepted — any failure throws
 * so that tryParse() falls back to the backup.
 * extend this function to handle format migrations when saveVersion increases.
 */
export function migrateSave(data: unknown): SaveFile {
  if (!isSaveFile(data)) {
    throw new Error('migrateSave: formato no reconocido o versión no soportada')
  }
  // isSaveFile narrowed `data` to SaveFile; cast via unknown to access raw fields
  // (SaveFile has no index signature, so Record<string, unknown> requires a two-step cast)
  const d = data as unknown as Record<string, unknown>

  const skater = d['skater'] ?? null
  if (skater !== null && !validateSkaterData(skater)) {
    throw new Error('migrateSave: skater inválido (fuera de rango o malformado)')
  }
  const coach = d['coach'] ?? null
  if (coach !== null && !validateCoachData(coach)) {
    throw new Error('migrateSave: coach inválido (fuera de rango o malformado)')
  }
  const club = d['club'] ?? null
  if (club !== null && !validateClubData(club)) {
    throw new Error('migrateSave: club inválido (fuera de rango o malformado)')
  }
  const season = d['season'] ?? null
  if (season !== null && !validateSeasonData(season)) {
    throw new Error('migrateSave: season inválida (fuera de rango o malformada)')
  }

  // rivals pool: validated when present; missing → null (a fresh pool will be
  // generated by useRivalsStore.ensurePool the first time it is consulted)
  let rivalsPool: RivalsPool | null = null
  if (d['rivalsPool'] !== undefined && d['rivalsPool'] !== null) {
    if (!validateRivalsPool(d['rivalsPool'])) {
      throw new Error('migrateSave: rivalsPool inválido (fuera de rango o malformado)')
    }
    rivalsPool = d['rivalsPool']
  }

  // decision history: optional, validated entry-by-entry
  let decisionHistory: DecisionRecord[] = []
  if (d['decisionHistory'] !== undefined) {
    if (!validateDecisionHistory(d['decisionHistory'])) {
      throw new Error('migrateSave: decisionHistory inválido (entradas malformadas)')
    }
    decisionHistory = d['decisionHistory']
  }

  // narrativeFlags: every value must be primitive (boolean | number | string)
  let narrativeFlags: Record<string, boolean | number | string> = {}
  if (d['narrativeFlags'] !== undefined && d['narrativeFlags'] !== null) {
    if (!validateNarrativeFlags(d['narrativeFlags'])) {
      throw new Error('migrateSave: narrativeFlags contiene valores no primitivos')
    }
    narrativeFlags = d['narrativeFlags']
  }

  // dialogueHistory: validate each entry (semana, temporada, speakerId, text)
  let dialogueHistory: DialogueLine[] = []
  if (d['dialogueHistory'] !== undefined) {
    if (!Array.isArray(d['dialogueHistory']) || !d['dialogueHistory'].every(validateDialogueLine)) {
      throw new Error('migrateSave: dialogueHistory contiene una línea inválida')
    }
    dialogueHistory = d['dialogueHistory']
  }

  // emittedEvents: every entry must be a string
  let emittedEvents: string[] = []
  if (d['emittedEvents'] !== undefined) {
    if (!Array.isArray(d['emittedEvents']) || !d['emittedEvents'].every((s) => typeof s === 'string')) {
      throw new Error('migrateSave: emittedEvents contiene un id no string')
    }
    emittedEvents = d['emittedEvents']
  }

  // generatedEvents: comes from Claude API (Fase 6); every entry must pass validateNarrativeEvent
  let generatedEvents: NarrativeEvent[] = []
  if (d['generatedEvents'] !== undefined) {
    if (!Array.isArray(d['generatedEvents']) || !d['generatedEvents'].every(validateNarrativeEvent)) {
      throw new Error('migrateSave: generatedEvents contiene un evento inválido')
    }
    generatedEvents = d['generatedEvents']
  }

  // v1 → current: fill in defaults for any fields added after initial release
  return {
    saveVersion:     1,
    fechaGuardado:   typeof d['fechaGuardado']  === 'string'  ? d['fechaGuardado']  : new Date().toISOString(),
    isFirstSession:  typeof d['isFirstSession'] === 'boolean' ? d['isFirstSession'] : false,
    skater:          skater as SkaterData | null,
    coach:           coach  as CoachData  | null,
    club:            club   as ClubData   | null,
    season:          season as SeasonData | null,
    narrativeFlags,
    dialogueHistory,
    emittedEvents,
    generatedEvents,
    confirmedPrograms: validateConfirmedPrograms(d['confirmedPrograms']),
    rivalsPool,
    decisionHistory,
  }
}
