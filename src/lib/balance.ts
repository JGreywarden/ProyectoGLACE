// balance.ts — todas las constantes numéricas del juego derivadas del GDD
// los services consumen estas constantes; nunca números mágicos en el dominio

import type { AttributeKey } from '@/types'

// ─── 1. Progresión de atributos ───────────────────────────────────────────────

// GDD cap. 17 — ganancia base por sesión antes de aplicar modificadores
export const BASE_GAIN_PER_SESSION = 2

// GDD cap. 17 — controla la velocidad a la que la ganancia se satura cerca del techo
// a mayor k, la curva satura más rápido; calibrado para 30-40 semanas de progresión visible
export const POTENTIAL_DAMPENING_K = 0.015

// GDD cap. 17 — fatiga acumulada por encima de este umbral bloquea mejora técnica
export const FATIGUE_BLOCK_THRESHOLD = 70

// GDD cap. 17 — multiplicador de velocidad de ganancia cuando motivacionIntrinseca >= 70
export const MOTIVATION_SPEED_MULTIPLIER = 1.25

// GDD cap. 17 — curva de ganancia de atributo por sesión
// value: valor actual del atributo (0-100)
// potential: techo biológico del patinador (0-100)
// factors: producto de todos los multiplicadores activos (motivación, rasgos, etc.)
// devuelve el gain en bruto (float); el servicio aplica Math.round y recorte 0-100
export function computeGainCurve(value: number, potential: number, factors = 1): number {
  const headroom = potential - value
  if (headroom <= 0) return 0
  return BASE_GAIN_PER_SESSION * (1 - Math.exp(-POTENTIAL_DAMPENING_K * headroom)) * factors
}

// ─── 2. Vínculo ───────────────────────────────────────────────────────────────

// GDD cap. 4 — el vínculo decae cada semana sin ranura Diálogo
export const BOND_DECAY_PER_WEEK_MIN = 2
export const BOND_DECAY_PER_WEEK_MAX = 3

// GDD cap. 3 — umbrales en los que se revelan atributos psicológicos del patinador
// [20] confianza, [40] resistenciaMental, [55] presionCompetitiva, [65] motivacionIntrinseca
export const BOND_LAYERS: readonly [20, 40, 55, 65] = [20, 40, 55, 65]

// ─── 3. Efectos por tipo de ranura semanal ────────────────────────────────────

// GDD cap. 17 — estructura de efectos por ranura; min/max para que el servicio aleatorice
export interface SlotDelta {
  readonly min: number
  readonly max: number
}

export interface SlotEffects {
  readonly fatiga: SlotDelta
  readonly estres: SlotDelta
  // % de probabilidad de evento de lesión; negativo = reduce riesgo acumulado
  readonly injuryRiskPct: number
  readonly vinculo?: SlotDelta
  readonly confianza?: SlotDelta
}

export type SlotTypeId = 'Tecnico' | 'Fisico' | 'Mental' | 'Descanso' | 'Ensayo' | 'Dialogo'

// GDD cap. 17 — tabla completa de efectos por tipo de ranura
export const SLOT_EFFECTS: Readonly<Record<SlotTypeId, SlotEffects>> = {
  // GDD cap. 17 — fatiga alta, estrés moderado, mayor riesgo de lesión
  Tecnico: {
    fatiga:        { min: 8,   max: 14  },
    estres:        { min: 3,   max: 5   },
    injuryRiskPct: 4,
  },
  // GDD cap. 17 — fatiga media, sin efecto técnico directo; base para resistencia/fuerza
  Fisico: {
    fatiga:        { min: 5, max: 8 },
    estres:        { min: 1, max: 3 },
    injuryRiskPct: 2,
  },
  // GDD cap. 17 — reduce estrés, gana confianza y vínculo; imprescindible 3 sem antes de competición
  Mental: {
    fatiga:        { min: 0,   max: 2   },
    estres:        { min: -10, max: -5  },
    injuryRiskPct: 0,
    confianza:     { min: 5,   max: 10  },
    vinculo:       { min: 1,   max: 3   },
  },
  // GDD cap. 17 — recuperación principal; reduce fatiga y estrés, disminuye riesgo de lesión
  Descanso: {
    fatiga:        { min: -30, max: -20 },
    estres:        { min: -12, max: -8  },
    injuryRiskPct: -2,
  },
  // GDD cap. 17 — mejora cohesión y PCS; fatiga baja, sin mejora de elementos técnicos
  Ensayo: {
    fatiga:        { min: 3, max: 6 },
    estres:        { min: -2, max: 1 },
    injuryRiskPct: 1,
  },
  // GDD cap. 17 — única vía de revelación de rasgos; boost de vínculo y reducción de estrés
  Dialogo: {
    fatiga:        { min: 0,  max: 2  },
    estres:        { min: -6, max: -3 },
    injuryRiskPct: 0,
    vinculo:       { min: 5,  max: 10 },
  },
} as const

// ─── 4. Motor TES — Technical Element Score ───────────────────────────────────

// GDD cap. 5 — identificadores de tipos de salto según nomenclatura ISU
export type JumpType = 'T' | 'S' | 'Lo' | 'F' | 'Lz' | 'A'
export type JumpRotations = 1 | 2 | 3 | 4

