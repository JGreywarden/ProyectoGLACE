# INFORME B3 — Auditoría del sistema narrativo y vínculo

| Campo | Valor |
|---|---|
| Fase | 1 (vertical slice endurecido) |
| Auditoría | B3 — Eventos narrativos, capas de revelación, vínculo, mutaciones y memoria de decisiones |
| Fecha | 2026-05-03 |
| Rama auditada | `claude/lucid-jepsen-cb3513` |
| Alcance | `src/features/narrative/{types,service,store,validation,service.test}.ts`, `src/features/athlete/service.ts` (`applyBondDecay`, `computeTraitVisibilityLayer`), `src/lib/balance.ts` (`BOND_DECAY_*`, `BOND_LAYERS`), `src/types/skater.ts` (enum `TraitLayer`), `src/services/dataService.ts` (cache de eventos), `src/services/saveService.ts` (`decisionHistory`), `src/services/weekService.ts` (integración), `public/data/events/*.json` (7 archivos) |
| Modo | Read-only (no se modificó código) |
| Fuente normativa | GDD cap. 4 — "Eventos Narrativos y Vínculo" |

> **Nota metodológica.** El archivo `glace_GDD_v2.pdf` no está presente en el repositorio. La especificación del cap. 4 se reconstruye a partir de (a) las reglas explícitas del prompt de auditoría, (b) los comentarios `// GDD …` inline de `service.ts` y `balance.ts` y (c) el vocabulario de dominio listado en `CLAUDE.md` (`§ Atributos del patinador`, `§ Sistemas pendientes…`). Cuando la fuente declarada y el código coinciden literalmente, la conformidad se considera robusta.

---

## 1. Resumen ejecutivo

**Estado global:** ✅ El motor narrativo está bien arquitecturado y testeado: `service.ts` (674 líneas) implementa los 16 campos de `NarrativeCondition`, los efectos están clampados, el RNG es inyectable y la persistencia de decisiones está validada en `SaveFile`. **Dos hallazgos MAYORES** se concentran en el **modelado de las capas de revelación**: el umbral 55 está declarado pero mecánicamente inerte y el vocabulario nominal del GDD pág. 10 (señal/patrón/verbal/profundidad) no tiene contraparte estructural. **Cuatro MENORES** son deuda de pulido (tests faltantes, taxonomía duplicada, constantes fuera de `balance.ts`, ausencia de diversificación de tipos). La inconsistencia `logro_compartido`/`logro` heredada de la memoria del proyecto **queda refutada** con grep exhaustivo.

| Nº | Sev. | Hallazgo |
|---|---|---|
| M1 | ⚠️ MAYOR | `BOND_LAYERS[2] = 55` declarado y documentado, pero `computeTraitVisibilityLayer` no lo consulta — capa intermedia mecánicamente huérfana |
| M2 | ⚠️ MAYOR | Las cuatro capas nombradas del GDD (señal/patrón/verbal/profundidad) no existen como concepto en código; la revelación se simula con umbrales numéricos planos |
| m1 | 🟡 MENOR | `maxVinculo`, `minEstres`, `maxEstres` y `semanasDesdeUltimaCompeticion` no tienen test directo en `evaluateConditions` (cobertura sólo por simetría) |
| m2 | 🟡 MENOR | `EventType` (6 variantes) en `dataService.ts:16` duplica la taxonomía de `NarrativeEventType` (7 variantes) sin TODO de retirada — riesgo de drift |
| m3 | 🟡 MENOR | `WEEKLY_WEIGHTS` y `COOLDOWN_WEEKS` están hardcoded en `service.ts:46-59` en lugar de `balance.ts`, rompiendo el patrón de centralización |
| m4 | 🟡 MENOR | `selectWeeklyEvent` no diversifica: solo `crisis` (3 sem) y `revelacion` (4 sem) tienen cooldown; las otras 4 categorías pueden caer en semanas consecutivas |
| i1 | 🔵 INFO | Inconsistencia heredada `logro_compartido`/`logro` — **refutada** tras grep exhaustivo (11 TS + 5 JSON + 0 fugas) |
| i2 | 🔵 INFO | `NarrativeEventType` incluye `momento_competicion` como séptimo tipo, excluido activamente de la selección semanal — ampliación justificada, no violación |

**Acciones sugeridas (fuera del alcance):** ver §10 (Notas de remediación). Ningún hallazgo es CRÍTICO ni bloquea fase 2; M1 y M2 deben resolverse antes de fase 6 (generación de eventos con Claude API), porque la generación necesitará saber a qué capa asignar cada evento nuevo.

---

## 2. Taxonomía de eventos (tarea 1)

**GDD cap. 4 lista 6 tipos:** revelación, crisis, decisión moral, terceros, cotidiano, logro compartido.

**Código (`src/features/narrative/types.ts:8-16`):**

```typescript
export type NarrativeEventType =
  | 'revelacion'
  | 'crisis'
  | 'decision_moral'
  | 'terceros'
  | 'cotidiano'
  | 'logro_compartido'
  | 'momento_competicion'
```

| Tipo GDD | Identificador código | JSON | Conteo eventos | Estado |
|---|---|---|---|---|
| revelación | `revelacion` | `revelacion.json` | 6 | ✅ |
| crisis | `crisis` | `crisis.json` | 6 | ✅ |
| decisión moral | `decision_moral` | `decision_moral.json` | 6 | ✅ |
| terceros | `terceros` | `terceros.json` | 6 | ✅ |
| cotidiano | `cotidiano` | `cotidiano.json` | 6 | ✅ |
| logro compartido | `logro_compartido` | `logro_compartido.json` | 5 | ✅ |
| — (extensión) | `momento_competicion` | `momento_competicion.json` | 10 | ➕ ver i2 |

