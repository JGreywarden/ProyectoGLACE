// narrative events + competition Moments — GDD cap. 4 & roadmap Fase 1 Tarea 6

import type { SkaterData } from '@/types'
import type { FaseSeason, SeasonData } from '@/types/season'

// ─── event taxonomy ──────────────────────────────────────────────────────────

export type NarrativeEventType =
  | 'revelacion'
  | 'crisis'
  | 'decision_moral'
  | 'terceros'
  | 'cotidiano'
  | 'logro_compartido'
  | 'momento_competicion'

/** fixed dispatch points inside a competition turn */
export type MomentoTrigger = 'early' | 'mid' | 'late'

// ─── event shape ─────────────────────────────────────────────────────────────

export interface NarrativeCondition {
  minVinculo?:       number
  maxVinculo?:       number
  minEstres?:        number
  maxEstres?:        number
  faseTemporada?:    FaseSeason[]
  flagsRequeridos?:  string[]
  flagsBloqueantes?: string[]
  temporadaMinima?:  number
}

export interface NarrativeOptionEffect {
  // weekly effects (normal events)
  vinculoDelta?:        number
  estresDelta?:         number
  fatigueDelta?:        number
  atributosDelta?:      Record<string, number>
  narrativeFlags?:      Record<string, boolean | number | string>
  rasgoRiesgo?:         string
  probabilidadMutacion?: number
  // mechanical effects in competition (only on tipo === 'momento_competicion')
  goeDeltaCurrent?:     number // rango [-1, +1]
  goeDeltaRemaining?:   number // rango [-0.3, +0.3]
  varianzaMultiplier?:  number // rango [0.5, 2.0]
  bondDelta?:           number // pequeño delta de vínculo aplicable también fuera de competición
}

export interface NarrativeOption {
  id:      string
  texto:   string
  efectos: NarrativeOptionEffect
}

export interface NarrativeEvent {
  id:           string
  tipo:         NarrativeEventType
  titulo:       string
  descripcion:  string
  condiciones:  NarrativeCondition
  opciones:     NarrativeOption[]
  /** solo presente cuando tipo === 'momento_competicion' */
  trigger?:     MomentoTrigger
  source?:      'static' | 'generated'
  generatedAt?: string
  promptSeed?:  string
  model?:       string
}

// ─── selection + resolution context ──────────────────────────────────────────

export interface NarrativeContext {
  skater:          SkaterData
  season:          SeasonData
  narrativeFlags:  Record<string, boolean | number | string>
  emittedEvents:   string[]
}

export interface EventOutcome {
  skaterPatch:  Partial<SkaterData>
  flagsPatch:   Record<string, boolean | number | string>
  mutatedTrait?: { from: string; to: string }
}

export interface MomentOutcome {
  goeBonusCurrent:    number
  goeBonusRemaining:  number
  varianzaMultiplier: number
  bondDelta:          number
  flagsPatch:         Record<string, boolean | number | string>
}
