# INFORME B2 — Auditoría del sistema de entrenamiento

| Campo | Valor |
|---|---|
| Fase | 1 (vertical slice endurecido) |
| Auditoría | B2 — Sistema de planificación de entrenamientos (6 actividades, 6 tensiones, calcGain, lesiones) |
| Fecha | 2026-05-03 |
| Rama auditada | `claude/clever-mayer-972235` |
| Alcance | `src/features/training/{service,types,store,service.test}.ts`, `src/lib/balance.ts`, `src/features/athlete/injury.ts`, `src/features/athlete/service.ts` (`computeInjuryRisk`), `src/services/weekService.ts` (rolls semanal y por caídas) |
| Modo | Read-only (no se modificó código) |
| Fuente normativa | GDD cap. 17 — "Sistema de Planificación de Entrenamientos" |

> **Nota metodológica.** El archivo `glace_GDD_v2.pdf` no está presente en el repositorio. La especificación del cap. 17 vive como (a) comentarios `// GDD cap. 17 — …` inline en `service.ts` y `balance.ts` y (b) las reglas explícitas suministradas en el prompt de auditoría. Esta auditoría compara la implementación contra esa fuente declarada. Cuando ambas fuentes (comentarios inline + reglas del prompt) coinciden literalmente, la conformidad se considera robusta; cuando difieren o el prompt aporta una regla no presente en código, se reporta como hallazgo.

---

## 1. Resumen ejecutivo

**Estado global:** ⚠️ Las 6 actividades y las 6 tensiones están implementadas y bien testeadas; la curva `calcGain` cumple sus tres invariantes; el sistema de lesiones existe en dos puntos (semanal y post-competición) con amplificación exponencial por historial. **Dos hallazgos MAYORES** y **cuatro MENORES** se concentran en la ausencia de la consecuencia mecánica obligatoria del descanso prolongado: la "amenaza" del bucle se *detecta* (tensión `tecnico_vs_descanso`) pero **no se cobra**.

| Nº | Sev. | Hallazgo |
|---|---|---|
| M1 | ⚠️ MAYOR | "5+ semanas sin descanso → evento lesión forzado" no implementado en `weekService` ni en `training/service` |
| M2 | ⚠️ MAYOR | "Obliga descanso 1/4 semanas" no existe como restricción dura; solo hay tensión informativa que no escala a consecuencia |
| m1 | 🟡 MENOR | `dialogo_vs_hielo` reduce "vínculo decayendo" a `lastWeek.vinculoDelta < 0`; criterio frágil (una sola semana lo activa o desactiva) |
| m2 | 🟡 MENOR | Umbral `estres >= 70` en `paradoja_descanso_emocional` es literal mágico en `service.ts:173`; debería estar en `balance.ts` |
| m3 | 🟡 MENOR | `detectTensions` solo siembra evento (`'hielo_de_noche'`) para 1 de 6 tensiones; las otras 5 calculan estado pero no producen consecuencia visible para el jugador |
| m4 | 🟡 MENOR | Actividad **Físico** declara `targetAttributes: []`: no mejora "resistencia/fuerza" porque el modelo `SkaterTechnical` no contempla todavía esos atributos (gap de modelo) |

**Acciones sugeridas (fuera del alcance):** (1) añadir trigger duro de descanso obligatorio en `weekService` o multiplicador de probabilidad de lesión cuando `tecnico_vs_descanso` está activa; (2) mover el umbral 70 de `service.ts:173` a `balance.ts`; (3) conectar las 5 tensiones restantes a `eventSeeds` o al sistema narrativo; (4) decidir si "resistencia/fuerza" entran en el modelo `SkaterTechnical` o si Físico solo modula fatiga/estrés (en cuyo caso, documentar y eliminar el gap).

---

## 2. Tabla GDD → código: las 6 actividades

Todos los efectos están definidos en `ACTIVITY_DEFINITIONS` ([src/features/training/service.ts:13-80](src/features/training/service.ts:13)). Como el prompt no fija rangos numéricos exactos del GDD, la columna "GDD" refleja la promesa cualitativa documentada en el cap. 17 (resumida en el CLAUDE.md del proyecto y en el prompt de auditoría); la columna "Código" es literal.

