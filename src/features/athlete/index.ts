// athlete: attributes, traits, bond, progression, injuries

export {
  applyBondDecay,
  applyFatigueRecovery,
  computeTraitVisibilityLayer,
  computeVisibleTraits,
  applyAttributeGains,
  rollMutation,
  computeInjuryRisk,
} from './service'
export type { MutationResult } from './service'

export {
  weeklyInjuryLoad,
  weeklyInjuryProbability,
  pickSeverity,
  pickRecoveryWeeks,
  rollWeeklyInjury,
  rollFallInjury,
  forceOverworkInjury,
  tickInjuryWeek,
  activityAllowedDuringInjury,
  maskInjuredSchedule,
} from './injury'
export type { InjuryRollOptions, RecoveryOutcome } from './injury'
