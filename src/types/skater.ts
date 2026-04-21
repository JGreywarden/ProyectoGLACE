// domain types for skater data — central contract for all game logic

// ─── enums ───────────────────────────────────────────────────────────────────

/** bond threshold at which the trait becomes visible to the coach */
export enum TraitLayer {
  Visible = 0, // siempre visible desde el primer entrenamiento
  Bond20  = 1, // requiere vínculo >= 20
  Bond40  = 2, // requiere vínculo >= 40
  Bond65  = 3, // requiere vínculo >= 65
}

/** GDD category of the trait */
export enum TraitCategory {
  Technical     = 'tec',
  Physical      = 'fis',
  Psychological = 'psi',
  Identity      = 'ide',
}

/** inherent nature of the trait at baseline */
export enum TraitVariant {
  Positive = 'positivo',
  Negative = 'negativo',
  Neutral  = 'neutro',
}

// ─── trait types ─────────────────────────────────────────────────────────────

/** all 60 trait identifiers, kebab-case of the Spanish GDD name */
export type TraitId =
  | 'aprendiz-veloz'
  | 'cuerpo-de-atleta'
  | 'memoria-del-hielo'
  | 'presencia-escenica'
  | 'tecnico-nato'
  | 'nervioso-en-calentamiento'
  | 'competidor-nato'
  | 'lento-para-arrancar'
  | 'expresivo'
  | 'cuerpo-fragil'
  | 'explosivo'
  | 'disciplinado'
  | 'pendiente-del-resultado'
  | 'ritmo-natural'
  | 'carga-alta-cabeza-baja'
  | 'perfeccionista'
  | 'resiliente'
  | 'artista-nato'
  | 'fragil-bajo-presion'
  | 'memoria-corporal'
  | 'dependiente-del-elogio'
  | 'musico-frustrado'
  | 'solitario-funcional'
  | 'comparador'
  | 'imitador-brillante'
  | 'gestor-de-energia'
  | 'historial-de-abandono'
  | 'ansioso-ante-el-cambio'
  | 'hambre-de-hielo'
  | 'autoexigente-en-silencio'
  | 'proposito-difuso'
  | 'leal-hasta-el-limite'
  | 'hambre-de-reconocimiento'
  | 'miedo-a-la-verguenza-publica'
  | 'identidad-atletica-total'
  | 'herida-competitiva'
  | 'buscador-de-limites'
  | 'desconectado-del-cuerpo'
  | 'cargador-de-culpa'
  | 'voz-critica-interna'
  | 'necesita-explicaciones'
  | 'construido-para-las-finales'
  | 'actor-nato'
  | 'ritmo-propio'
  | 'nostalgia-del-juego-libre'
  | 'el-peso-de-otros'
  | 'el-momento-que-lo-cambio'
  | 'verguenza-del-cuerpo'
  | 'abandono-latente'
  | 'mentira-fundacional'
  | 'competidor-de-un-solo-rival'
  | 'vacio-despues-del-logro'
  | 'necesita-ser-visto'
  | 'amor-por-el-patinaje-puro'
  | 'el-secreto-fisico'
  | 'deuda-emocional'
  | 'miedo-a-convertirse'
  | 'nucleo-inquebrantable'
  | 'el-programa-que-guarda'
  | 'la-pregunta-sin-respuesta'

/** condition and description of a trait mutation path */
export interface TraitMutation {
  /** full description: trigger condition and mechanical consequence */
  description: string
}

/** static definition of a trait from the GDD — shared across all skaters */
export interface TraitDefinition {
  id:          TraitId
  /** display name in Spanish */
  name:        string
  /** bond layer at which the coach can discover this trait */
  layer:       TraitLayer
  category:    TraitCategory
  /** baseline nature: does it help, hurt, or depend on context? */
  variant:     TraitVariant
  /** flavor text — how the trait manifests in observable behavior */
  description: string
  /** exact mechanical effect on attributes and scores per GDD */
  mechanic:    string
  /** positive mutation path; null if none exists */
  mutPos:      TraitMutation | null
  /** negative mutation path; null if none exists */
  mutNeg:      TraitMutation | null
}

/** a trait as it exists on a specific skater instance */
export interface SkaterTrait {
  id:      TraitId
  /** false = trait exists but its trigger condition is not currently met */
  active:  boolean
  /** direction of mutation if the trait has mutated, null otherwise */
  mutated: 'positive' | 'negative' | null
}

// ─── attribute interfaces ─────────────────────────────────────────────────────

/** visible from session one; improved through technical training slots (0–100) */
export interface TechnicalAttributes {
  /** jump height, rotation, landing quality — core driver of TES */
  saltos:           number
  /** spin speed, axis position, centering */
  giros:            number
  /** ISU step sequence quality, pattern complexity level 1–4 */
  secuenciaDePasos: number
  /** limb extension, line quality — primary driver of PCS SK */
  amplitudLinea:    number
}

/** hidden from player; each field unlocks when bond reaches its threshold (0–100) */
export interface PsychologicalAttributes {
  /** unlocks at bond >= 20; governs error recovery during a program */
  confianza:            number
  /** unlocks at bond >= 40; drives second-half program consistency */
  resistenciaMental:    number
  /** unlocks at bond >= 55; positive values = amplifier, negative = risk */
  presionCompetitiva:   number
  /** unlocks at bond >= 65; foundation of long-term motivation */
  motivacionIntrinseca: number
  /** never unlocks via bond; only revealed through crisis or deep dialogue */
  autoexigencia:        number
}

/**
 * permanent physical constants set at skater creation.
 * @internal read only by the competition engine and injury system — never show to player
 */
export interface PhysicalPermanentAttributes {
  /** absolute ceiling for all technical attributes; can only stay equal or decrease */
  techosBiologico:       number
  /** cumulative injury history; only increases; >70 = exponential risk multiplier */
  historialLesiones:     number
  /** derived from techosBiologico and historialLesiones; affects recovery speed */
  velocidadRecuperacion: number
}

// ─── weekly state ─────────────────────────────────────────────────────────────

