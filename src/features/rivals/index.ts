// rivals: NPC pool, simulation, classification — Fase 1 (post-vertical-slice)

export type {
  RivalSkater,
  RivalsPool,
  RivalProgramScore,
  RivalCompetitionScore,
  RivalTier,
} from './types'

export {
  COMPETITION_FIELD_SIZE,
  COMPETITION_TIER_MIN_RIVAL,
} from './types'

export {
  generateRivalPool,
  simulateRivalProgram,
  simulateRivalCompetition,
  eligibleRivals,
  sampleField,
  applyRivalSeasonProgression,
} from './service'

export { useRivalsStore } from './store'

export { validateRivalsPool } from './validation'
