// public api for the training feature
export type { ActivityId, Activity, TrainingSlot, WeekSchedule, TensionId, WeekEffects } from './types'
export { useTrainingStore } from './store'
export { ACTIVITY_DEFINITIONS, calcGain, detectTensions, resolveWeekEffects, TENSION_EVENT_SEEDS } from './service'