**Total:** 39 eventos definidos (29 semanales + 10 momentos), 2443 líneas de JSON.

### 2.1 i1 — Inconsistencia `logro_compartido`/`logro` REFUTADA (🔵 INFORMATIVO)

La memoria del proyecto sugería una "inconsistencia heredada" entre `logro_compartido` y `logro`. Grep exhaustivo confirma que **no existe tal inconsistencia**:

| Patrón buscado | Ocurrencias | Ubicaciones |
|---|---|---|
| `'logro_compartido'` (string literal) en TS/TSX | 11 | [types.ts:15](src/features/narrative/types.ts:15), [validation.ts:16](src/features/narrative/validation.ts:16), [service.ts:40, 67](src/features/narrative/service.ts:40), [dataService.ts:16, 19, 28](src/services/dataService.ts:16), [CoachDiary.tsx:26](src/pages/CoachDiary.tsx:26) |
| `"tipo": "logro_compartido"` en JSON | 5 | [logro_compartido.json:4, 48, 91, 155, 210](public/data/events/logro_compartido.json) |
| `"tipo": "logro"` (suelta, sin `_compartido`) en JSON | **0** | — |
| `'logro'` aislado en código | 1 (no relacionado) | trait id `'vacio-despues-del-logro'` en [skater.ts:83, 800-808](src/types/skater.ts:83) |

**Verdict:** la canonicalización es coherente. Toda referencia al tipo usa `logro_compartido`. La nota de memoria parece referirse a una iteración previa o a otra fase ya remediada. Recomendación: actualizar la memoria para evitar futuros falsos positivos.

### 2.2 i2 — `momento_competicion` como séptimo tipo (🔵 INFORMATIVO)

`momento_competicion` no aparece en el GDD cap. 4 (que enumera 6 tipos para el bucle semanal) sino en el cap. 11/competición. El código lo modela como **subtipo del mismo enum** porque comparte el contrato `NarrativeOptionEffect`/`NarrativeCondition`. La separación se hace en runtime:

- `selectWeeklyEvent` ([service.ts:439](src/features/narrative/service.ts:439)) excluye explícitamente: `e.tipo !== 'momento_competicion'`.
- `selectCompetitionMoment` ([service.ts:457-471](src/features/narrative/service.ts:457)) filtra positivamente por `tipo === 'momento_competicion'` y por `trigger ∈ {early, mid, late}`.
- `validateNarrativeEvent` exige `trigger` solo cuando `tipo === 'momento_competicion'` ([service.ts:189](src/features/narrative/service.ts:189)).

No es violación; es ampliación justificada. Se documenta para que futuros auditores no lo cuenten como "tipo semanal extra".

---

## 3. Capas de revelación (tarea 2)

**GDD pág. 10:** describe cuatro capas de revelación: **señal**, **patrón**, **verbal**, **profundidad**.

**Búsqueda en código:** `grep` por los cuatro términos en todo `src/`, `public/data/`, `CLAUDE.md`: **cero apariciones**. La documentación inline tampoco usa esta nomenclatura.

**Modelo implementado** ([src/types/skater.ts:6-11](src/types/skater.ts:6)):

```typescript
export enum TraitLayer {
  Visible = 0, // siempre visible desde el primer entrenamiento
  Bond20  = 1, // requiere vínculo >= 20
  Bond40  = 2, // requiere vínculo >= 40
  Bond65  = 3, // requiere vínculo >= 65
}
```

**Filtro de visibilidad** ([src/features/athlete/service.ts:71-76](src/features/athlete/service.ts:71)):

```typescript
export function computeTraitVisibilityLayer(bond: number): 0 | 1 | 2 | 3 {
  if (bond >= BOND_LAYERS[3]) return 3 // >= 65
  if (bond >= BOND_LAYERS[1]) return 2 // >= 40
  if (bond >= BOND_LAYERS[0]) return 1 // >= 20
  return 0
}
```

**Comentario inline** (athlete/service.ts:69): `"layer 1 ≥ 20, layer 2 ≥ 40, layer 3 ≥ 65 (BOND_LAYERS indices 0, 1, 3)"` — el autor es consciente de que el índice 2 no se consulta.

### 3.1 M1 — Capa de vínculo 55 huérfana (⚠️ MAYOR)

**Definición** ([src/lib/balance.ts:48](src/lib/balance.ts:48)):

```typescript
export const BOND_LAYERS: readonly [20, 40, 55, 65] = [20, 40, 55, 65]
// umbrales: [20] confianza, [40] resistenciaMental, [55] presionCompetitiva, [65] motivacionIntrinseca
```

**Promesa GDD** (`CLAUDE.md § Atributos del patinador`):

```
confianza:              visible con vínculo >= 20
resistenciaMental:      visible con vínculo >= 40
presionCompetitiva:     visible con vínculo >= 55 (puede ser + o -)
motivacionIntrinseca:   visible con vínculo >= 65
```

**Realidad mecánica:** `computeTraitVisibilityLayer(54) === 2` y `computeTraitVisibilityLayer(55) === 2`. El salto en 55 **no produce ningún cambio observable**. Cualquier patinador con `vinculo ∈ [40, 64]` recibe layer 2 y, por tanto, se le revelan los rasgos marcados con `TraitLayer.Bond40` — **incluyendo o excluyendo `presionCompetitiva` indistintamente**, según cómo se haya etiquetado cada trait.

Inspección de [skater.ts:150,195](src/types/skater.ts:150): el trait `presion-competitiva` está hoy etiquetado con un layer numérico. Si está como `Bond40`, se revela a partir de bond=40 (rompiendo la promesa GDD de "55"). Si está como `Bond65`, no se revela hasta bond=65 (también rompiendo la promesa). **No existe un layer intermedio que mapear**.

