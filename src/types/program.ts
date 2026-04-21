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

/** type guard for complete ProgramData */
export function validateProgramData(data: unknown): data is ProgramData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false
  const d = data as Record<string, unknown>

  if (typeof d['id'] !== 'string') return false
  if (typeof d['skaterId'] !== 'string') return false
  if (typeof d['temporada'] !== 'number') return false
  if (typeof d['tipo'] !== 'string') return false
  if (typeof d['musicaGenero'] !== 'string') return false
  if (typeof d['musicaTempo'] !== 'string') return false
  if (typeof d['densidadEmocional'] !== 'number') return false
  if (!Array.isArray(d['elementos'])) return false
  if (typeof d['coreografoNivel'] !== 'number') return false
  if (typeof d['tesProyectado'] !== 'number') return false
  if (typeof d['pcsProyectado'] !== 'number') return false

  return true
}