/** tracks a single injury from onset to full recovery */
export interface InjuryRecord {
  /** week number in which the injury occurred */
  injuredAtWeek:          number
  /** total planned recovery duration in weeks */
  recoveryWeeksTotal:     number
  /** weeks remaining until the skater returns to full training */
  recoveryWeeksRemaining: number
}

/** mutable state that evolves each game week */
export interface WeeklyState {
  /** coach-skater bond; decays ~2–3 pts/week without a Dialogue slot */
  vinculo:           number
  /** >70 blocks technical improvement; reduced by Rest slots */
  fatigaAcumulada:   number
  /** affects GOE and PCS; above 65 is risk territory */
  estres:            number
  /** cumulative weeks of training since season start */
  semanasEntrenadas: number
  /** active injury record; null when skater is healthy */
  currentInjury:     InjuryRecord | null
}

// ─── main entity ──────────────────────────────────────────────────────────────

export interface SkaterData {
  id:            string
  name:          string
  /** age in years at the start of the current season */
  age:           number
  /** ISO 3166-1 alpha-2 country code */
  nationality:   string
  technical:     TechnicalAttributes
  psychological: PsychologicalAttributes
  /** @internal never expose physical attributes in UI state */
  physical:      PhysicalPermanentAttributes
  traits:        SkaterTrait[]
  weeklyState:   WeeklyState
  /** season number of retirement; null if still active */
  retiredAt:     number | null
}

// ─── visibility constants ─────────────────────────────────────────────────────

/**
 * minimum bond value required to reveal each psychological attribute.
 * -1 is a sentinel meaning "never revealed by bond alone" (event/dialogue only).
 */
export const PSYCHOLOGICAL_THRESHOLDS: Readonly<Record<keyof PsychologicalAttributes, number>> = {
  confianza:            20,
  resistenciaMental:    40,
  presionCompetitiva:   55,
  motivacionIntrinseca: 65,
  autoexigencia:        -1,
}

// ─── trait catalog ────────────────────────────────────────────────────────────

