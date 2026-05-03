// narrative events + competition Moments — GDD cap. 4 & roadmap Fase 1 Tarea 6

import type { SkaterData } from '@/types'
import type { FaseSeason, SeasonData } from '@/types'
import type { InjurySeverity } from '@/types'
import type { CapaRevelacion } from '@/types'

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

/** when the event makes sense relative to the calendar */
export type ContextoTemporal =
  | 'pre_competicion'        // hay una competición en las próximas N semanas
  | 'post_competicion'       // ha habido una competición en las últimas N semanas
  | 'sin_competicion_proxima' // ni reciente ni inminente

/** range over weeks (both ends inclusive); omit fields to leave them open */
export interface WeekRange {
  min?: number
  max?: number
}

/** identifier of a past choice the player made */
export interface DecisionRef {
  /** id of the NarrativeEvent the player resolved */
  eventId:  string
  /** id of the option they picked within that event */
  optionId: string
}

export interface NarrativeCondition {
  minVinculo?:       number
  maxVinculo?:       number
  minEstres?:        number
  maxEstres?:        number
  faseTemporada?:    FaseSeason[]
  flagsRequeridos?:  string[]
  flagsBloqueantes?: string[]
  temporadaMinima?:  number
  // ── contexto temporal relativo al calendario ────────────────────────────
  /** force the event to fire only in pre/post/calmo. when omitted, any context is allowed */
  contextoTemporal?: ContextoTemporal
  /** allowable distance to the next scheduled competition (defaults open) */
  semanasHastaProximaCompeticion?: WeekRange
  /** allowable distance since the last completed competition (defaults open) */
  semanasDesdeUltimaCompeticion?:  WeekRange
  // ── lesiones ────────────────────────────────────────────────────────────
  /** event only fires when the skater is currently injured */
  requiereLesion?:  boolean
  /** event only fires when the skater is healthy */
  bloqueaSiLesion?: boolean
  /** when requireLesion is true, optionally restrict by severity */
  severidadLesion?: InjurySeverity[]
  // ── memoria narrativa: cadenas por decisión pasada ──────────────────────
  /** event only fires when the player chose this option in a past event */
  decisionRequerida?: DecisionRef
  /** event is blocked when the player chose this option in a past event */
  decisionBloqueante?: DecisionRef
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
  goeDeltaCurrent?:     number  // rango [-1, +1]
  goeDeltaRemaining?:   number  // rango [-0.3, +0.3]
  varianzaMultiplier?:  number  // rango [0.5, 2.0]
  bondDelta?:           number  // pequeño delta de vínculo aplicable también fuera de competición
  /** when true the element at the current trigger index becomes a fall;
   *  represents narratively-driven crashes (a tropezón, una caída en un combo) */
  causesFall?:          boolean
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
  /**
   * GDD cap. 4 — vía cualitativa por la que el evento revela información del
   * patinador (señal/patron/verbal/profundidad). opcional durante la migración
   * del catálogo; sin valor = "cualquier vía". la fase 6 (generación con Claude
   * API) la rellenará obligatoriamente para mantener la coherencia narrativa.
   */
  capa?:        CapaRevelacion
  /** solo presente cuando tipo === 'momento_competicion' */
  trigger?:     MomentoTrigger
  /** id de la opción que se elige automáticamente si el jugador no decide a
   *  tiempo dentro de un momento de competición. cuando se omite, MomentOverlay
   *  elige la opción mecánicamente más neutra. */
  defaultOptionId?: string
  /** segundos de cuenta atrás para el momento; default 7 si no se especifica */
  momentTimeoutSeconds?: number
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
  /** past decisions, used to gate cadenas narrativas. defaults to []. */
  decisionHistory?: readonly DecisionRecord[]
}

/**
 * record of one player decision — enough to drive narrative chains and to
 * render a readable diary. stored in `SaveFile.decisionHistory` and pushed by
 * `useNarrativeStore.resolveChoice`.
 */
export interface DecisionRecord {
  /** stable id; canonical format `${temporada}w${semana}-${eventId}` */
  id:                string
  season:            number
  week:              number
  eventId:           string
  eventTitulo:       string
  eventTipo:         NarrativeEventType
  optionId:          string
  optionTexto:       string
  /** human-readable summary of consequences ("+5 vínculo, -3 estrés") */
  consecuenciasResumidas: string
  /** narrativeFlags keys this option flipped, useful for chain detection */
  flagsAlterados:    string[]
  /** id of the skater this decision was made about */
  skaterId:          string
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
  /** when true the element at the current trigger index becomes a fall */
  causesFall:         boolean
  flagsPatch:         Record<string, boolean | number | string>
}
