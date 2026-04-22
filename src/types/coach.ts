// coach domain types — profile, skill tree, reputation, legacy

// ─── skill tree ───────────────────────────────────────────────────────────────

/** the three development branches of the coach skill tree */
export type SkillBranch = 'tecnica' | 'psicologica' | 'directiva'

/**
 * opaque string key for a skill tree node.
 * replace with a full union once the GDD skill tree is finalized.
 */
export type SkillNodeId = string

// ─── branch profile ───────────────────────────────────────────────────────────

/**
 * inferred style profile derived from early-game decisions.
 * invariant: ramaTecnica + ramaPsicologica + ramaDirectiva === 1.0
 */
export interface CoachBranchProfile {
  /** weight of technical development focus; 0.0–1.0 */
  ramaTecnica:     number
  /** weight of psychological development focus; 0.0–1.0 */
  ramaPsicologica: number
  /** weight of management/logistics focus; 0.0–1.0 */
  ramaDirectiva:   number
}

// ─── reputation ───────────────────────────────────────────────────────────────

/** five reputation axes tracked by the circuit; each 0–100 */
export interface CoachReputation {
  /** most volatile; rises with wins, crashes with losses */
  repResultados:    number
  /** slowest to build; reflects athlete welfare across years */
  repCuidado:       number
  /** built by judges and peer coaches, not the press */
  repArtistica:     number
  /** hardest to raise; one dishonest act can collapse it */
  repHonestidad:    number
  /** relationship with ISU structures and national federations */
  repInstitucional: number
}

// ─── legacy ───────────────────────────────────────────────────────────────────

export type MedalType = 'oro' | 'plata' | 'bronce'

/** a competition medal in the coach's career record */
export interface Medal {
  tipo:         MedalType
  /** competition name (e.g. 'Campeonato de Europa 2028') */
  competicion:  string
  /** season number in which the medal was won */
  temporada:    number
  skaterId:     string
}

/** permanent career record; never resets */
export interface CoachLegacy {
  /** total skaters who completed at least one full season */
  patinadorFormados:    number
  medallas:             Medal[]
  /** narrative event IDs that permanently shaped the coach's story */
  eventosDefinitorios:  string[]
}

// ─── main entity ──────────────────────────────────────────────────────────────

export interface CoachData {
  id:   string
  name: string
  /** style profile inferred from first-40-minutes decisions */
  perfilInferido: CoachBranchProfile
  /**
   * skill tree nodes and their unlock state.
   * key is a SkillNodeId; value is true when the node is unlocked.
   */
  arbolHabilidades: Record<SkillNodeId, boolean>
  /** number of fully completed seasons */
  temporadasCompletadas: number
  legadoTotal:  CoachLegacy
  reputacion:   CoachReputation
  /** decision flags set during the first 40 minutes; shape identity permanently */
  flagsDecisionesFundacionales: string[]
}

// ─── default data ─────────────────────────────────────────────────────────────

/** baseline CoachData for a new coach at career start */
export const DEFAULT_COACH_DATA: CoachData = {
  id:   '',
  name: '',
  perfilInferido: {
    ramaTecnica:     0.34,
    ramaPsicologica: 0.33,
    ramaDirectiva:   0.33,
  },
  arbolHabilidades:            {},
  temporadasCompletadas:       0,
  legadoTotal: {
    patinadorFormados:   0,
    medallas:           [],
    eventosDefinitorios: [],
  },
  reputacion: {
    repResultados:    20,
    repCuidado:       20,
    repArtistica:     20,
    repHonestidad:    50,
    repInstitucional: 10,
  },
  flagsDecisionesFundacionales: [],
}

// ─── runtime validation ───────────────────────────────────────────────────────

import {
  isInRange,
  isNonNegative,
  isPlainObject,
  hasUnitScoreFields,
  approximatelyEquals,
} from '@/utils/validation'

const REPUTATION_KEYS = [
  'repResultados', 'repCuidado', 'repArtistica', 'repHonestidad', 'repInstitucional',
] as const

const LEGACY_NUMERIC_KEYS = ['patinadorFormados'] as const

/** type guard for complete CoachData — validates reputations 0–100 and branch invariant */
export function validateCoachData(data: unknown): data is CoachData {
  if (!isPlainObject(data)) return false

  if (typeof data['id'] !== 'string') return false
  if (typeof data['name'] !== 'string') return false
  if (!Array.isArray(data['flagsDecisionesFundacionales'])) return false
  if (!isNonNegative(data['temporadasCompletadas'])) return false

  const profile = data['perfilInferido']
  if (!isPlainObject(profile)) return false
  if (!isInRange(profile['ramaTecnica'],     0, 1)) return false
  if (!isInRange(profile['ramaPsicologica'], 0, 1)) return false
  if (!isInRange(profile['ramaDirectiva'],   0, 1)) return false
  const branchSum = profile['ramaTecnica'] + profile['ramaPsicologica'] + profile['ramaDirectiva']
  if (!approximatelyEquals(branchSum, 1.0, 0.01)) return false

  if (!isPlainObject(data['arbolHabilidades'])) return false

  const legacy = data['legadoTotal']
  if (!isPlainObject(legacy)) return false
  for (const k of LEGACY_NUMERIC_KEYS) {
    if (!isNonNegative(legacy[k])) return false
  }
  if (!Array.isArray(legacy['medallas'])) return false
  if (!Array.isArray(legacy['eventosDefinitorios'])) return false

  const reputation = data['reputacion']
  if (!isPlainObject(reputation)) return false
  if (!hasUnitScoreFields(reputation, REPUTATION_KEYS)) return false

  return true
}
