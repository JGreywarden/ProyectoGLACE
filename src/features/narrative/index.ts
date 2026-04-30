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
  ContextoTemporal,
  WeekRange,
  DecisionRef,
  DecisionRecord,
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
  buildDecisionRecord,
  semanasHastaProximaCompeticion,
  semanasDesdeUltimaCompeticion,
} from './service'

export { validateDecisionHistory } from './validation'
