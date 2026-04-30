// rivals — minimal NPC skater data needed to populate the competition
// classification. each season generates a fresh pool persisted in the SaveFile.

import type { CompetitionType } from '@/types/season'

/** difficulty tier — selects which competitions a rival can realistically attend */
export type RivalTier = 1 | 2 | 3 | 4 | 5

/**
 * compact NPC skater used to populate the competition field. only the inputs
 * that move the score appear here; we do not track fatigue/stress/bond/traits
 * for rivals. attributes drift slightly across the season via
 * applyRivalSeasonProgression so multi-event arcs feel alive.
 */
export interface RivalSkater {
  id:           string
  nombre:       string
  nacionalidad: string
  edad:         number
  /** difficulty tier 1–5; higher tiers attend the prestigious events */
  tier:         RivalTier
  technical: {
    saltos:           number  // 0–100
    giros:            number  // 0–100
    secuenciaDePasos: number  // 0–100
    amplitudLinea:    number  // 0–100
  }
  psychological: {
    confianza:           number  // 0–100
    resistenciaMental:   number  // 0–100
    presionCompetitiva:  number  // -100..100
    motivacionIntrinseca: number // 0–100
  }
  /** total ISU base value the rival's program can field across SP + FS */
  difficultyBudget: { corto: number; libre: number }
}

/** persisted pool: a single flat list, generated at season start */
export interface RivalsPool {
  /** season number this pool was generated for */
  seasonNumber: number
  /** rivals available across the season (player NOT included) */
  skaters:      RivalSkater[]
}

/** outcome of one rival's program for a given competition */
export interface RivalProgramScore {
  rivalId:    string
  programType: 'corto' | 'libre'
  tes:        number
  pcs:        number
  caidas:     number
  deducciones: number
  total:      number
}

/** final tally of a rival across the SP + FS combined */
export interface RivalCompetitionScore {
  rivalId:        string
  scoreCorto:     number
  scoreLibre:     number
  totalCombinado: number
}

/** mapping competition tier → minimum rival tier eligible to attend */
export const COMPETITION_TIER_MIN_RIVAL: Readonly<Record<CompetitionType, RivalTier>> = {
  nacional:       1,
  internacional:  2,
  grandprix:      3,
  finalGrandprix: 4,
  europeo:        4,
  mundial:        4,
  olimpico:       5,
} as const

/** typical field size by tier — caps the participants in the classification */
export const COMPETITION_FIELD_SIZE: Readonly<Record<CompetitionType, number>> = {
  nacional:       18,
  internacional:  24,
  grandprix:      24,
  finalGrandprix: 6,
  europeo:        30,
  mundial:        30,
  olimpico:       24,
} as const
