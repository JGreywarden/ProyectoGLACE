// balance.ts — todas las constantes numéricas del juego derivadas del GDD
// los services consumen estas constantes; nunca números mágicos en el dominio

// ─── 1. Progresión de atributos ───────────────────────────────────────────────

// GDD cap. 17 — ganancia base por sesión antes de aplicar modificadores
export const BASE_GAIN_PER_SESSION = 2

// GDD cap. 17 — controla la velocidad a la que la ganancia se satura cerca del techo
// a mayor k, la curva satura más rápido; calibrado para 30-40 semanas de progresión visible
export const POTENTIAL_DAMPENING_K = 0.015

// GDD cap. 17 — fatiga acumulada por encima de este umbral bloquea mejora técnica
export const FATIGUE_BLOCK_THRESHOLD = 70

// GDD cap. 17 — estrés acumulado por encima de este umbral activa la tensión
// `paradoja_descanso_emocional` cuando la semana incluye una ranura de descanso
export const STRESS_HIGH_THRESHOLD = 70

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

// GDD cap. 17 — ventana de semanas sobre la que se mide la tendencia del vínculo
// para activar la tensión `dialogo_vs_hielo`. una sola semana es demasiado frágil
// (un evento positivo aislado desactiva la tensión); usar la suma de los deltas
// de las últimas N semanas captura mejor la noción de "vínculo en declive".
export const BOND_DECLINE_LOOKBACK_WEEKS = 3

// GDD cap. 3 — umbrales de vínculo en los que se revelan los **atributos psicológicos**
// del patinador. fuente única de verdad; `PSYCHOLOGICAL_THRESHOLDS` (en types/skater.ts)
// se deriva de aquí para evitar duplicación silenciosa.
// [20] confianza, [40] resistenciaMental, [55] presionCompetitiva, [65] motivacionIntrinseca
export const BOND_LAYERS: readonly [20, 40, 55, 65] = [20, 40, 55, 65]

// GDD cap. 3 — umbrales independientes para los **rasgos** (traits) del patinador.
// los rasgos viven en una dimensión distinta a los atributos psicológicos: el GDD
// agrupa los ~60 traits en tres capas de revelación (20, 40, 65), sin un escalón
// intermedio en 55 — por eso la lista no es idéntica a BOND_LAYERS. consumida por
// `computeTraitVisibilityLayer` y por el enum `TraitLayer`.
export const TRAIT_VISIBILITY_THRESHOLDS: readonly [20, 40, 65] = [20, 40, 65]

// GDD cap. 4 — pesos de selección semanal por tipo de evento narrativo. el motor
// usa weighted-random sobre el pool ya filtrado por condiciones y cooldowns. los
// valores reflejan el ritmo narrativo prescrito en el GDD (cotidiano dominante,
// crisis y logro_compartido escasos). consumido por `selectWeeklyEvent`.
export const NARRATIVE_WEEKLY_WEIGHTS = {
  cotidiano:        4,
  revelacion:       2,
  crisis:           1,
  decision_moral:   2,
  terceros:         2,
  logro_compartido: 1,
} as const

// GDD cap. 4 — número mínimo de semanas que deben pasar entre dos emisiones del
// mismo tipo. solo `crisis` y `revelacion` tienen cooldown duro: el resto admiten
// repetición consecutiva (ver `NARRATIVE_SOFT_COOLDOWN_FACTOR` para la mitigación).
export const NARRATIVE_COOLDOWN_WEEKS = {
  crisis:     3,
  revelacion: 4,
} as const

// GDD cap. 4 — multiplicador aplicado al peso del tipo de evento emitido la
// semana anterior. evita que dos cotidianos (o dos terceros, etc.) caigan dos
// semanas seguidas sin recurrir a un cooldown duro: el peso baja, no se anula.
// 0.3 es agresivo pero no exclusivo; un usuario puede repetir tipo si hay pocas
// alternativas. calibrado para que la diversidad de tipos sea visible sin matar
// la coherencia narrativa de "una racha de cotidianos".
export const NARRATIVE_SOFT_COOLDOWN_FACTOR = 0.3

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
// calibrado para que un elite con atributos ≈ 90 produzca GOE ≈ +2.0 sin ruido
export const GOE_WEIGHTS = {
  // fracción de (jump*0.4 + spin*0.3 + steps*0.3)/10 que se traslada al GOE base (escala 0-10 → -5/+5)
  technicalBase:  0.5,
  // reducción de GOE por cada punto de fatiga sobre FATIGUE_BLOCK_THRESHOLD
  fatigueImpact:  0.03,
  // reducción de GOE por posición en el programa (0=primer elemento, 7=último)
  positionDecay:  0.10,
  // escala del efecto de presionCompetitiva sobre el GOE, por punto de presión tras normalizar a [-1,1]
  pressureWeight: 0.5,
} as const