export const TRAITS: readonly TraitDefinition[] = [
  {
    id: 'aprendiz-veloz',
    name: 'Aprendiz veloz',
    layer: TraitLayer.Visible,
    category: TraitCategory.Technical,
    variant: TraitVariant.Neutral,
    description: 'Incorpora elementos nuevos por encima de la media. En los primeros entrenamientos es visible: absorbe correcciones antes de que termines la frase.',
    mechanic: 'Saltos, Giros y Pasos mejoran un 25% más rápido. Las primeras 4 semanas con un elemento nuevo son especialmente eficientes.',
    mutPos: null,
    mutNeg: { description: 'Plateado prematuro — si el entrenamiento no escala en dificultad, la curva se aplana antes que la media.' },
  },
  {
    id: 'cuerpo-de-atleta',
    name: 'Cuerpo de atleta',
    layer: TraitLayer.Visible,
    category: TraitCategory.Physical,
    variant: TraitVariant.Positive,
    description: 'Una base física que se ve antes de que el patinador haga nada especial. La forma en que calienta, la posición natural de descanso.',
    mechanic: 'Fatiga acumula un 20% más lento. Umbral de lesión por carga elevado. Recuperación post-competición más rápida.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'memoria-del-hielo',
    name: 'Memoria del hielo',
    layer: TraitLayer.Visible,
    category: TraitCategory.Technical,
    variant: TraitVariant.Positive,
    description: 'Los elementos que aprende, los retiene. Semanas sin practicar un salto y sigue estando ahí, dormido pero presente.',
    mechanic: 'Atributos técnicos se degradan un 50% más lento en semanas sin ranuras de ese tipo. Útil en periodos de transición.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'presencia-escenica',
    name: 'Presencia escénica',
    layer: TraitLayer.Visible,
    category: TraitCategory.Technical,
    variant: TraitVariant.Neutral,
    description: 'Hay algo que cambia cuando este patinador sale al hielo. No es técnica. Es difícil de nombrar pero los jueces lo notan.',
    mechanic: 'PCS Performance base +4. Ningún entrenamiento puede enseñar este rasgo. Solo se potencia o se destruye.',
    mutPos: { description: 'Intérprete — con Artista nato activo y coreógrafo nivel 3+, PE e IN crecen de forma sinérgica.' },
    mutNeg: { description: 'Superficie vacía — si el vínculo cae por debajo de 20, la presencia pierde autenticidad. PCS Performance -3.' },
  },
  {
    id: 'tecnico-nato',
    name: 'Técnico nato',
    layer: TraitLayer.Visible,
    category: TraitCategory.Technical,
    variant: TraitVariant.Positive,
    description: 'La mecánica del movimiento sobre el hielo le es natural. Encuentra las posiciones correctas por instinto antes de que las expliques.',
    mechanic: 'GOE base +0.3 en todos los elementos técnicos. Aprende correcciones técnicas en la mitad de tiempo.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'nervioso-en-calentamiento',
    name: 'Nervioso en calentamiento',
    layer: TraitLayer.Visible,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'El calentamiento previo a competición es visible y distinto al del entrenamiento. Más errores, menos fluidez. Cambia cuando suena la música.',
    mechanic: 'Primer elemento del programa: GOE -0.5. Del segundo elemento en adelante: sin efecto. Detectable desde la primera competición.',
    mutPos: { description: 'Ritual propio — con trabajo mental durante 3 temporadas, transforma la ansiedad en concentración. El calentamiento sigue siendo intenso pero ya no es miedo.' },
    mutNeg: { description: 'Pánico de inicio — sin gestión psicológica, el primer elemento contamina el segundo. GOE -0.3 en los dos primeros.' },
  },
  {
    id: 'competidor-nato',
    name: 'Competidor nato',
    layer: TraitLayer.Visible,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Positive,
    description: 'Hay patinadores que entrenan bien y compiten regular. Este funciona al revés. Algo en el contexto competitivo le activa.',
    mechanic: 'En competición oficial, todos los atributos técnicos añaden +5% de rendimiento sobre el valor de entrenamiento.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'lento-para-arrancar',
    name: 'Lento para arrancar',
    layer: TraitLayer.Visible,
    category: TraitCategory.Physical,
    variant: TraitVariant.Negative,
    description: 'Las primeras semanas de temporada son siempre por debajo de lo esperado. No es desidia. Es que el cuerpo de este patinador necesita más tiempo de encendido.',
    mechanic: 'Semanas 1-6: progresión técnica -30%. Semanas 7+: sin efecto. Puede confundirse con falta de compromiso si no se entiende.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'expresivo',
    name: 'Expresivo',
    layer: TraitLayer.Visible,
    category: TraitCategory.Technical,
    variant: TraitVariant.Positive,
    description: 'Cuando patina, algo llega. No siempre es el mejor técnicamente en la sala pero es el que más se recuerda al salir.',
    mechanic: 'PCS Interpretation base +5. Beneficio máximo en programas musicalmente complejos y con coreógrafo de alto nivel.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'cuerpo-fragil',
    name: 'Cuerpo frágil',
    layer: TraitLayer.Visible,
    category: TraitCategory.Physical,
    variant: TraitVariant.Negative,
    description: 'Lesiones frecuentes desde el historial. El cuerpo responde bien al trabajo técnico pero al límite del umbral, se quiebra.',
    mechanic: 'Riesgo de lesión por ranura técnica +8%. Sin descanso 3+ semanas: riesgo exponencial. Techo biológico puede caer con sobreentrenamiento.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'explosivo',
    name: 'Explosivo',
    layer: TraitLayer.Visible,
    category: TraitCategory.Physical,
    variant: TraitVariant.Neutral,
    description: 'Saltos de altura inusual para su peso. En entrenamiento es una maravilla. En competición, la consistencia no siempre acompaña a la espectacularidad.',
    mechanic: 'Techo potencial de saltos +10 puntos. Varianza GOE en saltos x1.4. Puede marcar los mejores GOE del circuito y también los peores.',
    mutPos: { description: 'Controlado — con Resistencia Mental alta y trabajo técnico consistente, la varianza reduce gradualmente.' },
    mutNeg: null,
  },
  {
    id: 'disciplinado',
    name: 'Disciplinado',
    layer: TraitLayer.Visible,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Llega antes, se queda después. Ejecuta el plan sin necesidad de recordatorio. El tipo de patinador que hace mejores entrenadores a quienes les enseñan.',
    mechanic: 'Ranuras técnicas producen un 10% más de progresión. Nunca genera eventos de resistencia al plan de entrenamiento.',
    mutPos: null,
    mutNeg: { description: 'Automatizado — sin variedad en el entrenamiento durante 4+ semanas, la disciplina se convierte en robotismo. PCS Performance -0.2.' },
  },
  {
    id: 'pendiente-del-resultado',
    name: 'Pendiente del resultado',
    layer: TraitLayer.Visible,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Después de cada elemento mira el panel de puntuación antes de mirarte a ti. No es inseguridad, es una forma de ubicarse en el mundo que aprendió pronto.',
    mechanic: 'Alta correlación entre posición en el marcador y rendimiento en la segunda mitad del programa. Liderando: +0.2 GOE. Persiguiendo: -0.3.',
    mutPos: { description: 'Enfocado en el proceso — con trabajo mental regular y vínculo >50, aprende a desconectar el marcador.' },
    mutNeg: null,
  },
  {
    id: 'ritmo-natural',
    name: 'Ritmo natural',
    layer: TraitLayer.Visible,
    category: TraitCategory.Technical,
    variant: TraitVariant.Positive,
    description: 'Su cuerpo interpreta la música antes de que la mente procese el tempo. El ice dance nació para patinadores como este.',
    mechanic: 'PCS Transitions +5 base. Programas con alta cohesión musical potencian este rasgo. Tiempo de aprendizaje de secuencias de pasos -20%.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'carga-alta-cabeza-baja',
    name: 'Carga alta, cabeza baja',
    layer: TraitLayer.Visible,
    category: TraitCategory.Physical,
    variant: TraitVariant.Neutral,
    description: 'Puede soportar volúmenes de entrenamiento que dejarían agotado a cualquier otro. No se queja. Tampoco avisa cuando el cuerpo empieza a pedir parar.',
    mechanic: 'Umbral de fatiga visible desplazado +15. Pero las señales de sobreentrenamiento llegan tarde: el riesgo de lesión se acumula en silencio.',
    mutPos: null,
    mutNeg: { description: 'Silencio peligroso — sin la instalación de Centro Médico nivel 3+, la detección temprana de lesiones falla. El daño acumulado puede ser permanente.' },
  },
  {
    id: 'perfeccionista',
    name: 'Perfeccionista',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'No termina el entrenamiento hasta que el elemento esté bien. No el bien que sería suficiente para el marcador; el bien que sería suficiente para él.',
    mechanic: 'Trabajo técnico repetitivo: eficiencia +15%. En semanas de carga alta, aprovecha mejor cada ranura técnica.',
    mutPos: { description: 'Excelencia técnica — con gestión de estrés correcta y vínculo >40: atributos técnicos crecen más rápido que cualquier otro rasgo.' },
    mutNeg: { description: 'Autoexigencia destructiva — estrés >65 durante 4+ semanas sin trabajo mental: el perfeccionismo se vuelve paralizante. Estrés +5/semana extra.' },
  },
  {
    id: 'resiliente',
    name: 'Resiliente',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Positive,
    description: 'Se cae. Se levanta. No actúa como si no hubiera caído: lo procesa en silencio y vuelve. El rasgo más valioso en patinadores de largo recorrido.',
    mechanic: 'Resistencia Mental base +10. Recuperación de estrés post-caída o mala competición: doble de rápido. Riesgo de mutación hacia rasgo destructivo: mínimo.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'artista-nato',
    name: 'Artista nato',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Technical,
    variant: TraitVariant.Neutral,
    description: 'Entiende la música de una manera que no puedes enseñar. Cuando el programa cuadra, hay momentos en los que el público deja de respirar.',
    mechanic: 'PCS Artística crece +30% más rápido. Interpretation puede alcanzar valores que otros patinadores no pueden con el mismo nivel técnico.',
    mutPos: { description: 'Artista plena — con coreógrafo nivel 3+ y Estudio de Coreografía avanzado: IN puede superar su techo teórico en competiciones importantes.' },
    mutNeg: { description: 'Arte instrumentalizado — si el entrenador prioriza siempre los resultados sobre el programa: el rasgo pierde autenticidad. PCS Interpretation cap -8.' },
  },
  {
    id: 'fragil-bajo-presion',
    name: 'Frágil bajo presión',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'En entrenamientos y competiciones pequeñas, es otro patinador. En los grandes, algo cambia. No siempre es visible hasta que ya ha pasado.',
    mechanic: 'En competiciones de nivel 3+: varianza GOE x1.6. La segunda mitad del programa tiene riesgo elevado de caída en Resistencia Mental.',
    mutPos: { description: 'Controlado — trabajo mental regular en Actos I-III y buenos resultados en 2 competiciones seguidas: la presión se convierte en energía.' },
    mutNeg: { description: 'Pánico competitivo — 3 malos resultados seguidos sin gestión psicológica: el rasgo se profundiza. Umbral de activación se baja a nivel 2.' },
  },
  {
    id: 'memoria-corporal',
    name: 'Memoria corporal',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Physical,
    variant: TraitVariant.Positive,
    description: 'Cuando vuelve de una lesión, el cuerpo recuerda. No necesita reaprender desde cero. La recuperación tiene una calidad diferente a la del primer aprendizaje.',
    mechanic: 'Tiempo de recuperación técnica post-lesión -40%. Los atributos técnicos previos a la lesión se restauran más rápido que en patinadores sin este rasgo.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'dependiente-del-elogio',
    name: 'Dependiente del elogio',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Florece con el feedback positivo. No es vanidad: es que aprendió que valía por lo que le decían que valía, antes de aprenderlo por sí mismo.',
    mechanic: 'Ranuras de Diálogo con feedback positivo: vínculo +5 extra. Semanas sin feedback directo: progresión técnica -10%.',
    mutPos: { description: 'Autoafirmado — con vínculo >60 y trabajo de raíz psicológica: aprende a validarse sin necesitar confirmación externa.' },
    mutNeg: null,
  },
  {
    id: 'musico-frustrado',
    name: 'Músico frustrado',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Identity,
    variant: TraitVariant.Positive,
    description: 'Estudió música antes que el patinaje, o quiso hacerlo. La conexión con la partitura no es metafórica. Escucha cosas en la música que otros no escuchan.',
    mechanic: 'PCS Interpretation +6 en programas con música de alta complejidad armónica. El Diseñador de Programas sugiere opciones adicionales cuando este rasgo está activo.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'solitario-funcional',
    name: 'Solitario funcional',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Entrena mejor solo que en grupo. No es antisocial. Es que la concentración que necesita para trabajar bien requiere un espacio que las dinámicas de grupo no pueden darle.',
    mechanic: 'Sesiones individuales: progresión técnica +12%. En días con otros patinadores en pista: progresión -8%. Residencia del club puede ser fuente de conflicto.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'comparador',
    name: 'Comparador',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Su rendimiento fluctúa según lo que ve hacer a los demás. No es envidia: es un sistema de referencia que no aprendió a interiorizar.',
    mechanic: 'Si un rival directo compite en el mismo evento: varianza de rendimiento x1.3 en ambas direcciones. Puede superar su nivel o quedar muy por debajo.',
    mutPos: { description: 'Enfocado en sí mismo — con trabajo mental y conversaciones de vínculo sobre su propia trayectoria: el comparador deja de necesitar el espejo.' },
    mutNeg: null,
  },
  {
    id: 'imitador-brillante',
    name: 'Imitador brillante',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Technical,
    variant: TraitVariant.Positive,
    description: 'Aprende viendo. Si tiene acceso a video de alta calidad de los mejores ejecutando un elemento, la curva de aprendizaje se acorta drásticamente.',
    mechanic: 'Con Sala de Análisis de Vídeo nivel 2+: tiempo de aprendizaje de nuevos elementos -30%. Sin acceso a vídeo, el rasgo no se activa.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'gestor-de-energia',
    name: 'Gestor de energía',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Physical,
    variant: TraitVariant.Positive,
    description: 'Administra el esfuerzo a lo largo del programa de una manera que no puedes enseñar del todo. Siempre llega al final con algo que los otros ya no tienen.',
    mechanic: 'GOE de los tres últimos elementos del programa libre: +0.3 adicional. Beneficio mayor cuanto mayor es la duración del programa.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'historial-de-abandono',
    name: 'Historial de abandono',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Identity,
    variant: TraitVariant.Negative,
    description: 'Ha dejado otra actividad antes. A veces dos. No por fracaso: simplemente dejó de encontrar razones para quedarse. Eso puede pasar aquí también.',
    mechanic: 'Señal de alerta temprana activa desde el primer momento. Con vínculo <30 durante 4+ semanas: riesgo de abandono se duplica.',
    mutPos: null,
    mutNeg: { description: 'Abandono silencioso — sin intervención de vínculo antes de la semana 8: el patinador puede no renovar sin aviso previo.' },
  },
  {
    id: 'ansioso-ante-el-cambio',
    name: 'Ansioso ante el cambio',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Los programas nuevos cuestan más de asentar. Las temporadas con grandes cambios técnicos son más difíciles para este patinador que para la mayoría.',
    mechanic: 'Primera temporada con un programa nuevo: cohesión PCS -8% en las primeras 6 semanas. Cambios de coreógrafo o instalaciones generan estrés +5.',
    mutPos: { description: 'Flexible — con suficientes ciclos de adaptación exitosa y vínculo alto: la ansiedad por el cambio se convierte en una mayor atención al detalle.' },
    mutNeg: null,
  },
  {
    id: 'hambre-de-hielo',
    name: 'Hambre de hielo',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Technical,
    variant: TraitVariant.Neutral,
    description: 'Quiere más tiempo de pista que el que le das. Llega antes. Se queda después. El hielo es el lugar donde el mundo tiene sentido.',
    mechanic: 'Ranuras técnicas adicionales voluntarias (si el patinador las genera solo): eficiencia +10%. Pero sin ranuras de Descanso adecuadas: este rasgo aumenta riesgo de sobreentrenamiento.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'autoexigente-en-silencio',
    name: 'Autoexigente en silencio',
    layer: TraitLayer.Bond20,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'No lo verás en los entrenamientos. Lo verás en cómo llega al día siguiente: peor o mejor, nunca igual. Se evalúa en privado y no comparte los resultados.',
    mechanic: 'Progresión técnica ligeramente superior a la media (+8%) por la presión interna. Pero el estrés acumulado no es visible en la interfaz estándar.',
    mutPos: { description: 'Autoconocimiento — con conversaciones de vínculo profundas: aprende a leer su propio nivel sin autocastigo.' },
    mutNeg: { description: 'Autoexigencia destructiva — si el vínculo no permite conversaciones honestas: el estrés acumulado genera un techo invisible de rendimiento.' },
  },
  {
    id: 'proposito-difuso',
    name: 'Propósito difuso',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Identity,
    variant: TraitVariant.Negative,
    description: 'No ha encontrado su razón para patinar. Las respuestas que da cuando se le pregunta suenan a respuestas que le enseñaron a dar. Detrás hay un silencio.',
    mechanic: 'Motivación intrínseca base baja. Progresión -30% más lenta. Riesgo de abandono activo. Necesita trabajo de vínculo profundo para resolverse.',
    mutPos: { description: 'Propósito encontrado — conversación de revelación + vínculo >60 + resultado significativo: transforma toda la curva de progresión.' },
    mutNeg: { description: 'Quemado — motivación <30 durante 6+ semanas sin intervención: abandono probable con coste alto de reputación.' },
  },
  {
    id: 'leal-hasta-el-limite',
    name: 'Leal hasta el límite',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Antepone la relación al resultado. Cuando el vínculo es alto, lo da todo. Cuando es bajo, no se queja. Simplemente hace lo que se le pide y nada más.',
    mechanic: 'Con vínculo >65: +10% rendimiento en todo el sistema. Con vínculo <35: -12%. El efecto es invisible hasta que el vínculo cruza el umbral.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'hambre-de-reconocimiento',
    name: 'Hambre de reconocimiento',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Necesita que el mundo vea lo que hace. No de forma narcisista: de forma hambrienta. Creció en un contexto donde el valor se medía en aplausos.',
    mechanic: 'Resultados visibles en competiciones importantes: motivación +15, progresión +10% siguiente mes. Temporadas sin podio: motivación cae gradualmente.',
    mutPos: { description: 'Seguro de sí mismo — con vínculo >55 y trabajo psicológico específico: aprende a distinguir el valor del reconocimiento.' },
    mutNeg: { description: 'Vacío entre logros — si hay un gran resultado seguido de meses sin visibilidad: estrés +8/semana hasta el siguiente evento importante.' },
  },
  {
    id: 'miedo-a-la-verguenza-publica',
    name: 'Miedo a la vergüenza pública',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'No es el miedo al fracaso. Es el miedo a que el fracaso sea visto. Caer en el entrenamiento es tolerable. Caer ante 8.000 personas y un panel de jueces es diferente.',
    mechanic: 'En competiciones transmitidas o de alta audiencia: varianza GOE x1.5. Caída pública genera estrés adicional que persiste 2 semanas.',
    mutPos: { description: 'Liberado — evento narrativo específico de reconciliación con una caída pública + vínculo >65: el miedo pierde su poder.' },
    mutNeg: null,
  },
  {
    id: 'identidad-atletica-total',
    name: 'Identidad atlética total',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Identity,
    variant: TraitVariant.Neutral,
    description: "El patinaje no es lo que hace. Es lo que es. No hay un 'él' separado del patinador. Eso le da una dedicación extraordinaria y un punto ciego enorme.",
    mechanic: 'Motivación base muy alta. Progresión consistente. Pero una lesión grave o retirada forzada activa un evento de crisis de identidad que puede ser el más largo del juego.',
    mutPos: null,
    mutNeg: { description: 'Crisis de identidad — lesión con >4 semanas de recuperación: activa evento narrativo de alta intensidad. Sin vínculo alto, el proceso puede no resolverse.' },
  },
  {
    id: 'herida-competitiva',
    name: 'Herida competitiva',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Identity,
    variant: TraitVariant.Neutral,
    description: 'Hay un resultado del pasado que no ha cerrado. No lo menciona. Pero el rendimiento en ese tipo específico de competición lleva esa cicatriz.',
    mechanic: 'En el tipo de competición donde ocurrió el evento formativo: GOE -0.4 y varianza aumentada. Hasta que se resuelve la herida narrativa, el lastre persiste.',
    mutPos: { description: 'Cicatriz cerrada — evento narrativo de resolución + resultado positivo en esa competición específica: el lastre desaparece y deja un +0.2 residual.' },
    mutNeg: null,
  },
  {
    id: 'buscador-de-limites',
    name: 'Buscador de límites',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Physical,
    variant: TraitVariant.Neutral,
    description: 'Se pone a sí mismo en el borde de lo posible. No por irresponsabilidad: porque la zona de confort le resulta intolerable. Aprende en el límite o no aprende.',
    mechanic: 'Progresión técnica en elementos de alta dificultad +20%. Riesgo de lesión en ranuras técnicas +15%. No responde bien a planes de entrenamiento conservadores.',
    mutPos: null,
    mutNeg: { description: 'Fractura de desarrollo — sin Centro Médico nivel 2+ y sin trabajo de vínculo que modere el impulso: el historial de lesiones sube más rápido que el techo biológico.' },
  },
  {
    id: 'desconectado-del-cuerpo',
    name: 'Desconectado del cuerpo',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Physical,
    variant: TraitVariant.Negative,
    description: 'No reconoce las señales de fatiga o dolor hasta que son difíciles de ignorar. No es inconsciencia: es que aprendió que escuchar el cuerpo era rendirse.',
    mechanic: 'Señales de sobreentrenamiento llegan con 2 semanas de retraso. La detección temprana del sistema se vuelve menos fiable. Sistema de IA del club no puede compensarlo del todo.',
    mutPos: { description: 'Escucha activa — trabajo combinado de Centro Médico y trabajo mental durante 2 temporadas: aprende a leer las señales antes de que sea tarde.' },
    mutNeg: null,
  },
  {
    id: 'cargador-de-culpa',
    name: 'Cargador de culpa',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Negative,
    description: 'Cuando algo sale mal, lo internaliza todo. No pide explicaciones. No busca causas externas. Asume que la responsabilidad es suya, incluso cuando no lo es.',
    mechanic: 'Mal resultado competitivo: estrés +10 adicional que persiste si no hay conversación de diálogo esa semana.',
    mutPos: { description: 'Responsabilidad sana — con vínculo alto y conversaciones específicas: aprende a distinguir responsabilidad real de culpa asumida por defecto.' },
    mutNeg: { description: 'Parálisis — estrés acumulado >75 sin intervención: el autocastigo interfiere con la ejecución técnica. GOE -0.3 en competiciones de alta presión.' },
  },
  {
    id: 'voz-critica-interna',
    name: 'Voz crítica interna',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Durante la actuación, hay una voz que evalúa cada elemento en tiempo real. Cuando va bien, es un motor. Cuando algo sale mal, puede convertirse en ruido que destruye lo que queda.',
    mechanic: 'Ejecución perfecta de los primeros 3 elementos: +0.3 GOE acumulado en el resto. Primera caída: -0.5 GOE en los siguientes 2 elementos.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'necesita-explicaciones',
    name: 'Necesita explicaciones',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Aprende más rápido cuando entiende el porqué. Las instrucciones sin contexto las ejecuta, pero sin la misma calidad. Necesita que el entrenamiento tenga sentido.',
    mechanic: 'Ranuras técnicas con explicación narrativa (disponible en diálogo): progresión +15%. Sin explicación: progresión estándar o -5%.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'construido-para-las-finales',
    name: 'Construido para las finales',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Technical,
    variant: TraitVariant.Positive,
    description: 'Los números que importan los patina mejor que los que no importan. Como si el sistema nervioso de este patinador funcionara a otro nivel cuando hay algo real en juego.',
    mechanic: 'En Grand Prix Final, Campeonato de Europa y Mundial: +8% rendimiento global. Incompatible con Frágil bajo presión — si ambos existen, se anulan mutuamente.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'actor-nato',
    name: 'Actor nato',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Technical,
    variant: TraitVariant.Neutral,
    description: 'Puede habitar un personaje de una manera que otros patinadores solo imitan. Cuando el programa tiene una narrativa, se convierte en ella.',
    mechanic: 'PCS Interpretation +7 en programas con personaje narrativo definido. El Diseñador de Programas genera opciones adicionales cuando este rasgo está activo.',
    mutPos: { description: 'Intérprete total — con Artista nato activo y coreógrafo nivel 4: el número de exhibición puede generar un evento de legado narrativo.' },
    mutNeg: null,
  },
  {
    id: 'ritmo-propio',
    name: 'Ritmo propio',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Technical,
    variant: TraitVariant.Neutral,
    description: 'Tiene un tempo interno que no siempre coincide con la música. Puede ser su mayor obstáculo o su firma artística más reconocible, dependiendo de cómo se trabaje.',
    mechanic: 'Programas con estructura musical convencional: PCS Transitions -3. Programas diseñados para su tempo específico: PCS Transitions +8 y Interpretation +5.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'nostalgia-del-juego-libre',
    name: 'Nostalgia del juego libre',
    layer: TraitLayer.Bond40,
    category: TraitCategory.Identity,
    variant: TraitVariant.Neutral,
    description: 'Hay un momento en su historia donde patinar era solo disfrute. Sin jueces. Sin elementos obligatorios. Solo hielo y movimiento. Sabe exactamente cuándo dejó de serlo.',
    mechanic: 'Ranuras de Descanso en el hielo (tipo: Yuna de noche) pueden activar este rasgo como fuente de rejuvenecimiento. PCS Performance +3 la semana siguiente.',
    mutPos: { description: 'Conexión recuperada — con vínculo >55 y conversación específica: puede integrar ese placer original en la competición.' },
    mutNeg: null,
  },
  {
    id: 'el-peso-de-otros',
    name: 'El peso de otros',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Negative,
    description: 'Hay alguien fuera del hielo que depende emocionalmente de su éxito. No lo dice. Pero cada resultado importante lleva ese peso además del suyo.',
    mechanic: 'Motivación muy alta. Riesgo de burnout cuando los resultados no llegan. Sin conversación de revelación, el entrenador no puede actuar sobre esta variable.',
    mutPos: null,
    mutNeg: { description: 'Colapso por deuda — si hay una mala temporada sin conversación honesta: el patinador puede colapsar de forma que el sistema no predice.' },
  },
  {
    id: 'el-momento-que-lo-cambio',
    name: 'El momento que lo cambió',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Neutral,
    description: 'Ocurrió algo específico que redefinió su relación con el patinaje. Puede haber sido una victoria, una derrota, o algo que no tuvo nada que ver con el hielo.',
    mechanic: 'Determina cómo responde a situaciones extremas. El sistema no puede predecir el efecto hasta que el evento es revelado en conversación de vínculo >65.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'verguenza-del-cuerpo',
    name: 'Vergüenza del cuerpo',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Negative,
    description: 'La relación con su propio cuerpo físico tiene grietas que el patinaje no cerró. En algunos momentos, ante ciertos jueces o ciertos públicos, algo cambia en la calidad de la presencia.',
    mechanic: 'PCS Performance puede caer -5 en eventos específicos (galas televisadas, competiciones con alta cobertura visual). La causa no es visible sin conversación profunda.',
    mutPos: { description: 'Reconciliación — evento narrativo específico (requiere vínculo >70): uno de los eventos más significativos del juego, con efecto permanente sobre PCS.' },
    mutNeg: null,
  },
  {
    id: 'abandono-latente',
    name: 'Abandono latente',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Negative,
    description: 'En el fondo, lleva meses pensando en dejarlo. No es visible en el hielo. No es visible en los entrenamientos. Solo aparece si construiste suficiente para que pueda decirlo.',
    mechanic: 'Solo visible con vínculo >65 o en evento de crisis. Si no se detecta antes de la semana 20: riesgo de no renovación muy alto.',
    mutPos: { description: 'Decisión propia — con vínculo alto y conversación honesta: puede decidir quedarse o irse desde un lugar auténtico. Cualquiera de las dos es correcta.' },
    mutNeg: null,
  },
  {
    id: 'mentira-fundacional',
    name: 'Mentira fundacional',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Negative,
    description: 'Hay algo sobre por qué empezó a patinar que no es lo que dice. No es malicia. Es que la historia real no tiene la forma que quería que tuviera.',
    mechanic: 'Afecta la resolución del rasgo Propósito difuso: si este rasgo existe, el propósito verdadero no puede encontrarse con la historia oficial activa.',
    mutPos: { description: 'Historia real — cuando se revela con vínculo >70: desbloquea la conversación de propósito más profunda del juego.' },
    mutNeg: null,
  },
  {
    id: 'competidor-de-un-solo-rival',
    name: 'Competidor de un solo rival',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Neutral,
    description: 'Toda su motivación está anclada a una persona específica del circuito. Cuando ese rival no está, algo cambia. No en el técnico. En el por qué.',
    mechanic: 'En competiciones donde el rival específico está presente: +12% rendimiento. Sin el rival en el circuito: motivación -15%.',
    mutPos: { description: 'Motivación propia — conversación de vínculo específica + evento narrativo con el rival: puede liberar la motivación de esa dependencia.' },
    mutNeg: null,
  },
  {
    id: 'vacio-despues-del-logro',
    name: 'Vacío después del logro',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Negative,
    description: 'Cada vez que alcanza un objetivo importante, aparece el vacío. No duración días. A veces semanas. El objetivo cumplido deja de tener peso en el momento en que llega.',
    mechanic: 'Semana tras un gran logro (medalla mundial, clasificación olímpica): motivación -20, estrés +10 sin causa aparente. Visible como anomalía sin contexto.',
    mutPos: { description: 'Propósito más allá del logro — con vínculo >70 y trabajo de identidad profundo: puede aprender a habitar los logros sin quedarse vacío.' },
    mutNeg: { description: 'Espiral post-logro — sin gestión: el vacío puede profundizarse con cada logro. El mayor éxito puede activar la señal de retirada más inesperada.' },
  },
  {
    id: 'necesita-ser-visto',
    name: 'Necesita ser visto',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Neutral,
    description: 'Debajo de todo el resto: necesita que alguien lo vea de verdad. No el rendimiento. No el resultado. Él. Esto no lo dice con palabras. Pero lo dice con todo lo demás.',
    mechanic: 'Vínculo creció por razones mecánicas pero no ha tenido conversaciones de profundidad real: este rasgo actúa como techo invisible en la relación.',
    mutPos: { description: 'Visto — evento de revelación con vínculo >70: uno de los momentos más poderosos del juego. El efecto sobre el rendimiento posterior es significativo.' },
    mutNeg: null,
  },
  {
    id: 'amor-por-el-patinaje-puro',
    name: 'Amor por el patinaje puro',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Positive,
    description: 'Debajo de la presión, hay alguien que patinaría aunque no existieran los jueces. Lo perdió por el camino. Puede recuperarlo. Con la ayuda correcta, sin darse cuenta, ya lo está haciendo.',
    mechanic: 'Cuando se activa: fuente permanente de motivación intrínseca. Los rasgos de abandono o burnout activos se vuelven casi irreversibles. El activo más valioso del juego.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'el-secreto-fisico',
    name: 'El secreto físico',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Physical,
    variant: TraitVariant.Negative,
    description: 'Una condición, lesión antigua o limitación que nadie conoce. El patinador la gestiona solo. A veces bien. A veces peor de lo que aparenta.',
    mechanic: 'Sin revelación: el sistema de detección de lesiones del club no puede actuar sobre esta variable. Con revelación: el Centro Médico puede diseñar un protocolo específico.',
    mutPos: null,
    mutNeg: { description: 'Quiebre físico — si la condición alcanza un umbral sin protocolo médico: puede generar una lesión grave que el sistema no predijo.' },
  },
  {
    id: 'deuda-emocional',
    name: 'Deuda emocional',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Negative,
    description: 'Siente que le debe algo a alguien por haber podido llegar hasta aquí. No lo dice porque nombrarlo lo haría demasiado real. Esa deuda da forma a por qué no puede permitirse fallar.',
    mechanic: 'Motivación artificialmente alta. Pero si hay una mala temporada extendida: el peso de la deuda puede convertirse en la causa de abandono más difícil de gestionar.',
    mutPos: { description: 'Deuda saldada — conversación de revelación con vínculo >70 + evento de cierre narrativo: libera la motivación de la deuda y la convierte en elección.' },
    mutNeg: null,
  },
  {
    id: 'miedo-a-convertirse',
    name: 'Miedo a convertirse',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Negative,
    description: 'Tiene miedo de convertirse en el tipo de persona que cree que tienes que ser para ganar. Ha visto a otros cambiar y no le gustó lo que vio. No lo dice porque no quiere que parezca excusa.',
    mechanic: 'En situaciones donde el éxito requiere decisiones que comprometen sus valores iniciales: varianza interna alta. Puede sabotear resultados de forma inconsciente.',
    mutPos: { description: 'Valores integrados — con vínculo >70 y conversación sobre su modelo de éxito: puede ganar sin sentir que traiciona algo.' },
    mutNeg: null,
  },
  {
    id: 'nucleo-inquebrantable',
    name: 'Núcleo inquebrantable',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Psychological,
    variant: TraitVariant.Positive,
    description: 'En el peor momento, en la peor competición, con todo en contra: hay algo que no se rompe. No lo sabías. Él tampoco. Solo se descubre cuando todo lo demás ya no está.',
    mechanic: 'Solo se activa bajo condiciones extremas (lesión grave, derrota devastadora, crisis personal). Cuando se activa: todos los rasgos destructivos activos se reducen temporalmente.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'el-programa-que-guarda',
    name: 'El programa que guarda',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Neutral,
    description: 'Hay un número que lleva años queriendo patinar y nunca ha podido. Demasiado personal. Demasiado expuesto. Lo guarda para cuando llegue el momento. Si llega.',
    mechanic: 'Si se revela y el entrenador lo incorpora en la Gala Olímpica o en la despedida: activa uno de los eventos narrativos más cargados del juego.',
    mutPos: null,
    mutNeg: null,
  },
  {
    id: 'la-pregunta-sin-respuesta',
    name: 'La pregunta sin respuesta',
    layer: TraitLayer.Bond65,
    category: TraitCategory.Identity,
    variant: TraitVariant.Neutral,
    description: 'Hay una pregunta sobre sí mismo o su vida que el patinaje no puede responder. Pero tampoco deja de hacerla. La busca en el hielo aunque sabe, en algún lugar, que no está ahí.',
    mechanic: 'Genera eventos narrativos únicos en momentos de alta intensidad emocional. La pregunta puede transformarse pero nunca desaparece del todo. Solo aprende a vivir con ella.',
    mutPos: null,
    mutNeg: null,
  },
]

