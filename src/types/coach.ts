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

/** type guard for complete CoachData */
export function validateCoachData(data: unknown): data is CoachData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false
  const d = data as Record<string, unknown>

  if (typeof d['id'] !== 'string') return false
  if (typeof d['name'] !== 'string') return false
  if (!Array.isArray(d['flagsDecisionesFundacionales'])) return false
  if (typeof d['temporadasCompletadas'] !== 'number') return false

  const p = d['perfilInferido']
  if (typeof p !== 'object' || p === null) return false
  const profile = p as Record<string, unknown>
  if (typeof profile['ramaTecnica'] !== 'number') return false
  if (typeof profile['ramaPsicologica'] !== 'number') return false
  if (typeof profile['ramaDirectiva'] !== 'number') return false

  if (typeof d['arbolHabilidades'] !== 'object' || d['arbolHabilidades'] === null) return false
  if (typeof d['legadoTotal'] !== 'object' || d['legadoTotal'] === null) return false
  if (typeof d['reputacion'] !== 'object' || d['reputacion'] === null) return false

  return true
}
