// program domain types — musical program, elements, choreography

// ─── element types ────────────────────────────────────────────────────────────

/** ISU jump variants recognized by the scoring system */
export type JumpType =
  | 'axel'     // 1.1× difficulty multiplier; only forward takeoff
  | 'lutz'     // outside edge takeoff
  | 'flip'     // inside edge takeoff
  | 'loop'     // outside edge takeoff, both picks
  | 'salchow'  // inside back edge takeoff
  | 'toeloop'  // toe-assisted loop

/** broad element category per ISU technical panel */
export type ElementType =
  | 'salto'               // single, double, triple, or quad jump
  | 'giro'                // spin (camel, sit, upright, flying, combination)
  | 'secuenciaPasos'      // step sequence (levels 1–4)
  | 'secuenciaCoreografica' // choreographic sequence (fixed base value)
  | 'espiral'             // spiral sequence (ladies/pairs only)

// ─── music ────────────────────────────────────────────────────────────────────

export type MusicaTempo = 'lento' | 'medio' | 'rapido'

/** whether this is a short program (2:40–2:50) or free skate (4:00–4:30) */
export type ProgramType = 'corto' | 'libre'

// ─── program element ──────────────────────────────────────────────────────────

export interface ProgramElement {
  tipo: ElementType
  /**
   * specific jump variant; null for spins, steps, and other non-jump elements.
   * required when tipo === 'salto'.
   */
  tipoSalto:          JumpType | null
  /** ISU base value for this element at current difficulty; 0.0–10.0 */
  dificultadBase:     number
  /** 1-based position in the program execution order */
  posicionEnPrograma: number
  /**
   * true when this jump is part of a combination or sequence.
   * combinations affect GOE calculation and bonus multipliers.
   */
  esCombinacion:      boolean
  /** number of full rotations (relevant for jumps); null for non-jump elements */
  rotaciones:         1 | 2 | 3 | 4 | null
}

// ─── main entity ──────────────────────────────────────────────────────────────

export interface ProgramData {
  id:        string
  skaterId:  string
  temporada: number
  tipo:      ProgramType
  /** narrative or thematic title used by the choreographer and coach */
  tituloProgramatico: string
  musicaGenero: string
  musicaTempo:  MusicaTempo
  /**
   * emotional intensity of the program; affects PCS Interpretation potential.
   * 0.0 = purely athletic, 1.0 = maximum narrative density.
   */
  densidadEmocional: number  // 0.0–1.0
  elementos:         ProgramElement[]
  /**
   * tier of the assigned choreographer; affects PCS ceiling and unlock conditions
   * for traits like Artista nato and Actor nato.
   */
  coreografoNivel:   1 | 2 | 3 | 4 | 5
  /**
   * cohesion built up by Ensayo slots while preparing this program (0–100).
   * primary driver of PCS Transitions and Composition; decays slowly without rehearsal.
   */
  cohesion:          number
  /**
   * how deeply this skater inhabits this specific music (0–100).
   * GDD pág. 12 IN: "Vínculo con la música". built up over weeks of work with the piece.
   * never confuse with the coach-skater bond (skater.weeklyState.vinculo).
   */
  vinculoMusical:    number
  /** projected TES based on current element difficulty and skater attributes */
  tesProyectado: number
  /** projected PCS based on current component scores */
  pcsProyectado: number
}

// ─── default data ─────────────────────────────────────────────────────────────