/** fast lookup by id — O(1) alternative to scanning TRAITS */
export const TRAITS_BY_ID = Object.fromEntries(
  TRAITS.map(t => [t.id, t]),
) as Readonly<Record<TraitId, TraitDefinition>>

// ─── runtime validation ───────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function hasNumberFields(obj: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every(k => isFiniteNumber(obj[k]))
}

/** type guard for complete SkaterData — validates shape and numeric fields */
export function validateSkaterData(data: unknown): data is SkaterData {
  if (!isPlainObject(data)) return false
  if (typeof data['id'] !== 'string') return false
  if (typeof data['name'] !== 'string') return false
  if (!isFiniteNumber(data['age'])) return false
  if (typeof data['nationality'] !== 'string') return false

  if (!isPlainObject(data['technical'])) return false
  if (!hasNumberFields(data['technical'], ['saltos', 'giros', 'secuenciaDePasos', 'amplitudLinea'])) return false

  if (!isPlainObject(data['psychological'])) return false
  if (!hasNumberFields(data['psychological'], ['confianza', 'resistenciaMental', 'presionCompetitiva', 'motivacionIntrinseca', 'autoexigencia'])) return false

  if (!isPlainObject(data['physical'])) return false
  if (!hasNumberFields(data['physical'], ['techosBiologico', 'historialLesiones', 'velocidadRecuperacion'])) return false

  if (!Array.isArray(data['traits'])) return false

  const ws = data['weeklyState']
  if (!isPlainObject(ws)) return false
  if (!hasNumberFields(ws, ['vinculo', 'fatigaAcumulada', 'estres', 'semanasEntrenadas'])) return false
  if (!('currentInjury' in ws)) return false

  const retiredAt = data['retiredAt']
  if (retiredAt !== null && !isFiniteNumber(retiredAt)) return false

  return true
}