| Actividad | Atributos objetivo (GDD) | Atributos objetivo (código) | Fatiga | Estrés | Vínculo | Cohesión | Lesión | Energía | Estado |
|---|---|---|---|---|---|---|---|---|---|
| **Tecnico** | saltos↑, giros↑, pasos↑ | `['saltos','giros','secuenciaDePasos']` (l.17) | +8…+14 (l.18) | +3…+5 (l.19) | 0 | 0 | **+4** (l.21) | 60 | ✅ |
| **Fisico** | resistencia↑, fuerza↑ | `[]` (l.28) | +5…+8 | +1…+3 | 0 | 0 | +2 | 40 | ⚠️ m4 |
| **Mental** | estrés↓, confianza↑, vínculo↑ | `[]` (l.39) | 0…+2 | **−10…−5** (l.41) | +1…+3 (l.42) | 0 | 0 | 20 | ✅ |
| **Descanso** | fatiga↓↓, estrés↓, lesión↓ | `[]` (l.50) | **−30…−20** (l.51) | **−12…−8** (l.52) | 0 | 0 | **−2** (l.54) | 10 | ✅ |
| **Ensayo** | cohesión↑, PCS↑ | `['amplitudLinea']` (l.61) | +3…+6 | −2…+1 | 0 | +3…+6 (l.66) | +1 | 30 | ✅ |
| **Dialogo** | vínculo↑↑ | `[]` (l.72) | 0…+2 | −6…−3 | **+5…+10** (l.75) | +1…+2 (l.77) | 0 | 15 | ✅ |

**Observaciones:**

- La regla cualitativa del prompt **"+4% riesgo lesión"** para Técnico se materializa como `injuryRiskDelta: 4` en `service.ts:21`. Esta carga se suma con el resto en `weeklyInjuryLoad` ([src/features/athlete/injury.ts:28-35](src/features/athlete/injury.ts:28)) y se mapea a probabilidad mediante `base = amplified / INJURY_LOAD_DIVISOR=130` ([injury.ts:60](src/features/athlete/injury.ts:60)). El comentario inline del autor ([injury.ts:59](src/features/athlete/injury.ts:59)) calibra esto a "two técnicos (load 8) ≈ 6 % at baseline" — i.e., un técnico ≈ 3 %, dos ≈ 6 %, lo cual es **razonablemente consistente** con la promesa "+4 % por técnico". ✅ literal-match.

- **Mental** suma vínculo (+1…+3) y reduce estrés (-10…-5): cumple "imprescindible 3 sem antes de competición grande" como pieza de regulación emocional, aunque la *obligatoriedad* no está codificada.

- **Descanso**: regla GDD "obligatorio 1/4 semanas" → ver §5 (M2).

#### m4 — Actividad Físico sin atributos objetivo (🟡 MENOR)

`fisico.targetAttributes = []` ([service.ts:28](src/features/training/service.ts:28)) significa que Físico **solo modula fatiga/estrés/lesión y nada técnico**, a pesar de la promesa "resistencia+/fuerza+" del CLAUDE.md (`§ "Ranuras semanales"`). La causa raíz es que el modelo `SkaterTechnical` (en `src/types/skater.ts`) no contiene atributos de resistencia/fuerza: el Técnico mejora `saltos/giros/secuenciaDePasos` y el Ensayo mejora `amplitudLinea`; no hay receptáculo para "resistencia/fuerza" todavía. Por tanto Físico es una ranura **ergonómicamente útil** (ayuda a sostener cargas técnicas sin disparar fatiga tan rápido) pero **mecánicamente inerte** sobre atributos. Hallazgo MENOR porque no rompe ningún test ni promesa numérica explícita del prompt; pero erosiona la analogía "Football Manager" que el CLAUDE.md invoca al inicio (profundidad de simulación deportiva).

---

## 3. Tabla GDD → código: las 6 tensiones

