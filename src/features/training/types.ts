import type { AttributeKey } from '@/types'

export type ActivityId =
  | 'technical'   // jumps & spins
  | 'choreography'
  | 'conditioning'
  | 'mentalCoach'
  | 'rest'
  | 'competition'  // replaces a slot during competition weeks

export interface Activity {
  id: ActivityId
  label: string
  // which attributes this activity can improve
  targetAttributes: AttributeKey[]
  // base bond delta per session (-5 to +5)
  bondDelta: number
  // energy cost 0–100
  energyCost: number
}

export interface TrainingSlot {
  index: number  // 0–4 (5 slots per week)
  activityId: ActivityId | null
}

export interface WeekSchedule {
  skaterId: string
  slots: TrainingSlot[]  // always length 5
}
