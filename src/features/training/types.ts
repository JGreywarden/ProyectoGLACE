import type { TechnicalAttributes } from '@/types/skater'

export type ActivityId = 'tecnico' | 'fisico' | 'mental' | 'descanso' | 'ensayo' | 'dialogo'

export interface Activity {
  id: ActivityId
  label: string
  targetAttributes: Array<keyof TechnicalAttributes>
  fatigueDeltaMin: number
  fatigueDeltaMax: number
  stressDeltaMin: number
  stressDeltaMax: number
  bondDeltaMin: number
  bondDeltaMax: number
  injuryRiskDelta: number
  cohesionDeltaMin: number
  cohesionDeltaMax: number
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

export type TensionId =
  | 'tecnico_vs_descanso'
  | 'ensayo_vs_pre_competicion'
  | 'dialogo_vs_hielo'
  | 'carga_vs_pico'
  | 'ensayo_vs_espontaneidad'
  | 'paradoja_descanso_emocional'

export interface WeekEffects {
  attributeGains: Partial<Record<keyof TechnicalAttributes, number>>
  fatigueDelta: number
  stressDelta: number
  bondDelta: number
  cohesionDelta: number
  // raw rng value 0–1; orchestrator compares against computed injury risk
  injuryRoll: number
  tensionsTriggered: TensionId[]
  eventSeeds: string[]
}