/** baseline ProgramData for a new free-skate program */
export const DEFAULT_PROGRAM_DATA: ProgramData = {
  id:                 '',
  skaterId:           '',
  temporada:          1,
  tipo:               'libre',
  tituloProgramatico: '',
  musicaGenero:       '',
  musicaTempo:        'medio',
  densidadEmocional:  0.5,
  elementos:          [],
  coreografoNivel:    1,
  cohesion:           50,
  vinculoMusical:     50,
  tesProyectado:      0,
  pcsProyectado:      0,
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** projected total score (TES + PCS) */
export function getProgramTotal(program: ProgramData): number {
  return program.tesProyectado + program.pcsProyectado
}

/** true when this is a short program */
export function isShortProgram(program: ProgramData): boolean {
  return program.tipo === 'corto'
}

/** number of jump elements in the program */
export function getJumpCount(program: ProgramData): number {
  return program.elementos.filter(e => e.tipo === 'salto').length
}

/** highest jump difficulty base value in the program; 0 if no jumps */
export function getMaxJumpDifficulty(program: ProgramData): number {
  const jumps = program.elementos.filter(e => e.tipo === 'salto')
  return jumps.length > 0 ? Math.max(...jumps.map(e => e.dificultadBase)) : 0
}

// ─── runtime validation ───────────────────────────────────────────────────────

import {
  isFiniteNumber,
  isInRange,
  isInteger,
  isIntegerInRange,
  isNonNegative,
  isPlainObject,
} from '@/utils/validation'

const VALID_PROGRAM_TYPES: ReadonlySet<string> = new Set<ProgramType>(['corto', 'libre'])
const VALID_MUSICA_TEMPOS: ReadonlySet<string> = new Set<MusicaTempo>(['lento', 'medio', 'rapido'])
const VALID_ELEMENT_TYPES: ReadonlySet<string> = new Set<ElementType>([
  'salto', 'giro', 'secuenciaPasos', 'secuenciaCoreografica', 'espiral',
])
const VALID_JUMP_TYPES: ReadonlySet<string> = new Set<JumpType>([
  'axel', 'lutz', 'flip', 'loop', 'salchow', 'toeloop',
])
const VALID_ROTACIONES: ReadonlySet<number> = new Set([1, 2, 3, 4])

/** type guard for a single ProgramElement; rejects out-of-range or unknown variants */
export function validateProgramElement(v: unknown): v is ProgramElement {
  if (!isPlainObject(v)) return false
  if (typeof v['tipo'] !== 'string' || !VALID_ELEMENT_TYPES.has(v['tipo'])) return false

  // tipoSalto: required string variant when salto, must be null otherwise
  if (v['tipo'] === 'salto') {
    if (typeof v['tipoSalto'] !== 'string' || !VALID_JUMP_TYPES.has(v['tipoSalto'])) return false
  } else if (v['tipoSalto'] !== null) {
    return false
  }

  // dificultadBase 0–15 covers every ISU base value (quad axel ~12.5)
  if (!isInRange(v['dificultadBase'], 0, 15)) return false
  if (!isInteger(v['posicionEnPrograma']) || (v['posicionEnPrograma'] as number) < 1) return false
  if (typeof v['esCombinacion'] !== 'boolean') return false

  // rotaciones: required 1–4 for jumps, must be null otherwise
  if (v['tipo'] === 'salto') {
    if (!isInteger(v['rotaciones']) || !VALID_ROTACIONES.has(v['rotaciones'] as number)) return false
  } else if (v['rotaciones'] !== null) {
    return false
  }

  return true
}

/**
 * type guard for complete ProgramData.
 * validates ranges (densidadEmocional 0–1, coreografoNivel 1–5) and recurses
 * into elementos[] to reject malformed program elements.
 */
export function validateProgramData(data: unknown): data is ProgramData {
  if (!isPlainObject(data)) return false

  if (typeof data['id'] !== 'string') return false
  if (typeof data['skaterId'] !== 'string') return false
  if (!isInteger(data['temporada']) || (data['temporada'] as number) < 1) return false
  if (typeof data['tipo'] !== 'string' || !VALID_PROGRAM_TYPES.has(data['tipo'])) return false
  if (typeof data['tituloProgramatico'] !== 'string') return false
  if (typeof data['musicaGenero'] !== 'string') return false
  if (typeof data['musicaTempo'] !== 'string' || !VALID_MUSICA_TEMPOS.has(data['musicaTempo'])) return false
  if (!isInRange(data['densidadEmocional'], 0, 1)) return false
  if (!isIntegerInRange(data['coreografoNivel'], 1, 5)) return false
  if (!isInRange(data['cohesion'], 0, 100)) return false
  if (!isInRange(data['vinculoMusical'], 0, 100)) return false
  if (!isFiniteNumber(data['tesProyectado']) || !isNonNegative(data['tesProyectado'])) return false
  if (!isFiniteNumber(data['pcsProyectado']) || !isNonNegative(data['pcsProyectado'])) return false

  if (!Array.isArray(data['elementos'])) return false
  if (!data['elementos'].every(validateProgramElement)) return false

  return true
}