// GDD cap. 5 — factor por tipo de elemento que traduce GOE → TES añadido
// TES_elem = dificultadBase * (1 + goe * factor). ISU real usa 0.1 para saltos triples.
export const ELEMENT_GOE_TES_FACTOR: Readonly<Record<string, number>> = {
  salto:                 0.10,
  giro:                  0.10,
  secuenciaPasos:        0.10,
  secuenciaCoreografica: 0.05,
  espiral:               0.10,
} as const

// GDD cap. 5 — umbral por debajo del cual un salto se considera caída
// cuando el GOE final de un salto cae bajo este valor, cuenta como caída
export const FALL_GOE_THRESHOLD = -3

// GDD cap. 5 — deducción ISU por caída (1 pto por caída en senior)
export const FALL_DEDUCTION = 1.0

// GDD cap. 5 — penalización ISU genérica que TODO juez aplica a los elementos
// posteriores a una caída. Convertimos el factor en una resta plana
// `(1 - factor) * 5` para que también muerda cuando GOE ya es negativo.
// 0.94 → -0.3 GOE flat sobre cada elemento posterior (severidad media).
// Los jueces "anti-caídas" (p.ej. Anna Müller) sustituyen este valor con su propio
// `Judge.sesgos.postFallGoePenalty` (0.88 → -0.6 GOE flat, más severo).
export const DEFAULT_POST_FALL_GOE_PENALTY = 0.94

// GDD cap. 5 — un elemento con caída y GOE crítico se considera invalidado:
// no aporta TES (solo cuenta la deducción). emula la regla ISU de "no value"
// cuando un salto se ejecuta tan mal que el panel técnico lo descarta.
export const INVALIDATION_THRESHOLD = -4

// fatiga adicional que el patinador acumula entre programa corto y libre
// dentro del mismo evento (descanso intermedio limitado)
export const FATIGUE_BETWEEN_PROGRAMS = 6

// estrés añadido al patinador si cayó al menos una vez en el programa corto
// y aún tiene que afrontar el libre
export const STRESS_AFTER_FALL_INTERPROGRAM = 4


// ─── 5. Motor PCS — Program Component Score ───────────────────────────────────

// ISU senior women — cada componente entra con coeficiente 1.0 y luego el total
// se multiplica por el factor de programa (0.8 corto, 1.6 libre). Esto coincide
// con la convención ISU de pre-2022 (5 componentes); fuente de calibración real.
export const PCS_COMPONENT_COEFFICIENTS = {
  sk: 1.0,
  tr: 1.0,
  pe: 1.0,
  co: 1.0,
  in: 1.0,
} as const

