// public api for the training feature
export type { ActivityId, Activity, TrainingSlot, WeekSchedule } from './types'
export { useTrainingStore } from './store'
export { calcGain, resolveWeekGains } from './service'