**Reproducción:**

```typescript
computeTraitVisibilityLayer(40)  // → 2
computeTraitVisibilityLayer(54)  // → 2
computeTraitVisibilityLayer(55)  // → 2  ❌ debería ser otro valor
computeTraitVisibilityLayer(64)  // → 2
computeTraitVisibilityLayer(65)  // → 3
```

**Sugerencia de diseño (fuera de alcance):** dos vías:

1. **Añadir capa intermedia.** Extender `TraitLayer` a 5 valores (0/1/2/3/4) y `computeTraitVisibilityLayer` a usar `BOND_LAYERS[2]`. Re-etiquetar el trait `presion-competitiva` al nuevo layer. Migración: revisar los ~60 traits y reetiquetar los que apliquen.
2. **Eliminar el umbral 55.** Si no se quiere la quinta capa, retirar `55` de `BOND_LAYERS` y actualizar el `CLAUDE.md` para reflejar que `presionCompetitiva` se revela a 40 ó 65. Borrar el comentario engañoso de `balance.ts:48`.

La opción (1) es preferible porque preserva la promesa narrativa del GDD ("el coach descubre la presión competitiva del patinador en un punto distinto al resto"); la opción (2) la sacrifica.

### 3.2 M2 — Las cuatro capas nominales del GDD no están modeladas (⚠️ MAYOR)

El GDD cap. 4 distingue **cualitativamente** cuatro modos en que un rasgo se revela: **señal** (algo visible en la postura/comportamiento), **patrón** (regularidad observada en varias semanas), **verbal** (declaración explícita por diálogo), **profundidad** (autoanálisis revelado bajo crisis o vínculo alto). Estos cuatro modos son **dimensiones distintas**, no umbrales numéricos.

El código colapsa los cuatro modos a una **única dimensión numérica** (`TraitLayer 0-3`). Las consecuencias prácticas:

- No se puede distinguir un rasgo que **sólo** se revela vía diálogo (ej. `Lealtad`) de uno que se revela vía competición (ej. `FragilBajoPresion`). El sistema solo discrimina por umbral de vínculo.
- Las "ranuras Diálogo" no marcan rasgos como verbales; solo suben el vínculo, que indirectamente desbloquea capa.
- La mecánica "única vía de revelación" prometida por el `CLAUDE.md` (`§ Ranuras semanales: Dialogo: única vía de revelación`) **no es estructural**: cualquier evento puede revelar cualquier rasgo, siempre que el vínculo esté por encima del umbral.

**Sugerencia de diseño (fuera de alcance):** decisión de producto, no técnica. Tres opciones:

1. **Añadir campo `capa: 'señal' | 'patron' | 'verbal' | 'profundidad'` a `TraitDefinition`** y filtrar en cada vector de revelación (eventos cotidianos solo revelan `señal`/`patron`, eventos de diálogo revelan `verbal`, crisis revelan `profundidad`). Cambio significativo: requiere taxonomizar los ~60 traits.
2. **Documentar la simplificación oficialmente** y modificar el `CLAUDE.md` y la comunicación al jugador para reflejar que la revelación es purely por umbral. Honesto pero pierde la promesa narrativa del GDD.
3. **Híbrido:** mantener el modelo numérico pero añadir un canal "única vía" minoritario (un campo opcional `revelaSoloVia: 'dialogo' | 'crisis'` en el trait). Más liviano que (1).

Sin estructura, fase 6 (generación con Claude API) tendrá que improvisar la asignación de capa en cada evento generado — alto riesgo de inconsistencia.

---

## 4. Umbrales de vínculo (tarea 3)

**Fuente única declarada** ([balance.ts:48](src/lib/balance.ts:48)): `BOND_LAYERS = [20, 40, 55, 65]`. ✅ centralizada.

**Búsqueda de duplicados / hardcode** en código:

| Umbral | Ubicaciones que lo referencian | Verdict |
|---|---|---|
| 20 | `BOND_LAYERS[0]` consultado en `athlete/service.ts:74`. Comentario en `skater.ts:19` ("`confianza: visible con vínculo >= 20`"). | ✅ una sola definición numérica; comentario coherente. |
| 40 | `BOND_LAYERS[1]` consultado en `athlete/service.ts:73`. Comentario equivalente. | ✅ |
| 55 | `BOND_LAYERS[2]` declarado pero **nunca consultado** (M1). Comentario en `balance.ts:48` y `skater.ts`. | ⚠️ ver M1 |
| 65 | `BOND_LAYERS[3]` consultado en `athlete/service.ts:72`. | ✅ |
| 70+ | "conversaciones que definen". No existe en código como umbral. Se simula vía `minVinculo` per-evento en JSON (ej. `decision_moral.json` usa 25, 30, 40; ningún evento weekly usa 70). | ✅ ausencia justificada (es categoría narrativa, no umbral mecánico). |

**Hardcoding en JSON de eventos:** los `minVinculo` de los eventos van de 0 a 55 (ningún evento exige > 55), repartidos en valores naturales (10, 15, 20, 25, 30, 35, 40, 45, 50, 55). No usan los umbrales `BOND_LAYERS` directamente, lo cual está bien: cada evento puede tener su propio gating sin acoplarse al sistema de capas. ✅

### 4.1 m3 — `WEEKLY_WEIGHTS` y `COOLDOWN_WEEKS` hardcoded en `service.ts` (🟡 MENOR)

```typescript
// src/features/narrative/service.ts:46-59
const COOLDOWN_WEEKS: Partial<Record<NarrativeEventType, number>> = {
  crisis:     3,
  revelacion: 4,
}

const WEEKLY_WEIGHTS = {
  cotidiano: 4, revelacion: 2, crisis: 1,
  decision_moral: 2, terceros: 2, logro_compartido: 1,
}
```