Las seis viven en helpers privados (`is*`) y se publican vía `detectTensions` ([service.ts:178-192](src/features/training/service.ts:178)). Cada helper lleva un comentario `// GDD cap. 17 — N: …` que documenta su intención.

| # | Tensión | Regla GDD (prompt) | Implementación | Veredicto |
|---|---|---|---|---|
| 1 | `tecnico_vs_descanso` | >4 sem sin descanso | [service.ts:97-107](src/features/training/service.ts:97) `consecutive > 4` (cuenta semana actual + retrocede en historial; rompe al hallar `descanso`) | ✅ CONFORME |
| 2 | `ensayo_vs_pre_competicion` | <2 ensayo en 3 sem antes de competición | [service.ts:110-128](src/features/training/service.ts:110) `pastEnsayo + currentEnsayo < 2` con ventana `[nextComp.semana - 3, semanaActual]` y `nextComp` clasificada en `(semanaActual, semanaActual+3]` | ✅ CONFORME |
| 3 | `dialogo_vs_hielo` | ≥3 sem sin diálogo + vínculo decayendo | [service.ts:131-141](src/features/training/service.ts:131) `consecutive >= 3 && lastWeek.vinculoDelta < 0` | ⚠️ ver m1 |
| 4 | `carga_vs_pico` | load >75 en sem antes de competición | [service.ts:144-154](src/features/training/service.ts:144) `totalLoad > 75 && nextWeekHasComp` (suma `energyCost` de todas las ranuras de la semana actual) | ✅ CONFORME |
| 5 | `ensayo_vs_espontaneidad` | >4 ensayo consecutivos sin tecnico ni dialogo | [service.ts:157-169](src/features/training/service.ts:157) recorre `[…historial, …actual]` hacia atrás, `break` en `tecnico` o `dialogo`, `count > 4` | ✅ CONFORME |
| 6 | `paradoja_descanso_emocional` | descanso + estrés alto | [service.ts:172-174](src/features/training/service.ts:172) `descanso ∧ estres >= 70`; siembra `'hielo_de_noche'` ([service.ts:245-247](src/features/training/service.ts:245)) | ✅ CONFORME (con m2) |

**Tests** ([service.test.ts](src/features/training/service.test.ts)): las seis tensiones tienen suite propia, con casos positivos y negativos en los umbrales (`5 vs 4 semanas`, `<2 vs ≥2 ensayos`, `>75 vs ≤75`, `estres 70 vs 69`, etc.). Los tests pasan en CI.

#### m1 — `dialogo_vs_hielo` reduce "vínculo decayendo" a una sola semana (🟡 MENOR)

```typescript
if (consecutive < 3) return false
const lastWeek = historialSemanas[historialSemanas.length - 1]
return lastWeek !== undefined && lastWeek.vinculoDelta < 0
```

La condición "vínculo decayendo" se interpreta como **"el delta de vínculo de la semana inmediatamente anterior es negativo"**. Eso significa que una sola semana intermedia con `vinculoDelta = +1` (un evento positivo aislado) **desactiva la tensión** aunque el patinador lleve 6 semanas sin Diálogo y la tendencia general sea claramente descendente. Recíprocamente, una sola semana con `−1` activa la tensión sin que haya un patrón sostenido. La regla del GDD ("vínculo decayendo") sugiere una **tendencia**, no un instante.

**Sugerencia de fix (fuera de alcance):** medir la pendiente sobre las últimas 2-3 semanas, p. ej. `sum(vinculoDelta de las últimas 3 sem) < 0`. O cruzar con el decay base del vínculo (`BOND_DECAY_PER_WEEK_MIN/MAX` en `balance.ts:33-34`): si el patinador no tiene Diálogo, el decay automático ya garantiza que `vinculoDelta < 0` salvo evento narrativo positivo, por lo que la condición actual está casi siempre satisfecha y la tensión efectivamente equivale a "≥3 sem sin diálogo" sin matiz. Documentar o reforzar.

#### m2 — Umbral `70` literal en `paradoja_descanso_emocional` (🟡 MENOR)

