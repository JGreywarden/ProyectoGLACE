// narrative: weekly events + competition Moments — GDD cap. 4 / Fase 1 Tarea 6

export type {
  NarrativeEvent,
  NarrativeEventType,
  NarrativeCondition,
  NarrativeOption,
  NarrativeOptionEffect,
  NarrativeContext,
  EventOutcome,
  MomentOutcome,
  MomentoTrigger,
} from './types'

export { useNarrativeStore } from './store'

export {
  loadEvents,
  evaluateConditions,
  selectWeeklyEvent,
  selectCompetitionMoment,
  applyEventEffect,
  applyMomentEffect,
  validateNarrativeEvent,
} from './service'