Estas constantes **son balance**: definen la frecuencia relativa de tipos de evento y el ritmo narrativo. Su lugar natural es `src/lib/balance.ts`, junto a `BOND_DECAY_PER_WEEK_*` y `BOND_LAYERS`. El patrón de centralización de balance está establecido en el resto del proyecto (B2 también lo confirmó). Hallazgo MENOR: cambiar el peso de `crisis` o el cooldown obliga a abrir el `service.ts` (lógica) en lugar del archivo de balance (datos).

---

## 5. Decay del vínculo (tarea 4)

**Constantes** ([balance.ts:37-38](src/lib/balance.ts:37)):

```typescript
export const BOND_DECAY_PER_WEEK_MIN = 2
export const BOND_DECAY_PER_WEEK_MAX = 3
```

**Aplicación** ([athlete/service.ts:32-47](src/features/athlete/service.ts:32)):

```typescript
export function applyBondDecay(
  skater: SkaterData,
  didDialogueThisWeek: boolean,
  rng: () => number = Math.random,
): SkaterData {
  if (didDialogueThisWeek) return skater                                    // bypass por diálogo
  const range = BOND_DECAY_PER_WEEK_MAX - BOND_DECAY_PER_WEEK_MIN
  const decay = BOND_DECAY_PER_WEEK_MIN + rng() * range                     // [2, 3) random
  return {
    ...skater,
    weeklyState: { ...skater.weeklyState, vinculo: clamp(weeklyState.vinculo - decay) },
  }
}
```

**Integración** ([weekService.ts:451](src/services/weekService.ts:451)): se invoca después de `applyTrainingEffects`, dentro del transition semanal. ✅

**Test** ([athlete/service.test.ts:43-80](src/features/athlete/service.test.ts:43)): cubre `rng=0 → decay=2`, `rng=1 → decay=3`, bypass por diálogo, clamp a [0,100].

**Verdict:** ✅ regla GDD ("baja 2-3 puntos por semana de forma silenciosa si no se alimenta con ranuras de diálogo") implementada literalmente. Sin hallazgo.

---

## 6. Selección de evento semanal (tarea 5)

**`selectWeeklyEvent`** ([service.ts:430-449](src/features/narrative/service.ts:430)):

```typescript
export function selectWeeklyEvent(
  pool: readonly NarrativeEvent[],
  context: NarrativeContext,
  rng: () => number = Math.random,                    // ✅ inyectable
  state?: WeeklySelectionState,
): NarrativeEvent | null {
  const emitted = new Set(context.emittedEvents)
  const candidates = pool.filter(e =>
    e.tipo !== 'momento_competicion' &&               // excluye Moments
    !emitted.has(e.id) &&                             // no repite eventos ya emitidos
    passesCooldown(e.tipo, state) &&                  // respeta cooldown por tipo
    evaluateConditions(e, context),                   // gating completo
  )
  if (candidates.length === 0) return null
  return weightedPick(candidates, e => WEEKLY_WEIGHTS[e.tipo], rng)
}
```

**Determinismo:** `rng: () => number = Math.random` permite inyectar un mock en tests. Confirmado en [service.test.ts:185-226](src/features/narrative/service.test.ts:185) (todos los tests pasan `() => 0` o `() => 0.5`).

**Tie-breaking** ([weightedPick: service.ts:409-424](src/features/narrative/service.ts:409)): suma pesos, elige el primer item donde el acumulador rebasa `rng() * total`; en empate por precisión flotante, devuelve el último item del array. Determinista en igualdad de inputs. ✅

**Cooldown**:

```typescript
function passesCooldown(tipo, state): boolean {
  if (!state) return true
  const cooldown = COOLDOWN_WEEKS[tipo]                  // crisis:3, revelacion:4
  if (!cooldown) return true                             // tipos sin cooldown pasan siempre
  const last = state.lastEmittedBySubtype[tipo]
  if (last === undefined) return true
  return state.currentWeek - last >= cooldown
}
```

Tipos con cooldown: solo `crisis` (3 semanas) y `revelacion` (4 semanas). **Cuatro tipos quedan sin cooldown**: `cotidiano`, `decision_moral`, `terceros`, `logro_compartido`.

### 6.1 m4 — Diversificación insuficiente entre tipos (🟡 MENOR)

La pregunta del usuario: *"¿respeta la mezcla de tipos (no solo crisis tras crisis tras crisis)?"*. Respuesta: **parcialmente**. Las dos categorías más intensas (`crisis`, `revelacion`) están blindadas con cooldown; pero las otras cuatro pueden caer en semanas consecutivas, gobernadas solo por los pesos relativos.

Distribución teórica con `WEEKLY_WEIGHTS` (suma = 12 antes de cooldowns/conditions):
- cotidiano: 33% (peso 4)
- revelacion, decision_moral, terceros: 17% cada uno (peso 2)
- crisis, logro_compartido: 8% cada uno (peso 1)

Si todos los eventos pasan condiciones (caso ideal), un jugador puede recibir, por ejemplo, `terceros → terceros → terceros` en tres semanas seguidas (probabilidad ≈ 17%³ ≈ 0.5 %, pero no nula). El sistema **no** tiene un mecanismo "evita repetir tipo de la semana pasada" — solo el cooldown nominal y la exclusión por `id` ya emitido (que es por evento individual, no por categoría).

**Sugerencia de diseño (fuera de alcance):** introducir un *soft cooldown* universal que multiplique el peso del tipo emitido la semana anterior por 0.3-0.5; o añadir `cotidiano` con cooldown 1 (forzar no-repetición consecutiva del fallback). Cualquiera de los dos preserva el determinismo del RNG inyectable.

---

