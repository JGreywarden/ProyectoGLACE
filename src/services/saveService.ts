// save service — pure functions for game persistence via localStorage
// no React, no Zustand; call from saveStore.ts

import type { SkaterData } from '@/types/skater'
import type { CoachData } from '@/types/coach'
import type { ClubData } from '@/types/club'
import type { SeasonData, CompetitionResult } from '@/types/season'

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
  error?:    'quota_exceeded' | 'serialization_error'
  /** present when save size exceeds SIZE_WARN_BYTES */
  warning?:  'approaching_limit'
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
  }
}

/** minimal guard — just enough to reject completely invalid payloads */
function isSaveFile(data: unknown): data is SaveFile {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return d['saveVersion'] === 1 && typeof d['fechaGuardado'] === 'string'
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
  let json: string
  try {
    json = JSON.stringify(buildSaveFile(snapshot))
  } catch {
    return { ok: false, sizeBytes: 0, error: 'serialization_error' }
  }

  const sizeBytes = estimateSize(json)
  const warning: SaveResult['warning'] = sizeBytes > SIZE_WARN_BYTES ? 'approaching_limit' : undefined

  // backup before overwrite — ignore failure (disk full edge case)
  const existing = localStorage.getItem(SAVE_KEYS[slot])
  if (existing) {
    try { localStorage.setItem(BACKUP_KEYS[slot], existing) } catch { /* continue */ }
  }

  try {
    localStorage.setItem(SAVE_KEYS[slot], json)
    return { ok: true, sizeBytes, ...(warning ? { warning } : {}) }
  } catch {
    return { ok: false, sizeBytes, error: 'quota_exceeded', ...(warning ? { warning } : {}) }
  }
}

/**
 * parses and validates the save at the given slot.
 * falls back to the backup if the primary slot is missing or corrupt.
 */
export function load(slot: SaveSlot): SaveFile | null {
  const primary = localStorage.getItem(SAVE_KEYS[slot])
  if (primary) {
    const parsed = tryParse(primary)
    if (parsed) return parsed
  }
  const backup = localStorage.getItem(BACKUP_KEYS[slot])
  if (backup) return tryParse(backup)
  return null
}

/**
 * returns only the four metadata fields without full save validation.
 * used to populate the save-slot UI without loading the complete game state.
 */
export function getMetadata(slot: SaveSlot): SaveMetadata | null {
  for (const key of [SAVE_KEYS[slot], BACKUP_KEYS[slot]]) {
    const raw = localStorage.getItem(key)
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
  const existed = localStorage.getItem(SAVE_KEYS[slot]) !== null
  localStorage.removeItem(SAVE_KEYS[slot])
  localStorage.removeItem(BACKUP_KEYS[slot])
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
 * extend this function to handle format migrations when saveVersion increases.
 * throws if the data cannot be recognized as any supported version.
 */
export function migrateSave(data: unknown): SaveFile {
  if (!isSaveFile(data)) {
    throw new Error('migrateSave: formato no reconocido o versión no soportada')
  }
  const d = data as Record<string, unknown>

  // v1 → current: fill in defaults for any fields added after initial release
  return {
    saveVersion:     1,
    fechaGuardado:   typeof d['fechaGuardado'] === 'string' ? d['fechaGuardado'] : new Date().toISOString(),
    isFirstSession:  typeof d['isFirstSession'] === 'boolean' ? d['isFirstSession'] : false,
    skater:          (d['skater']  as SkaterData  | null) ?? null,
    coach:           (d['coach']   as CoachData   | null) ?? null,
    club:            (d['club']    as ClubData    | null) ?? null,
    season:          (d['season']  as SeasonData  | null) ?? null,
    narrativeFlags:  (typeof d['narrativeFlags'] === 'object' && d['narrativeFlags'] !== null
      ? d['narrativeFlags'] as Record<string, boolean | number | string>
      : {}),
    dialogueHistory: Array.isArray(d['dialogueHistory']) ? (d['dialogueHistory'] as DialogueLine[]) : [],
    emittedEvents:   Array.isArray(d['emittedEvents'])   ? (d['emittedEvents']   as string[])       : [],
  }
}
