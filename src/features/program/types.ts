// program designer feature types — extends @/types/program with editor-only data
// these types do not get persisted as such; ProgramData is the canonical entity.

import type { ProgramData, ProgramElement, ProgramType } from '@/types'

// re-export for convenience inside the feature
export type { ProgramData, ProgramElement, ProgramType }

// ─── music info ───────────────────────────────────────────────────────────────

/** detected/declared metadata for the program's music track */
export interface MusicInfo {
  /** id in music_library.json or 'upload:<filename>' for user uploads */
  sourceId: string
  title:    string
  /** track length in seconds */
  duration: number
  /** detected BPM; null when detection failed or environment lacks AudioContext */
  tempo:    number | null
  genero?:  string
}

// ─── ISU validation ───────────────────────────────────────────────────────────

export type ViolationCode =
  | 'saltos_count_invalid'
  | 'axel_missing_corto'
  | 'duration_out_of_range'
  | 'illegal_jump_repeat'
  | 'combination_missing'
  | 'giros_count_invalid'
  | 'steps_missing'

export interface ValidationViolation {
  code:    ViolationCode
  /** spanish, actionable message shown directly to the player */
  mensaje: string
  /** index in program.elementos when the violation points to a single element */
  elementoIndex?: number
}

export interface ValidationResult {
  valid:      boolean
  violations: ValidationViolation[]
}

// ─── projected scoring ────────────────────────────────────────────────────────

export interface ProjectedScores {
  tes:        number
  pcs:        number
  pcsDetalle: { sk: number; tr: number; pe: number; co: number; in: number }
  total:      number
}