## 7. Mutaciones bidireccionales (tarea 6)

**Configuración** en `NarrativeOptionEffect` ([types.ts:80-81](src/features/narrative/types.ts:80)):

```typescript
rasgoRiesgo?: TraitId            // qué rasgo intentar mutar
probabilidadMutacion?: number    // [0, 1]
```

**Aplicación** ([service.ts:568-573](src/features/narrative/service.ts:568)):

```typescript
if (e.rasgoRiesgo && isTraitId(e.rasgoRiesgo) && e.probabilidadMutacion !== undefined && e.probabilidadMutacion > 0) {
  const roll = rollMutation(skater, e.rasgoRiesgo, e.probabilidadMutacion, rng)
  if (roll.mutated) {
    mutatedTrait = { from: e.rasgoRiesgo, to: roll.newTraitId }
  }
}
```

**Validación de rango** ([service.ts:165](src/features/narrative/service.ts:165)): `probabilidadMutacion` debe estar en [0, 1] o el evento se rechaza en `validateNarrativeEvent`.

**Tests:**
- Unitario ([service.test.ts:283-312](src/features/narrative/service.test.ts:283)): `rasgoRiesgo + prob=1 + rng=0.5` → muta; `prob=0` → no muta.
- Validación rechaza out-of-range ([service.test.ts:98](src/features/narrative/service.test.ts:98)).
- Integración con bucle semanal ([weekService.test.ts:455-493](src/services/weekService.test.ts:455)).

**Verdict:** ✅ implementado y testeado. La parte **bidireccional** (mutaciones positivas vs negativas) depende del catálogo de traits en `skater.ts:800-808`, no del motor narrativo: el motor solo dispara la mutación según el `rasgoRiesgo` del evento, y la dirección la decide el target. Sin hallazgo en el motor.

---

## 8. `evaluateConditions` — Tabla de campos (tarea 7)

**Implementación completa** en [service.ts:329-385](src/features/narrative/service.ts:329).

| # | Campo de `NarrativeCondition` | Implementado | Línea | Test directo | Test name / línea |
|---|---|---|---|---|---|
| 1 | `minVinculo` | ✅ sí | 336 | ✅ sí | `'excludes when minVinculo=40 and skater vinculo=30'` (135) + `'passes when minVinculo is met'` (141) |
| 2 | `maxVinculo` | ✅ sí | 337 | ❌ no | — (cobertura solo por simetría) |
| 3 | `minEstres` | ✅ sí | 338 | ❌ no | — |
| 4 | `maxEstres` | ✅ sí | 339 | ❌ no | — |
| 5 | `faseTemporada` | ✅ sí | 341-344 | ✅ sí | `'filters by faseTemporada via semanaActual'` (165) |
| 6 | `temporadaMinima` | ✅ sí | 346 | ✅ sí | `'filters by temporadaMinima'` (175) |
| 7 | `flagsRequeridos` | ✅ sí | 348-352 | ✅ sí | `'excludes when flagsRequeridos is missing'` (159) |
| 8 | `flagsBloqueantes` | ✅ sí | 353-357 | ✅ sí | `'excludes when flagsBloqueantes is present'` (147) + `'passes when flagsBloqueantes is absent'` (153) |
| 9 | `contextoTemporal` | ✅ sí | 361 | ✅ sí | `pre_competicion` (516, 525) + `post_competicion` (552) + `sin_competicion_proxima` (560, 569) |
| 10 | `semanasHastaProximaCompeticion` | ✅ sí | 362-365 | ✅ sí | bug repro `'post-competition WEEK does NOT trigger pre_competicion event'` (533) |
| 11 | `semanasDesdeUltimaCompeticion` | ✅ sí | 366-369 | ❌ no | — (helper testeado en 505-512, pero nunca se ejercita el campo dentro de `evaluateConditions`) |
| 12 | `requiereLesion` | ✅ sí | 371 | ✅ sí | `'requiereLesion blocks healthy skaters'` (579) + `'requiereLesion passes when an injury is active'` (585) |
| 13 | `bloqueaSiLesion` | ✅ sí | 372 | ✅ sí | `'bloqueaSiLesion excludes injured skaters'` (597) |
| 14 | `severidadLesion` | ✅ sí | 373-376 | ✅ sí | `'severidadLesion narrows by severity'` (609) |
| 15 | `decisionRequerida` | ✅ sí | 378 | ✅ sí | `'decisionRequerida passes when matching'` (639) + `'decisionRequerida fails when option different'` (652) |
| 16 | `decisionBloqueante` | ✅ sí | 379 | ✅ sí | `'decisionBloqueante excludes events when player made that choice'` (665) |

**Cobertura: 16/16 implementados, 12/16 con test directo.** Los 4 sin test directo (`maxVinculo`, `minEstres`, `maxEstres`, `semanasDesdeUltimaCompeticion`) tienen cobertura **implícita por simetría** con sus contrapartes (min/max y hasta/desde son ramas paralelas del mismo `if`), pero un cambio rompedor en uno solo no se detectaría.

### 8.1 m1 — Cuatro campos sin test directo en `evaluateConditions` (🟡 MENOR)

Falta:
- `maxVinculo`: añadir `it('excludes when vinculo > maxVinculo')` con `vinculo=80` y `maxVinculo=70`.
- `minEstres`/`maxEstres`: dos tests análogos a `minVinculo`.
- `semanasDesdeUltimaCompeticion`: ejercitar dentro de `evaluateConditions` con un evento que incluya `semanasDesdeUltimaCompeticion: { min: 2 }` y un `decisionHistory` plausible.

Patrón establecido en B2 (D5, `CLAUDE.md`): "tests cubren caso feliz, límites del dominio, inputs corruptos". Hoy, B3 cumple el caso feliz y los límites para 12/16 campos; los 4 restantes están en la zona gris.