// ─── utility functions ────────────────────────────────────────────────────────

/**
 * returns only the psychological attributes whose bond threshold has been reached.
 * autoexigencia is never included here (threshold = -1; only via crisis or dialogue).
 */
export function getPsychologicalVisible(
  skater: SkaterData,
  vinculo: number,
): Partial<PsychologicalAttributes> {
  const result: Partial<PsychologicalAttributes> = {}
  const p = skater.psychological
  const t = PSYCHOLOGICAL_THRESHOLDS

  if (vinculo >= t.confianza)            result.confianza            = p.confianza
  if (vinculo >= t.resistenciaMental)    result.resistenciaMental    = p.resistenciaMental
  if (vinculo >= t.presionCompetitiva)   result.presionCompetitiva   = p.presionCompetitiva
  if (vinculo >= t.motivacionIntrinseca) result.motivacionIntrinseca = p.motivacionIntrinseca

  return result
}

/** true when the skater has an active injury with weeks still remaining */
export function isInjured(skater: SkaterData): boolean {
  const inj = skater.weeklyState.currentInjury
  return inj !== null && inj.recoveryWeeksRemaining > 0
}

/** weeks remaining in the current injury; 0 when healthy */
export function getRecoveryWeeks(skater: SkaterData): number {
  return skater.weeklyState.currentInjury?.recoveryWeeksRemaining ?? 0
}

/**
 * returns the skater's biological ceiling.
 * wrap this instead of reading skater.physical directly in UI code.
 */
export function getBiologicalCeiling(skater: SkaterData): number {
  return skater.physical.techosBiologico
}

// ─── default data ─────────────────────────────────────────────────────────────

/** baseline SkaterData for a 16-year-old junior skater at season start */
export const DEFAULT_SKATER_DATA: SkaterData = {
  id:          '',
  name:        '',
  age:         16,
  nationality: 'ES',
  technical: {
    saltos:           35,
    giros:            32,
    secuenciaDePasos: 28,
    amplitudLinea:    38,
  },
  psychological: {
    confianza:            52,
    resistenciaMental:    45,
    presionCompetitiva:   48,
    motivacionIntrinseca: 70,
    autoexigencia:        58,
  },
  physical: {
    techosBiologico:       72,
    historialLesiones:     8,
    velocidadRecuperacion: 82,
  },
  traits:     [],
  weeklyState: {
    vinculo:           0,
    fatigaAcumulada:   10,
    estres:            15,
    semanasEntrenadas: 0,
    currentInjury:     null,
  },
  retiredAt: null,
}
