// season domain types — calendar, competition results, weekly history

// ─── season phases ────────────────────────────────────────────────────────────

/**
 * five-phase season rhythm (finer resolution than the global SeasonPhase).
 * maps to the 30-week calendar: Construccion 1–8, Activacion 9–14,
 * Pico 15–22, Rearme 23–26, Cierre 27–30.
 */
export type FaseSeason =
  | 'Construccion' // weeks 1–8:  base conditioning, new elements
  | 'Activacion'   // weeks 9–14: program integration, first competitions
  | 'Pico'         // weeks 15–22: peak performance, key competitions
  | 'Rearme'       // weeks 23–26: post-peak recovery, minor fixes
  | 'Cierre'       // weeks 27–30: gala, evaluation, season wrap-up

// ─── competition types ────────────────────────────────────────────────────────

export type CompetitionType =
  | 'nacional'       // national circuit event
  | 'internacional'  // invitational or challenger series
  | 'grandprix'      // ISU Grand Prix segment (6 events)
  | 'finalGrandprix' // ISU Grand Prix Final (top 6 qualify)
  | 'europeo'        // European Championship
  | 'mundial'        // World Championship
  | 'olimpico'       // Olympic Games

// ─── calendar ─────────────────────────────────────────────────────────────────

/** an entry in the season calendar; may or may not be attended */
export interface CompetitionSlot {
  /** week number 1–30 in which the competition falls */
  semana:             number
  nombreCompeticion:  string
  tipo:               CompetitionType
  /** true if the skater has qualified and will compete */
  clasificado:        boolean
}

// ─── competition results ──────────────────────────────────────────────────────

/** detailed ISU PCS breakdown */
export interface PCSBreakdown {
  /** Skating Skills */
  sk: number
  /** Transitions */
  tr: number
  /** Performance */
  pe: number
  /** Composition */
  co: number
  /** Interpretation */
  in: number
}

/** outcome of a single competition appearance */
export interface CompetitionResult {
  /** stable unique id; canonical format `${skaterId}-s${temporada}w${semana}` */
  id:                string
  skaterId:          string
  semana:            number
  nombreCompeticion: string
  tipo:              CompetitionType
  /** Technical Element Score */
  tes:    number
  /** Program Component Score (sum of PCS breakdown × factor) */
  pcs:    number
  /** breakdown of the five PCS judges' panels */
  pcsDetalle: PCSBreakdown
  /** final total score (tes + pcs − deductions) */
  total:  number
  /** final ranking position in the competition */
  posicion: number
  /** number of falls in the program */
  caidas: number
  /** total deductions applied */
  deducciones: number
}

// ─── weekly summary ───────────────────────────────────────────────────────────

/**
 * condensed record of what happened in a single week.
 * ranuraEjecutadas values map to ActivityId in features/training/types.ts.
 */
export interface WeekSummary {
  semana:             number
  fase:               FaseSeason
  /** activity IDs from the training slot plan for this week */
  ranuraEjecutadas:   string[]
  /** net change in vinculo at end of week */
  vinculoDelta:       number
  /** net change in fatigaAcumulada at end of week */
  fatigueDelta:       number
  /** net change in estres at end of week */
  stresDelta:         number
  /** narrative event fired this week; null if none */
  eventoNarrativoId:  string | null
  /** competition result ID if a competition occurred this week; null otherwise */
  competicionResultadoId: string | null
}

// ─── main entity ──────────────────────────────────────────────────────────────

export interface SeasonData {
  /** current week 1–30 */
  semanaActual:    number
  faseActual:      FaseSeason
  temporadaNumero: number
  /** pre-generated ISU calendar for the season */
  calendario:           CompetitionSlot[]
  resultadosTemporada:  CompetitionResult[]
  /** one entry per completed week; grows as the season progresses */
  historialSemanas:     WeekSummary[]
}

// ─── default data ─────────────────────────────────────────────────────────────

/** baseline SeasonData at the start of a new season */
export const DEFAULT_SEASON_DATA: SeasonData = {
  semanaActual:        1,
  faseActual:          'Construccion',
  temporadaNumero:     1,
  calendario:          [],
  resultadosTemporada: [],
  historialSemanas:    [],
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** returns the FaseSeason that corresponds to a given week number (1–30) */
export function getFasePorSemana(semana: number): FaseSeason {
  if (semana <= 8)  return 'Construccion'
  if (semana <= 14) return 'Activacion'
  if (semana <= 22) return 'Pico'
  if (semana <= 26) return 'Rearme'
  return 'Cierre'
}

/** total score from a CompetitionResult (tes + pcs - deducciones) */
export function getTotalScore(result: CompetitionResult): number {
  return result.tes + result.pcs - result.deducciones
}

/** canonical id for a CompetitionResult — stable across reloads */
export function makeCompetitionResultId(
  skaterId: string,
  temporada: number,
  semana: number,
): string {
  return `${skaterId}-s${temporada}w${semana}`
}

// ─── runtime validation ───────────────────────────────────────────────────────

import { isIntegerInRange, isInteger, isPlainObject, isFiniteNumber } from '@/utils/validation'

/** type guard for complete SeasonData — validates ranges (semana 1–30) */
export function validateSeasonData(data: unknown): data is SeasonData {
  if (!isPlainObject(data)) return false

  if (!isIntegerInRange(data['semanaActual'], 1, 30)) return false
  if (typeof data['faseActual'] !== 'string') return false
  if (!isInteger(data['temporadaNumero']) || (data['temporadaNumero'] as number) < 1) return false
  if (!Array.isArray(data['calendario'])) return false
  if (!Array.isArray(data['resultadosTemporada'])) return false
  if (!Array.isArray(data['historialSemanas'])) return false

  return true
}

/**
 * type guard for a single CompetitionResult entry.
 * every finite numeric field is checked; id must be non-empty.
 */
export function validateCompetitionResult(data: unknown): data is CompetitionResult {
  if (!isPlainObject(data)) return false
  if (typeof data['id'] !== 'string' || data['id'].length === 0) return false
  if (typeof data['skaterId'] !== 'string') return false
  if (!isIntegerInRange(data['semana'], 1, 30)) return false
  if (typeof data['nombreCompeticion'] !== 'string') return false
  if (typeof data['tipo'] !== 'string') return false

  if (!isFiniteNumber(data['tes'])) return false
  if (!isFiniteNumber(data['pcs'])) return false
  if (!isFiniteNumber(data['total'])) return false
  if (!isFiniteNumber(data['deducciones'])) return false
  if (!isInteger(data['posicion']) || (data['posicion'] as number) < 1) return false
  if (!isInteger(data['caidas']) || (data['caidas'] as number) < 0) return false

  if (!isPlainObject(data['pcsDetalle'])) return false
  for (const k of ['sk', 'tr', 'pe', 'co', 'in']) {
    if (!isFiniteNumber((data['pcsDetalle'] as Record<string, unknown>)[k])) return false
  }
  return true
}