// GDD cap. 5 / ISU senior women — factor de programa: PCS_total = Σ componentes · factor
// con 5 componentes en escala 0–10 cada uno, máximo teórico es 50·1.6 = 80 (libre)
// y 50·0.8 = 40 (corto). Calibrado para que la elite real (atributos ≈ 90) caiga
// en la franja olímpica observada: SP 60–80, FS 110–150 totales.
export const PCS_PROGRAM_FACTOR = {
  corto: 0.8,
  libre: 1.6,
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
// escalas intermedias (NATIONAL, INTERNATIONAL, EUROPEAN, OLYMPIC) calibradas por prestigio
export const ISU_PRIZE_MONEY = {
  NATIONAL: {
    1: 3_000,
    2: 2_000,
    3: 1_000,
  },
  INTERNATIONAL: {
    1: 6_000,
    2: 4_000,
    3: 2_500,
  },
  GP: {
    1: 12_000,
    2:  9_000,
    3:  6_000,
    4:  3_000,
    5:  1_800,
    6:    900,
  },
  EUROPEAN: {
    1: 30_000,
    2: 22_000,
    3: 15_000,
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
  OLYMPIC: {
    1: 100_000,
    2:  75_000,
    3:  50_000,
  },
} as const

// GDD cap. 7 — coste base semanal de un patinador activo en moneda del juego
// calibrado para que GP 1º ≈ 8 semanas de gastos (umbral estable)
export const WEEKLY_EXPENSE_BASE = 1_500

// GDD cap. 7 — subvención federativa base por semana (ajustada por reputacion.institucional)
export const FEDERATION_GRANT_BASE_WEEKLY = 800

// GDD cap. 7 — rango del multiplicador sobre la subvención federativa según reputacion.institucional (0-100)
export const FEDERATION_GRANT_MULT_MIN = 0.5
export const FEDERATION_GRANT_MULT_MAX = 1.5

// GDD cap. 7 — mantenimiento semanal por nivel de instalación construida
// acumulativo: una instalación nivel 3 cuesta 3× este valor por semana
export const WEEKLY_INSTALLATION_MAINTENANCE_PER_LEVEL = 120

// GDD cap. 7 — ventana de evaluación de cumplimiento para sponsors (semanas consecutivas)
export const SPONSOR_REVIEW_WINDOW_WEEKS = 3

// GDD cap. 7 — umbrales de presión financiera expresados como semanas de reserva
// reserva = fondos_actuales / weeklyExpenses
export const FINANCIAL_PRESSURE_THRESHOLDS = {
  stable:  8,   // > 8 semanas → sin presión
  mild:    4,   // 4-8 semanas → presión leve
  visible: 2,   // 2-4 semanas → presión visible
  // < 2 semanas → crisis (estado implícito al caer bajo `visible`)
} as const

// GDD cap. 7 — estrés semanal adicional que genera la presión financiera visible
export const PRESION_VISIBLE_STRESS_WEEKLY = 3

// GDD cap. 7 — estrés semanal adicional en crisis financiera (más severo que visible)
export const PRESION_CRISIS_STRESS_WEEKLY = 5

// GDD cap. 7 — coste fijo de viaje cuando la temporada incluye una competición.
// modela hotel + vuelos + per diem del staff acompañante. escala con prestigio
// del evento: nacional son ~1500€, mundiales ~10000€.
export const TRAVEL_COST_BY_COMPETITION_TYPE = {
  nacional:       1_500,
  internacional:  3_500,
  grandprix:      5_500,
  finalGrandprix: 8_000,
  europeo:        7_000,
  mundial:        9_500,
  olimpico:      12_000,
} as const

// ─── 8. Lesiones (Fase B) ─────────────────────────────────────────────────────

// GDD cap. 3 — la carga semanal por sí sola raramente supera el 8 % en una semana
// equilibrada. INJURY_LOAD_DIVISOR convierte esa carga a una probabilidad 0–1
// que `rollInjury` compara contra el rng de la semana. valor calibrado para que
// una semana de dos técnicos sin descanso (carga ≈ 8) ronde el 5–7 % de riesgo
// con un patinador sin historial; se amplifica si historialLesiones > 70 según
// `computeInjuryRisk`.
export const INJURY_LOAD_DIVISOR = 130

// GDD cap. 17 — multiplicador aplicado a la probabilidad de lesión semanal cuando
// la tensión `tecnico_vs_descanso` está activa (5+ semanas sin descanso). cobra
// la promesa del GDD "sin descanso 5+ semanas: evento lesión forzado" sin recurrir
// a un disparo determinista: el roll sigue siendo probabilístico pero el bono
// hace que ignorar la advertencia salga progresivamente más caro. calibrado para
// que dos técnicos en estado de overwork pasen de ~6 % a ~10 % de riesgo base.
export const OVERWORK_INJURY_MULTIPLIER = 1.6

// GDD cap. 3 — semanas seguidas sin ranura `descanso` antes de forzar una lesión
// garantizada (regla dura, no probabilística). el multiplicador OVERWORK sube la
// probabilidad antes; este umbral es el seguro de último recurso.
export const FORCED_OVERWORK_THRESHOLD = 5

// GDD cap. 3 — pesos para elegir severidad de la lesión cuando el roll dispara
// una. los pesos suman aproximadamente 1.0; cuerpo-frágil y historialLesiones>70
// recargan la cola hacia 'moderada' y 'grave' (ver injury.ts).
export const INJURY_SEVERITY_WEIGHTS = {
  leve:     0.60,
  moderada: 0.30,
  grave:    0.10,
} as const

// GDD cap. 3 — duración base de recuperación por severidad (semanas).
// el sistema rueda dentro del rango con el rng del momento de la lesión.
export const SEVERITY_RECOVERY_WEEKS = {
  leve:     { min: 1, max: 2  },
  moderada: { min: 3, max: 6  },
  grave:    { min: 8, max: 14 },
} as const

// GDD cap. 3 — incremento permanente de historialLesiones tras recuperarse
export const HISTORIAL_INCREASE_BY_SEVERITY = {
  leve:     5,
  moderada: 12,
  grave:    22,
} as const

// GDD cap. 3 — pérdida potencial de techo biológico tras una lesión grave
// solo se aplica a 'grave'; rango inclusivo (puntos enteros)
export const TECHO_LOSS_RANGE_GRAVE = { min: 1, max: 3 } as const

// GDD cap. 3 — probabilidad base de lesión post-competición por caída
// se modula por fatigaAcumulada y historialLesiones. una caída con fatiga 50
// y historial 20 ronda el 6 %; con dos caídas y fatiga > 70 sube al 25 %+.
export const FALL_INJURY_BASE_PROB = 0.04

// GDD cap. 3 — modificadores de probabilidad de lesión por rasgo
export const TRAIT_INJURY_MULTIPLIERS: Readonly<Record<string, number>> = {
  'resiliente':           0.5,
  'cuerpo-de-atleta':     0.7,
  'cuerpo-fragil':        1.4,
  'buscador-de-limites':  1.2,
  'desconectado-del-cuerpo': 1.15,
  'memoria-corporal':     0.85,  // recovers faster but small risk reduction baseline
} as const

// GDD cap. 3 — niveles de fisioterapia reducen la severidad escalada (probabilidad de
// "ascenso" de severidad) y aceleran la recuperación. multiplicador < 1 = bonus.
export const FISIO_RECOVERY_BONUS_PER_LEVEL = 0.05  // 5 % menos semanas por nivel