// GDD cap. 5 — valores base ISU por tipo de salto y número de rotaciones (temporada 2024)
// fuente: ISU Communication 2451; el 4A aún en evaluación experimental
export const JUMP_BASE_VALUES: Readonly<Record<JumpType, Readonly<Record<JumpRotations, number>>>> = {
  T:  { 1: 0.4, 2: 1.3, 3: 4.2, 4: 9.5  },  // Toeloop
  S:  { 1: 0.4, 2: 1.3, 3: 4.3, 4: 9.7  },  // Salchow
  Lo: { 1: 0.5, 2: 1.8, 3: 4.9, 4: 9.8  },  // Loop
  F:  { 1: 0.5, 2: 1.8, 3: 5.3, 4: 11.0 },  // Flip
  Lz: { 1: 0.6, 2: 2.1, 3: 5.9, 4: 13.6 },  // Lutz
  A:  { 1: 1.1, 2: 3.3, 3: 8.0, 4: 12.5 },  // Axel (siempre n+0.5 rotaciones, despegue frontal)
} as const

// GDD cap. 5 — multiplicador de GOE para Axels (despegue frontal = prima técnica)
export const AXEL_GOE_MULTIPLIER = 1.1

// GDD cap. 5 — rango válido de Grade of Execution por elemento
export const GOE_RANGE = { min: -5, max: 5 } as const

// GDD cap. 5 — pesos de cada factor sobre el GOE final de un elemento
// el servicio calcula: base + fatiguePenalty + positionDecay + pressureMod + gaussian(sigma)
export const GOE_WEIGHTS = {
  // fracción de (jump*0.4 + spin*0.3 + steps*0.3)/10 que se traslada al GOE base (escala 0-10 → -5/+5)
  technicalBase:  0.4,
  // reducción de GOE por cada punto de fatiga sobre FATIGUE_BLOCK_THRESHOLD
  fatigueImpact:  0.03,
  // reducción de GOE por posición en el programa (0=primer elemento, 7=último)
  positionDecay:  0.15,
  // modificación de GOE por punto de presionCompetitiva (puede ser positiva o negativa)
  pressureWeight: 0.05,
} as const

// ─── 5. Motor PCS — Program Component Score ───────────────────────────────────

// GDD cap. 5 — pesos de atributos fuente para cada componente del PCS (cada fila suma 1.0)
// SK Skating Skills, TR Transitions, PE Performance, CO Composition, IN Interpretation
export const PCS_ATTRIBUTE_WEIGHTS: Readonly<Record<string, Partial<Record<AttributeKey, number>>>> = {
  SK: { jump: 0.30, spin: 0.20, steps: 0.30, stamina: 0.20 },
  TR: { steps: 0.40, flexibility: 0.25, artistry: 0.35 },
  PE: { focus: 0.35, resilience: 0.30, artistry: 0.35 },
  CO: { artistry: 0.50, steps: 0.25, flexibility: 0.25 },
  IN: { artistry: 0.45, mentalStrength: 0.25, focus: 0.30 },
} as const

// GDD cap. 5 — coeficiente ISU de cada componente PCS (programa libre senior)
export const PCS_COMPONENT_COEFFICIENTS = {
  SK: 1.0,
  TR: 0.8,
  PE: 1.0,
  CO: 1.0,
  IN: 1.0,
} as const

// ─── 6. Varianza mental ───────────────────────────────────────────────────────

// GDD cap. 5 — desviación estándar de la varianza gaussiana de actuación
// estrictamente decreciente: alta resistenciaMental → actuaciones más consistentes
const SIGMA_MAX = 2.0   // varianza máxima con resistenciaMental = 0
const SIGMA_MIN = 0.3   // varianza mínima incluso con resistenciaMental = 100

// GDD cap. 5 — función pura: resistenciaMental ∈ [0, 100] → σ del ruido gaussiano del GOE
export function MENTAL_VARIANCE_SIGMA(resistenciaMental: number): number {
  return SIGMA_MIN + (SIGMA_MAX - SIGMA_MIN) * (1 - resistenciaMental / 100)
}

// ─── 7. Economía ─────────────────────────────────────────────────────────────

// GDD cap. 7 — premios ISU en USD por posición de podio (valores oficiales 2024)
export const ISU_PRIZE_MONEY = {
  GP: {
    1: 12_000,
    2:  9_000,
    3:  6_000,
    4:  3_000,
    5:  1_800,
    6:    900,
  },
  GP_FINAL: {
    1: 25_000,
    2: 18_000,
    3: 12_000,
    4:  5_000,
    5:  3_000,
    6:  1_000,
  },
  WORLDS: {
    1: 60_000,
    2: 45_000,
    3: 30_000,
    4: 18_000,
    5: 12_000,
    6:  6_000,
  },
} as const

// GDD cap. 7 — coste base semanal de un patinador activo en moneda del juego
// calibrado para que GP 1º ≈ 8 semanas de gastos (umbral estable)
export const WEEKLY_EXPENSE_BASE = 1_500

// GDD cap. 7 — umbrales de presión financiera expresados como semanas de reserva
// reserva = fondos_actuales / WEEKLY_EXPENSE_BASE
export const FINANCIAL_PRESSURE_THRESHOLDS = {
  stable:  8,   // > 8 semanas → sin presión
  mild:    4,   // 4-8 semanas → presión leve
  visible: 2,   // 2-4 semanas → presión visible
  // < 2 semanas → crisis (estado implícito al caer bajo `visible`)
} as const

// GDD cap. 7 — estrés semanal adicional que genera la presión financiera visible
export const PRESION_VISIBLE_STRESS_WEEKLY = 3