[service.ts:173](src/features/training/service.ts:173) usa `skaterEstres >= 70` como "estrés alto", pero `70` no aparece como constante en `balance.ts`. El proyecto ya tiene `FATIGUE_BLOCK_THRESHOLD = 70` ([balance.ts:14](src/lib/balance.ts:14)) para la regla análoga sobre fatiga, y `BOND_LAYERS = [20, 40, 55, 65]` ([balance.ts:38](src/lib/balance.ts:38)) demuestra que los umbrales psicológicos viven centralizados. Sugerencia: añadir `STRESS_HIGH_THRESHOLD = 70` y consumirlo aquí.

#### m3 — 5/6 tensiones no producen consecuencia visible (🟡 MENOR)

`resolveWeekEffects` ([service.ts:237-247](src/features/training/service.ts:237)) sí computa el array `tensionsTriggered` y lo expone en `WeekEffects.tensionsTriggered`, pero **solo `paradoja_descanso_emocional` siembra un evento narrativo** (`'hielo_de_noche'`):

```typescript
const eventSeeds: string[] = []
if (tensionsTriggered.includes('paradoja_descanso_emocional')) {
  eventSeeds.push('hielo_de_noche')
}
```

Las otras cinco tensiones quedan como diagnóstico interno. Es esperable que la UI del Hub Semanal (Fase 2) las visualice como advertencias, pero a nivel mecánico no escalan a consecuencia. Esta es la raíz compartida con M1 y M2 (la "amenaza no se cobra"), elevada a hallazgo separado porque su remediación es de menor coste: basta añadir entradas al `eventSeeds` o un multiplicador a `weeklyInjuryProbability` si la tensión está activa.

---

## 4. Curva de progresión: `calcGain`

**Definición** ([service.ts:91-93](src/features/training/service.ts:91)):

```typescript
export function calcGain(value: number, potential: number, factors = 1): number {
  return Math.max(0, Math.round(computeGainCurve(value, potential, factors)))
}
```

**Núcleo** ([balance.ts:24-28](src/lib/balance.ts:24)):

```typescript
export function computeGainCurve(value: number, potential: number, factors = 1): number {
  const headroom = potential - value
  if (headroom <= 0) return 0
  return BASE_GAIN_PER_SESSION * (1 - Math.exp(-POTENTIAL_DAMPENING_K * headroom)) * factors
}
```

Con `BASE_GAIN_PER_SESSION = 2` y `POTENTIAL_DAMPENING_K = 0.015` ([balance.ts:7,11](src/lib/balance.ts:7)).

**Verificación de las tres invariantes solicitadas:**

| Invariante | Comportamiento | Estado |
|---|---|---|
| `calcGain(value=potencial)` devuelve 0 | `headroom = 0 → headroom <= 0 → return 0` ([balance.ts:25-26](src/lib/balance.ts:25)). Cubierto por test ([service.test.ts:41](src/features/training/service.test.ts:41)). | ✅ |
| `calcGain(value > potencial)` devuelve 0 | Mismo guard `headroom <= 0`; además `Math.max(0, …)` en `service.ts:92` redundancia defensiva. Cubierto por test ([service.test.ts:49](src/features/training/service.test.ts:49)). | ✅ |
| Pendiente decreciente con `value↑` | `(1 − e^(−k·headroom))` decrece monótonamente en `value` (porque `headroom = potential − value`). Análisis: `∂gain/∂value = −k · e^(−k·headroom) · BASE · factors < 0`. | ✅ |

**Modificadores aplicados en `resolveWeekEffects`:**

- `motivationFactor = MOTIVATION_SPEED_MULTIPLIER (=1.25)` si `motivacionIntrinseca >= 70`, si no `1` ([service.ts:210-212](src/features/training/service.ts:210)).
- Bono `pistaPrincipal` nivel ≥3: +1 a `saltos` por ranura `tecnico` ([service.ts:231-233](src/features/training/service.ts:231)).