---

## 9. Aplicación de efectos (tarea 8)

**`applyEventEffect`** ([service.ts:491-578](src/features/narrative/service.ts:491)):

Helper de clamp ([service.ts:475](src/features/narrative/service.ts:475)):
```typescript
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
```

| Campo | Clamp | Línea |
|---|---|---|
| `vinculo + vinculoDelta` | [0, 100] | 510 |
| `estres + estresDelta` | [0, 100] | 514 |
| `fatigaAcumulada + fatigueDelta` | [0, 100] | 518 |
| `vinculo + bondDelta` (extra path) | [0, 100] | 523 |
| `atributosDelta.{saltos\|giros\|secuenciaDePasos\|amplitudLinea}` | [0, `techosBiologico`] | 533-540 |
| `atributosDelta.presionCompetitiva` | [-100, +100] (permite negativo) | 555-557 |
| Otros atributos psicológicos | [0, 100] | 547-552 |

**Tests** ([service.test.ts:269-282](src/features/narrative/service.test.ts:269)): `'clamps vinculoDelta at 100'` (input vinculo=95, delta=+50 → resultado 100) y `'clamps vinculoDelta at 0'` (input 5, delta=-50 → resultado 0). ✅

**`applyMomentEffect`** ([service.ts:644-673](src/features/narrative/service.ts:644)): no clampa (delega al motor de competición). Solo extrae fields mecánicas con defaults seguros (`?? 0`, `?? 1.0`, `?? false`).

**Verdict:** ✅ saturación correcta; nunca desborda. Sin hallazgo.

---

## 10. Memoria narrativa — `DecisionRecord` (tarea 9)

**Tipo** ([types.ts:135-151](src/features/narrative/types.ts:135)):

```typescript
export interface DecisionRecord {
  id: string                    // formato `${season}w${week}-${eventId}` → permite cadenas
  season: number; week: number
  eventId: string; eventTitulo: string; eventTipo: NarrativeEventType
  optionId: string; optionTexto: string
  consecuenciasResumidas: string
  flagsAlterados: string[]
  skaterId: string
}
```

**Construcción** ([service.ts:587-610](src/features/narrative/service.ts:587)): `buildDecisionRecord(event, optionId, ctx)` produce el record con id estable, resumen de cambios numéricos y array de flags alteradas. Test: [service.test.ts:681-700](src/features/narrative/service.test.ts:681).

**Persistencia:**
- Almacenado en `SaveFile.decisionHistory` ([saveService.ts:72](src/services/saveService.ts:72)).
- Validado por `validateDecisionRecord` y `validateDecisionHistory` ([validation.ts:20-41](src/features/narrative/validation.ts:20)) — siguiendo D1.1 (validación per-elemento).
- Tests de validación cubren: array válido, array vacío, entrada malformada (week=99), no-array. ([service.test.ts:704-727](src/features/narrative/service.test.ts:704)).

**Hidratación** ([store.ts:170-180](src/features/narrative/store.ts:170)): `hydrateFromSave(snapshot)` restaura `narrativeFlags`, `emittedEvents` y `decisionHistory` directamente.

**Cadenas narrativas** ([service.ts:378-379](src/features/narrative/service.ts:378)): `decisionRequerida`/`decisionBloqueante` consultan el historial vía `decisionInHistory`. Tests directos confirman que el filtro funciona contra un `DecisionRecord` previamente ejecutado ([service.test.ts:639-676](src/features/narrative/service.test.ts:639)).

**Reload (verificación end-to-end no instrumentada):** la cadena `triggerEvent → resolveChoice → SaveFile → loadGame → hydrateFromSave → triggerEvent` está implementada por componentes, pero **no existe un test integración que la ejecute completa**. Cada eslabón está cubierto, pero un cambio silencioso en el formato del `id` (ej. `${season}w${week}` → `s${season}w${week}`) podría romper la consulta sin que ningún test individual lo detecte.

**Verdict:** ✅ memoria narrativa funciona y persiste; las cadenas se evalúan correctamente. Sugerencia (fuera de alcance): añadir un test de integración round-trip en `weekService.test.ts` o en un nuevo `narrative.integration.test.ts`.

---

## 11. m2 — `EventType` deprecado en `dataService.ts` (🟡 MENOR)

[src/services/dataService.ts:16-19](src/services/dataService.ts:16) define un tipo paralelo:

```typescript
// deprecated — kept for legacy callers
export type EventType =
  | 'cotidiano' | 'crisis' | 'decision_moral'
  | 'logro_compartido' | 'revelacion' | 'terceros'

const EVENT_TYPES: readonly EventType[] = [...]
```

Este tipo coexiste con `NarrativeEventType` (`features/narrative/types.ts:8`). Diferencias:
- `EventType` excluye `momento_competicion` (lo cual es deliberado — `dataService.ts` no maneja Moments).
- Cualquier nuevo tipo añadido a `NarrativeEventType` **no se reflejará automáticamente** en `EventType`. Requiere actualización manual.

Marcado "deprecated" en el comentario, pero **sin TODO de retirada ni issue tracking**. Riesgo: si alguien añade `nostalgia` a `NarrativeEventType` y olvida actualizar `dataService.ts`, los eventos `nostalgia` no se cargarán por la ruta legacy.

**Sugerencia de diseño (fuera de alcance):** derivar `EventType` de `NarrativeEventType` con `Exclude<NarrativeEventType, 'momento_competicion'>`, eliminando la duplicación. Patrón válido en TS estricto.

---

## 12. Tests existentes

[src/features/narrative/service.test.ts](src/features/narrative/service.test.ts) — 728 líneas, 9 `describe`, ~50 `it`:

| Suite | Cobertura | Líneas |
|---|---|---|
| `validateNarrativeEvent` | minimal valid, trigger requerido en Moments, rangos de probabilidadMutacion/goeDelta/varianza, tipo desconocido | 83-130 |
| `evaluateConditions` (básico) | minVinculo, flagsBloqueantes, flagsRequeridos, faseTemporada, temporadaMinima | 134-181 |
| `selectWeeklyEvent` | excluye Moments, excluye emitidos, pool vacío, minVinculo, cooldown crisis | 184-226 |
| `selectCompetitionMoment` | filtra por trigger, null si no match, conditions, no excluye emitidos, ignora no-Moments | 230-264 |
| `applyEventEffect` | clamp [0,100], mutación con prob=1, no mutación con prob=0, narrativeFlags, ignora fields de Moment, opción inexistente | 268-351 |
| `applyMomentEffect` | extracción de goeDelta/varianza, defaults neutros, narrativeFlags, opción inexistente | 353-388 |
| `loadEvents` (integración con fetch mock) | concatena 7 archivos, filtros con pool real, skip inválidos, throw si todos fallan | 391-478 |
| `semanasHasta/Desde Proxima/UltimaCompeticion` (helpers) | smallest delta, delta=0 en semana actual, null si no hay, ignora no clasificadas | 487-513 |
| `evaluateConditions — contexto temporal` | pre/post/sin competicion, ventanas de 3 semanas, **bug repro** del usuario | 515-576 |
| `evaluateConditions — lesiones` | requiereLesion (sano/lesionado), bloqueaSiLesion, severidadLesion (moderada vs grave) | 578-628 |
| `evaluateConditions — cadenas narrativas` | decisionRequerida (match/mismatch), decisionBloqueante | 630-677 |
| `buildDecisionRecord` | id estable, consecuencias resumidas, flagsAlterados | 681-700 |
| `validateDecisionHistory` | array válido, vacío, entrada malformada, no-array | 704-727 |

**Tests determinísticos** con `rng = () => 0` o similar. **Cobertura sólida** (12/16 campos de `NarrativeCondition` con test directo, todos los efectos numéricos clampados con test, validación de SaveFile testeada). Los 4 tests faltantes son los listados en m1.

---

## 13. Notas de remediación

Sugerencias breves para cada hallazgo, fuera del alcance de esta auditoría:

1. **M1** — decidir entre extender `TraitLayer` a 5 valores (Bond55) o eliminar `BOND_LAYERS[2]`. La opción extender requiere reetiquetar los traits relevantes (`presion-competitiva` y similares); la opción eliminar requiere actualizar `CLAUDE.md` y aceptar la pérdida de la promesa "55".
2. **M2** — decisión de producto: introducir el campo `capa` (4 valores nominales) en `NarrativeEvent` y `TraitDefinition`, o documentar la simplificación. Bloquea fase 6 (generación con Claude API) si no se decide.
3. **m1** — añadir 4 tests directos en `evaluateConditions`: `maxVinculo`, `minEstres`, `maxEstres`, `semanasDesdeUltimaCompeticion`. ~40 líneas.
4. **m2** — derivar `EventType` con `Exclude<NarrativeEventType, 'momento_competicion'>` en `dataService.ts:16`. Una línea.
5. **m3** — mover `WEEKLY_WEIGHTS` y `COOLDOWN_WEEKS` de `service.ts:46-59` a `lib/balance.ts` con nombres `NARRATIVE_WEEKLY_WEIGHTS` y `NARRATIVE_COOLDOWN_WEEKS`. Importar en `service.ts`.
6. **m4** — soft cooldown universal: añadir `lastEmittedTipo` a `WeeklySelectionState` y multiplicar el peso del último tipo por 0.3 en `weightedPick`. Preserva determinismo.
7. **i1** — actualizar la nota de memoria del proyecto para reflejar que la inconsistencia `logro_compartido`/`logro` ya no existe (o nunca existió en este worktree).

---

## 13.bis Remediación aplicada (2026-05-04)

Tras la auditoría se han resuelto los 6 hallazgos accionables y los 2 informativos. Cambios:

| Hallazgo | Resolución | Archivos |
|---|---|---|
| **M1** ⚠️ | Separadas las dos dimensiones: `TRAIT_VISIBILITY_THRESHOLDS = [20,40,65]` (capa de revelación de rasgos) y `BOND_LAYERS = [20,40,55,65]` (umbrales de atributos psicológicos). `PSYCHOLOGICAL_THRESHOLDS` se deriva de `BOND_LAYERS` sin duplicación. `computeTraitVisibilityLayer` consulta la nueva constante con índices contiguos [0,1,2] en lugar del salto [0,1,3]. `BOND_LAYERS[2]=55` deja de ser huérfana: ya era la fuente real de `PSYCHOLOGICAL_THRESHOLDS.presionCompetitiva`, ahora la conexión es explícita. | `src/lib/balance.ts`, `src/types/skater.ts`, `src/features/athlete/service.ts` |
| **M2** ⚠️ | Añadido tipo `CapaRevelacion = 'señal'\|'patron'\|'verbal'\|'profundidad'` y campo opcional `capa?: CapaRevelacion` en `TraitDefinition` y `NarrativeEvent`. Validador `validateNarrativeEvent` rechaza valores fuera de la unión. Migración del catálogo (60 traits + 39 eventos) se deja para fase posterior; el campo opcional permite migrar gradualmente sin romper nada existente. | `src/types/skater.ts`, `src/features/narrative/types.ts`, `src/features/narrative/service.ts` |
| **m1** 🟡 | Añadidos 8 tests directos: `maxVinculo` (excluye + pasa), `minEstres`, `maxEstres`, rango combinado, `semanasDesdeUltimaCompeticion` (3 casos: bloquea bajo umbral, pasa en rango, bloquea sin competición pasada), `validateNarrativeEvent` con `capa` (acepta/rechaza). Cobertura directa pasa de 12/16 a **16/16** campos de `NarrativeCondition`. | `src/features/narrative/service.test.ts` |
| **m2** 🟡 | `EventType` es ahora `Exclude<NarrativeEventType, 'momento_competicion'>`; `EVENT_TYPES` se deriva de `Object.keys(EVENT_PATHS)`. Añadir un nuevo tipo a `NarrativeEventType` exige declarar su ruta JSON en `EVENT_PATHS` o el código no compila — desfase silencioso eliminado. | `src/services/dataService.ts` |
| **m3** 🟡 | `NARRATIVE_WEEKLY_WEIGHTS`, `NARRATIVE_COOLDOWN_WEEKS` y `NARRATIVE_SOFT_COOLDOWN_FACTOR` movidos a `lib/balance.ts`. `service.ts` los reexporta como aliases tipados internos. Patrón consistente con `BOND_LAYERS`, `BOND_DECAY_PER_WEEK_*` y resto de balance. | `src/lib/balance.ts`, `src/features/narrative/service.ts` |
| **m4** 🟡 | Soft cooldown universal: `softCooldownFactor` multiplica el peso de un tipo por `0.3` cuando ese tipo se emitió la semana anterior. Determinismo preservado (RNG inyectable). 2 tests cubren el cruce de probabilidad y la no-aplicación pasadas dos semanas. | `src/features/narrative/service.ts`, `src/features/narrative/service.test.ts` |
| **i1** 🔵 | Sin acción de código: la inconsistencia `logro_compartido`/`logro` no existe en este worktree. La nota de memoria del proyecto se actualizará después del merge para evitar futuros falsos positivos. | — |
| **i2** 🔵 | Sin acción: documentado en §2.2 que `momento_competicion` es ampliación deliberada del enum, no violación. | — |

**Validación:** `tsc --noEmit -p tsconfig.app.json` sin errores; `vitest run` con **340/340 tests verdes** (de los cuales 77 en `narrative/service.test.ts`, +12 nuevos respecto al estado pre-remediación).

**Notas para futuras fases:**

- Cuando se migre el catálogo de 60 traits para incluir `capa`, hacerlo en `src/data/traits.json` (no en el array `TRAITS` de `types/skater.ts`, donde se define la forma).
- `NARRATIVE_SOFT_COOLDOWN_FACTOR = 0.3` es un balance inicial; revisar tras la primera tanda de partidas reales.
- `PSYCHOLOGICAL_THRESHOLDS.autoexigencia = -1` sigue siendo sentinel "nunca por vínculo solo". Cuando fase 5/6 introduzca diálogos profundos, este -1 se mantendrá; la revelación irá por flag, no por umbral.

---

## 14. Conclusión

El sistema narrativo está **arquitectónicamente sólido y bien testeado** en sus tres dimensiones críticas:

- **Selección y filtrado:** los 16 campos de `NarrativeCondition` están implementados, con cobertura de test directa para 12 y simétrica para los 4 restantes (m1).
- **Aplicación de efectos:** clamping correcto en vínculo, estrés, fatiga y atributos; mutaciones de rasgos integradas con RNG inyectable.
- **Persistencia y memoria:** `DecisionRecord` validado, persistido y consultable; las cadenas narrativas (`decisionRequerida`/`decisionBloqueante`) funcionan con tests directos.

La debilidad estructural (M1 + M2) es **una sola y compartida**: el modelo de **capas de revelación** del GDD no tiene contraparte mecánica fiel. El umbral 55 está documentado pero inerte (M1) y la nomenclatura cualitativa del GDD (señal/patrón/verbal/profundidad) se ha colapsado a una dimensión numérica plana (M2). Ningún jugador notará esto en fase 1 (no hay UI de revelación todavía), pero **fase 6 (generación con Claude API) lo encontrará bloqueante** — la prompt-engineering tendrá que improvisar un esquema de capas en cada llamada, fragmentando la consistencia del catálogo.

Los hallazgos MENORES son deuda de pulido: tests faltantes (m1), taxonomía duplicada (m2), constantes fuera de `balance.ts` (m3), ausencia de diversificación universal de tipos (m4). Ninguno bloquea fase 2.

La inconsistencia heredada `logro_compartido`/`logro` reportada en la memoria del proyecto **queda refutada**: 11 ocurrencias TS + 5 ocurrencias JSON, todas canónicas; cero fugas. La memoria del proyecto debe actualizarse.

**Orden de remediación sugerido (fuera de esta auditoría):**

1. **M1** — decisión sobre el umbral 55. Si extender, reetiquetar traits; si eliminar, actualizar `CLAUDE.md`. Ningún cambio se filtra a fase 2.
2. **M2** — decisión de producto sobre las cuatro capas nominales del GDD. Bloquea fase 6.
3. **m1** — añadir tests faltantes (~40 líneas, una sola tarde de trabajo).
4. **m2** — refactor `EventType = Exclude<...>` (una línea).
5. **m3** — mover `WEEKLY_WEIGHTS` y `COOLDOWN_WEEKS` a `balance.ts`.
6. **m4** — soft cooldown universal (decisión de balance).
7. **i1** — actualizar memoria.

Ningún hallazgo es CRÍTICO. El sistema construye, los tests pasan en CI y la selección semanal puede ejecutarse end-to-end con cualquier `rng` inyectable. M1 y M2 son **bloqueantes para la promesa narrativa del GDD** y deberían cerrarse antes de abrir fase 6 (generación con Claude API), porque la generación necesitará saber a qué capa asignar cada evento nuevo.