**Nota numérica.** Con `k=0.015` y `headroom=50` (atributo a 50/100): `gain = 2 · (1 − e^(−0.75)) · factor ≈ 1.06 · factor` → redondea a **1** sin motivación, **1** con motivación (1.32 redondea a 1). Con `headroom=80`: `gain ≈ 1.40 · factor` → **1**/**2**. Con `headroom=10` (cerca del techo): `gain ≈ 0.28 · factor` → casi siempre **0**. La calibración ("30-40 semanas de progresión visible", [balance.ts:10](src/lib/balance.ts:10)) implica progresión lenta y discreta — coherente con la promesa de "carrera de 10-15 temporadas" del CLAUDE.md.

---

## 5. Reglas críticas de `resolveWeekEffects`

Verificación una a una de las reglas que el prompt cita literalmente del GDD pág. 30:

| Regla GDD | Implementación | Estado |
|---|---|---|
| "Sin efecto si Fatiga >70" para Técnico | `fatigueBlocked = skater.weeklyState.fatigaAcumulada > FATIGUE_BLOCK_THRESHOLD` ([service.ts:209](src/features/training/service.ts:209)); si `true`, el bucle de gains se salta ([service.ts:224-234](src/features/training/service.ts:224)). Test: [service.test.ts:267](src/features/training/service.test.ts:267) ("fatiga > 70 bloquea attributeGains"). | ✅ con observación: el bloqueo se aplica a **todas** las actividades con `targetAttributes` (Técnico **y Ensayo**), no solo Técnico. La regla del GDD habla específicamente de Técnico, pero la generalización es defendible (un patinador exhausto tampoco asimila ensayo). Anotado para discusión, no como hallazgo. |
| "Obliga descanso 1/4 semanas" para Físico | **No existe restricción dura.** No hay validación al programar ranuras ni bloqueo en `setSlot` ([store.ts](src/features/training/store.ts)) ni invalidación en `resolveWeekEffects`. Solo la tensión `tecnico_vs_descanso` se dispara a >4 semanas. | ⚠️ **M2** |
| "+4% riesgo lesión" por actividad técnica | `injuryRiskDelta: 4` en `tecnico` ([service.ts:21](src/features/training/service.ts:21)); contribuye a `weeklyInjuryLoad` y de ahí a `weeklyInjuryProbability ≈ load/130`. Calibración real ≈ 3 % por un técnico, ≈ 6 % por dos ([injury.ts:59](src/features/athlete/injury.ts:59)). | ✅ |
| "Sin descanso 5+ semanas: evento lesión forzado" | **No implementado.** Ver §6.4. | ⚠️ **M1** |

---

## 6. Sistema de lesiones

### 6.1 Roll semanal

Disparado desde [src/services/weekService.ts:463](src/services/weekService.ts:463) tras `resolveWeekEffects`:

```typescript
const newInjury = rollWeeklyInjury(skater, effectiveSchedule, {
  trigger: effects.injuryRoll,
  …
})
```

donde `effects.injuryRoll = rng()` es un draw determinista del mismo RNG inyectado al servicio ([service.ts:255](src/features/training/service.ts:255)).

`weeklyInjuryProbability` ([injury.ts:49-63](src/features/athlete/injury.ts:49)):

```
load          = Σ ACTIVITY_DEFINITIONS[a].injuryRiskDelta
amplified     = computeInjuryRisk(skater, load)         // exponencial si historial > 70
fatigueBoost  = max(0, fatiga − 60) / 100
probability   = (amplified / 130) · (1 + fatigueBoost) · traitMultiplier
```

Amplificación exponencial ([src/features/athlete/service.ts:134](src/features/athlete/service.ts:134) — `computeInjuryRisk`): si `historialLesiones > 70`, `risk = load · e^((historial−70)/30)`. Coherente con el comentario en CLAUDE.md (`§ "Atributos físicos permanentes"`): "> 70 = riesgo exponencial".

### 6.2 Roll por caídas (post-competición)

Disparado desde [src/services/weekService.ts:529](src/services/weekService.ts:529) cuando hay competición y caídas:

```typescript
const fallInjury = rollFallInjury(skater, competitionResult.caidas, rng(), {…})
```

Con `FALL_INJURY_BASE_PROB = 0.04` (`balance.ts`).

### 6.3 Severidad y aftermath

- **Distribución de severidad** ([injury.ts:68-95](src/features/athlete/injury.ts:68)): pesos base `INJURY_SEVERITY_WEIGHTS`; sesgo hacia `moderada/grave` si `historialLesiones > 60` o si el rasgo `cuerpo-fragil` está activo (`leve ×0.7`, `moderada ×1.2`, `grave ×1.6`).
- **Recuperación** ([injury.ts:98-108](src/features/athlete/injury.ts:98)): `SEVERITY_RECOVERY_WEEKS = { leve: 1-2, moderada: 3-6, grave: 8-14 }`, reducible hasta 40 % por nivel de fisioterapia (`FISIO_RECOVERY_BONUS_PER_LEVEL`).
- **Aftermath**: `historialLesiones += {leve:5, moderada:12, grave:22}`; pérdida de `techosBiologico` 1-3 puntos solo si `grave` (`TECHO_LOSS_RANGE_GRAVE`).

Todo el sistema está **bien implementado y conectado al ciclo semanal**. ✅

### 6.4 M1 — Lesión forzada por descanso prolongado (⚠️ MAYOR)

**Promesa GDD (prompt):** "Sin descanso 5+ semanas: evento lesión forzado".

**Búsqueda exhaustiva** en `weekService.ts` y `features/training/`:
- `grep` por "5+ sem", "forced", "forzad", "obligator" en estos módulos: cero coincidencias relacionadas con lesión por descanso.
- `tensionsTriggered.includes('tecnico_vs_descanso')` no se consulta en ningún sitio fuera del propio cómputo del array.
- `weeklyInjuryProbability` no recibe `tensions` ni `historialSemanas`: la probabilidad de lesión es función exclusiva de la carga de la **semana actual**, la fatiga y el historial. Nada de lo acumulado en el patrón semanal entra en la fórmula.

**Consecuencia.** El jugador puede programar 10 semanas seguidas de Técnico+Físico (saturando la advertencia `tecnico_vs_descanso` desde la semana 5) y la única penalización adicional respecto a un mes normal es el `fatigueBoost` (que se satura en `+0.4` cuando fatiga llega a 100). El "evento lesión forzado" prometido por el GDD — la baliza narrativa que justifica la regla "1 de cada 4 semanas debe ser descanso" — **no existe**.

**Sugerencia de diseño (fuera de alcance):** dos vías razonables:

1. **Multiplicador en `weeklyInjuryProbability`** — el camino menos invasivo: `if tensions.includes('tecnico_vs_descanso') probability *= 1.5` (o factor calibrable). Mantiene aleatoriedad pero cobra la presión.
2. **Trigger duro en `weekService`** — al detectar `consecutive > 5` (un escalón sobre la tensión actual), forzar `pickSeverity` a un mínimo de `moderada` o disparar evento narrativo. Replica literalmente la promesa del GDD pero introduce no-aleatoriedad en un sistema que hasta ahora era 100 % probabilístico.

La opción (1) es preferible porque preserva el determinismo `mulberry32`-friendly y reusa el roll que ya existe.

### 6.5 M2 — "Obliga descanso 1/4 semanas" no es restricción dura (⚠️ MAYOR)

Análoga a M1 pero enfocada al lado de la **planificación**, no de la lesión. La regla del GDD sugiere que la mecánica *debe impedir* o al menos penalizar mecánicamente programar más de 3 semanas consecutivas sin descanso. Hoy:

- `useTrainingStore.setSlot` ([store.ts](src/features/training/store.ts)) acepta cualquier `ActivityId` sin consultar el historial.
- No hay aviso en UI ni mecánico antes de la semana 5 (cuando `tecnico_vs_descanso` se enciende).
- La consecuencia única, una vez encendida, es la entrada en `tensionsTriggered` que **no** dispara nada más (m3).

**Sugerencia de diseño:** elegir entre (a) restricción de UI (deshabilitar "Confirmar plan semanal" si se cumplen ciertas condiciones, con override explícito) o (b) consecuencia mecánica (M1). Las dos no son excluyentes y resolverían M1+M2 en un mismo cambio.

---

## 7. Tests existentes

[src/features/training/service.test.ts](src/features/training/service.test.ts) — 297 líneas, 8 `describe`, ~25 `it`:

| Suite | Cobertura | Líneas |
|---|---|---|
| `calcGain` | techo (=potencial), headroom positivo, no negativo | 40-52 |
| `tecnico_vs_descanso` | dispara a 5+ consecutivas, no a 4, presencia descanso aborta | 56-79 |
| `ensayo_vs_pre_competicion` | <2 ensayos en ventana, sin competición, ≥2 ensayos | 82-112 |
| `dialogo_vs_hielo` | ≥3 sem sin diálogo + vinculoDelta<0; presencia diálogo aborta; vínculo positivo aborta | 115-147 |
| `carga_vs_pico` | load>75 + comp próxima, sin comp, ≤75 | 150-184 |
| `ensayo_vs_espontaneidad` | >4 ensayos, técnico/diálogo interrumpe, =4 ensayos no | 187-210 |
| `paradoja_descanso_emocional` | descanso + estres≥70, estres<70, sin descanso | 213-230 |
| `resolveWeekEffects` | empty schedule, bondDelta, bono pistaPrincipal, bloqueo por fatiga, siembra `'hielo_de_noche'`, acumulación 5×técnico=40 fatiga | 235-296 |

Tests determinísticos con `rng` mock. Cobertura **adecuada** del núcleo numérico; **no** existen tests para la consecuencia de tensiones (porque, según M1+M3, esa consecuencia no existe en producción).

---

## 8. Conclusión

El sistema de entrenamiento está **arquitectónicamente sólido y bien testeado** en su núcleo numérico:

- Las **6 actividades** mapean 1:1 sus efectos a constantes inmutables, con tests sobre los valores agregados.
- Las **6 tensiones** se detectan con reglas que coinciden literalmente con la especificación del prompt (✅ las seis), con tests sobre umbrales y casos negativos.
- `calcGain` cumple las tres invariantes: techo respetado, no negativo, pendiente decreciente; calibración consistente con la promesa de carrera larga.
- El **sistema de lesiones** está completamente implementado en dos puntos del ciclo (semanal y post-caída), con amplificación exponencial por historial y aftermath proporcional a severidad.

La debilidad estructural (M1+M2+m3) es **una sola y compartida**: la "amenaza" del GDD se *detecta* pero no se *cobra*. El sistema avisa al jugador (a partir de Fase 2, cuando exista UI) pero no le penaliza si decide ignorar el aviso. Esto erosiona la *amenaza* central del bucle semanal — la presión narrativa que justifica la analogía con *Football Manager* y *This War of Mine* del CLAUDE.md.

**Orden de remediación sugerido (fuera de esta auditoría):**

1. **M1** — añadir multiplicador a `weeklyInjuryProbability` cuando `tecnico_vs_descanso` está activa (cambio de ~5 líneas en `injury.ts` + propagar `tensions` al sitio del roll en `weekService.ts:463`). Resuelve M1 sin romper determinismo.
2. **M2** — decidir si la prevención es mecánica (resuelta vía M1) o de UI (deshabilitar confirmación con override). Documentar la decisión en CLAUDE.md y `service.ts`.
3. **m3** — extender el bloque `eventSeeds` en `service.ts:244-247` con seeds para las otras 5 tensiones; el sistema narrativo (Fase 6) los consumirá.
4. **m2** — extraer `STRESS_HIGH_THRESHOLD = 70` a `balance.ts`.
5. **m1** — refactor de `dialogo_vs_hielo` para medir tendencia sobre 2-3 semanas en lugar de la última.
6. **m4** — decidir si "resistencia/fuerza" entran en `SkaterTechnical` o si Físico se redocumenta como ranura ergonómica pura.

Ningún hallazgo es CRÍTICO: el sistema construye y pasa los tests. Pero M1 y M2 son **bloqueantes para la promesa narrativa del GDD** y deberían cerrarse antes de abrir Fase 2 (UI del Hub Semanal), porque afectan a las visualizaciones que esa fase producirá.
