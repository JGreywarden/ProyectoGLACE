# INFORME C1 — Auditoría de Zustand y rendimiento React

| Campo | Valor |
|---|---|
| Fase | 1 (vertical slice endurecido) |
| Auditoría | C1 — Zustand: middleware, selectores, atomicidad cross-store, fan-out de `currentSeason` |
| Fecha | 2026-05-06 |
| Rama auditada | `claude/sharp-ardinghelli-31812a` |
| Alcance | `src/stores/`, `src/features/*/store.ts`, `src/components/`, `src/pages/`, `src/features/*/components/`, `src/router/`, `src/services/weekService.ts` (sólo callers) |
| Modo | Read-only (no se modificó código) |
| Fuente normativa | CLAUDE.md §D3 (atomicidad cross-store), §D4 (selectores específicos), §"Pantallas principales" |

> **Nota metodológica.** No se ejecutaron benchmarks de runtime. La auditoría es estática: se inspeccionaron los selectores y se evaluó qué referencia entrega cada uno y con qué frecuencia cambia. La conclusión sobre fan-out se apoya en cómo `applyWeekTransition` reconstruye el objeto `currentSeason` en cada semana ([gameStore.ts:127](src/stores/gameStore.ts:127)).

---

## 1. Resumen ejecutivo

**Estado global:** ✅ Cero patrones BAD puros (ningún `useStore()` ni `useStore(s => s)`, ningún literal sin `useShallow`). ✅ Ninguna mutación post-selector. ✅ `applyWeekTransition` existe y es atómico. ⚠️ **Pero seis pantallas se suscriben al objeto `currentSeason` completo** —tres de ellas son pantallas principales del bucle activo (Calendario, Competición, Planificación semanal) y `useShallow` **no las protege**: el envoltorio sólo compara la referencia interna, que `applyWeekTransition` cambia cada semana. ⚠️ Una transición de fin de temporada usa dos setters individuales en serie, violando D3.

| Nº | Sev. | Hallazgo |
|---|---|---|
| **C1** | 🔴 CRÍTICO | `pages/Calendario.tsx:18` se suscribe a `currentSeason` completo (envuelto en `useShallow`, lo que **no** evita el re-render porque la referencia cambia en cada `applyWeekTransition`). El árbol monta 30 celdas + filas de competición y `season.historialSemanas` puede crecer hasta miles de entradas. |
| **C2** | 🔴 CRÍTICO | `pages/Competition.tsx:43` se suscribe a `currentSeason` completo. La pantalla está montada durante el procesamiento elemento a elemento (TES/PCS/GOE) y un re-render por cambio de `semanaActual` arrastra la animación entera. |
| **M1** | ⚠️ MAYOR | `pages/WeeklyPlanning.tsx:53` se suscribe a `currentSeason` completo. Es la pantalla más frecuente (5 ranuras + tablero económico) y se vuelve a montar tras cada `WeekProcessing`, justo cuando `applyWeekTransition` acaba de mutar el objeto. |
| **M2** | ⚠️ MAYOR | `pages/DisenadorPrograma.tsx:30` se suscribe a `currentSeason` completo aunque sólo lee `season.temporadaNumero` ([DisenadorPrograma.tsx:72](src/pages/DisenadorPrograma.tsx:72)). Sobre-suscripción evitable con un selector primitivo. |
| **M3** | ⚠️ MAYOR | `pages/SessionResume.tsx:7` se suscribe a `currentSeason` completo aunque sólo lee `season.temporadaNumero` y `season.semanaActual` ([SessionResume.tsx:55-56](src/pages/SessionResume.tsx:55), [65](src/pages/SessionResume.tsx:65)). Sobre-suscripción evitable. |
| **M4** | ⚠️ MAYOR | `pages/SeasonEnd.tsx:99-100` aplica el cambio de temporada con dos `set(...)` individuales (`gs.setCurrentSkater(...)` seguido de `gs.setCurrentSeason(...)`) — violación de D3, debería pasar por `applyWeekTransition({ skater, season })` (o una acción `applySeasonTransition` equivalente) para que ningún render intermedio observe `skater` con edad+1 pero `season` aún con el calendario viejo. |
| m1 | 🟡 MENOR | `pages/CoachDiary.tsx:34` se suscribe a `currentSkater` completo con `useShallow`. Mismo anti-patrón que C1 pero sobre la entidad skater (más pequeña; menor impacto, pero analógico). |
| m2 | 🟡 MENOR | `pages/SeasonEnd.tsx:35` se suscribe a `currentSeason` completo. Es transitoria (intersesión, una vez cada 30 semanas), por lo que el coste real es despreciable; se anota por completitud. |
| m3 | 🟡 MENOR | `pages/CoachCreation.tsx:337-339` aplica skater + season con dos setters individuales. Es bootstrap (única vez por partida) y el render intermedio no es observable porque el componente desmonta inmediatamente — no es bloqueante, pero rompe la regla por consistencia. |
| i1 | 🔵 INFO | Los 8 stores (4 core + 4 feature) usan `devtools` middleware con `name` propio. Ninguno usa `persist`; la persistencia se hace explícitamente en `saveStore` vía `safeStorage`. |
| i2 | 🔵 INFO | `applyWeekTransition` ([gameStore.ts:121-129](src/stores/gameStore.ts:121)) hace **un único** `set(...)`. El bucle semanal lo invoca correctamente desde `WeekProcessing.tsx:86`, `Competition.tsx:226+268` y `NarrativeEvent.tsx:149`. |
| i3 | 🔵 INFO | No se detectó ningún `useStore()` sin selector ni ningún `useStore(s => s)`. No se detectó ningún literal `s => ({…})` sin `useShallow`. |
| i4 | 🔵 INFO | No se detectó mutación del objeto retornado por un selector. Todas las modificaciones pasan por acciones de store (`set`/`get`). |
| i5 | 🔵 INFO | `DisenadorPrograma.tsx:24-25` define `EMPTY_VIOLATIONS` y `EMPTY_PROGRAMS` como referencias estables — buena práctica para evitar el warning *"getSnapshot should be cached"* de `useSyncExternalStore`. |

**Acciones sugeridas (fuera del alcance):** ver §7. C1, C2, M1 son los únicos con impacto medible en runtime; los otros son sobre-suscripciones evitables sin cambio de comportamiento. M4 es bug latente (no observable hoy en producción porque `SeasonEnd` desmonta antes del siguiente render, pero rompe la garantía D3).

---

## 2. Inventario de stores (tarea 1)

Se localizaron 8 stores en total (4 globales + 4 feature). Todos usan `devtools` con `name` propio, ninguno usa `persist` (la persistencia es explícita vía `saveStore`).

| Store | Hook | devtools | Otros middlewares | Estado de alto nivel |
|---|---|---|---|---|
| [src/stores/gameStore.ts](src/stores/gameStore.ts) | `useGameStore` | ✅ `glace/game` | — | `currentState`, `currentSkater`, `currentCoach`, `currentClub`, `currentSeason`, `isFirstSession`, `stateHistory`, `sessionSummary`, `lastEconomyBreakdown`, `lastPressureState` |
| [src/stores/dataStore.ts](src/stores/dataStore.ts) | `useDataStore` | ✅ | — | `loaded` |
| [src/stores/eventStore.ts](src/stores/eventStore.ts) | `useEventStore` | ✅ | — | `emissionCount`, `debugEvents` |
| [src/stores/saveStore.ts](src/stores/saveStore.ts) | `useSaveStore` | ✅ | — | `storageAvailable`, `slots`, `lastLoadReason` |
| [src/features/training/store.ts](src/features/training/store.ts) | `useTrainingStore` | ✅ | — | `schedules` |
| [src/features/narrative/store.ts](src/features/narrative/store.ts) | `useNarrativeStore` | ✅ | — | `availableEvents`, `currentEvent`, `lastContext`, `narrativeFlags`, `emittedEvents`, `lastEmittedBySubtype`, `decisionHistory` |
| [src/features/program/store.ts](src/features/program/store.ts) | `useProgramStore` | ✅ | — | `activeType`, `drafts`, `musicInfo`, `projectedScores`, `violations`, `confirmedPrograms` |
| [src/features/rivals/store.ts](src/features/rivals/store.ts) | `useRivalsStore` | ✅ | — | `pool` |

**Veredicto tarea 1:** ✅ Sin hallazgo. Todos cumplen D4 sobre devtools.

---

## 3. Selectores en componentes (tarea 2)

**Conteo total: 38 invocaciones** (no se cuentan `*.getState()`/`*.setState()` que no son suscripciones).

| Clasificación | Conteo | Patrón |
|---|---|---|
| `GOOD-PRIMITIVE` | 30 | `useStore(s => s.field)` o expresión derivada de un solo campo |
| `GOOD-SHALLOW`   | 8 | `useStore(useShallow(s => ({ … })))` |
| `BAD-WHOLE`      | 0 | — |
| `BAD-OBJECT-NO-SHALLOW` | 0 | — |

### 3.1 Tabla completa por archivo

| archivo:línea | selector (resumido) | clasificación | severidad |
|---|---|---|---|
| `components/ui/SaveSlotPicker.tsx:19-24` | 6 selectores primitivos sobre `useSaveStore` | GOOD-PRIMITIVE | — |
| `pages/CoachDiary.tsx:34` | `useGameStore(useShallow(s => ({ skater: s.currentSkater })))` | GOOD-SHALLOW | **m1** (sobre-suscripción a skater completo) |
| `pages/CoachDiary.tsx:39` | `useNarrativeStore(s => s.decisionHistory)` | GOOD-PRIMITIVE | — |
| `pages/Competition.tsx:43-44` | `useGameStore(useShallow(s => ({ skater, season: s.currentSeason })))` | GOOD-SHALLOW | **C2** |
| `pages/Competition.tsx:46-47` | 2 selectores primitivos sobre `useNarrativeStore` | GOOD-PRIMITIVE | — |
| `pages/MainMenu.tsx:9-11` | 3 selectores primitivos sobre `useSaveStore` | GOOD-PRIMITIVE | — |
| `pages/Calendario.tsx:18` | `useGameStore(useShallow(s => ({ season: s.currentSeason })))` | GOOD-SHALLOW | **C1** |
| `pages/SeasonEnd.tsx:35-40` | `useGameStore(useShallow(s => ({ skater, season: s.currentSeason, club })))` | GOOD-SHALLOW | **m2** |
| `pages/SessionResume.tsx:7-12` | `useGameStore(useShallow(s => ({ sessionSummary, skater, season: s.currentSeason })))` | GOOD-SHALLOW | **M3** |
| `router/ProtectedRoute.tsx:33` | `useGameStore(s => s.currentState)` | GOOD-PRIMITIVE | — |
| `router/GameLayout.tsx:19` | `useGameStore(s => s.currentState)` | GOOD-PRIMITIVE | — |
| `pages/NarrativeEvent.tsx:10` | `useNarrativeStore(useShallow(s => ({ event: s.currentEvent })))` | GOOD-SHALLOW | — (`currentEvent` no crece) |
| `pages/NarrativeEvent.tsx:11` | `useNarrativeStore(s => s.resolveChoice)` | GOOD-PRIMITIVE | — |
| `pages/WeeklyPlanning.tsx:53-58` | `useGameStore(useShallow(s => ({ skater, club, season: s.currentSeason })))` | GOOD-SHALLOW | **M1** |
| `pages/WeeklyPlanning.tsx:61-62` | 2 selectores primitivos (`lastEconomyBreakdown`, `lastPressureState`) | GOOD-PRIMITIVE | — |
| `pages/WeeklyPlanning.tsx:64-68` | 3 selectores sobre `useTrainingStore` (`schedules[id]`, `setSlot`, `clearSchedule`) | GOOD-PRIMITIVE | — |
| `pages/DisenadorPrograma.tsx:30-35` | `useGameStore(useShallow(s => ({ skater, season: s.currentSeason, gameState: s.currentState })))` | GOOD-SHALLOW | **M2** |
| `pages/DisenadorPrograma.tsx:38-44` | 6 selectores primitivos sobre `useProgramStore` | GOOD-PRIMITIVE | — |
| `pages/DisenadorPrograma.tsx:47-56` | 10 selectores de acción sobre `useProgramStore` | GOOD-PRIMITIVE | — |
| `pages/FichaPatinador.tsx:29` | `useGameStore(useShallow(s => ({ skater: s.currentSkater })))` | GOOD-SHALLOW | (analógico a m1; ver §3.2) |

### 3.2 El falso amigo de `useShallow` con `currentSeason`

Cinco de las ocho ocurrencias `GOOD-SHALLOW` tienen la forma `useShallow(s => ({ …, season: s.currentSeason }))` sobre el objeto `currentSeason` completo. **Esto no protege contra re-renders** y va contra D4. La razón:

1. `applyWeekTransition` reconstruye `currentSeason` con spread cada semana ([gameStore.ts:127](src/stores/gameStore.ts:127)):

   ```ts
   if (patch.season && currentSeason) next.currentSeason = { ...currentSeason, ...patch.season }
   ```

   Cada llamada produce **una referencia nueva**.

2. `useShallow` aplica `Object.is` a cada propiedad del envoltorio. La propiedad `season` antes apuntaba al objeto viejo; ahora apunta al nuevo. `Object.is(viejo, nuevo) === false`. El envoltorio falla shallow-eq y el componente re-renderiza.

3. Por tanto, los seis componentes listados se vuelven a renderizar **cada semana procesada** aunque sólo les interese, p.ej., `season.semanaActual` (un número que cambió) y NO `season.historialSemanas` (el array que crece sin parar).

**Por qué importa en magnitud.** `currentSeason.historialSemanas` y `currentSeason.resultadosTemporada` crecen hasta ~30 entradas por temporada × 15 temporadas = ~450 (peor caso teórico del GDD). Las suscripciones no leen los arrays directamente para renderizar JSX salvo en Calendario y SeasonEnd, donde sí se iteran (`Calendario.tsx:30`, `SeasonEnd.tsx:48-61`). En esas dos pantallas el coste del re-render escala con el tamaño del historial.

**Snippets de los hallazgos C1, C2, M1, M2, M3:**

```tsx
// pages/Calendario.tsx:18  ← C1
const { season } = useGameStore(useShallow(s => ({ season: s.currentSeason })))
// usa: season.calendario, season.historialSemanas, season.semanaActual, season.faseActual, season.temporadaNumero
```

```tsx
// pages/Competition.tsx:43-45  ← C2
const { skater, season } = useGameStore(
  useShallow(s => ({ skater: s.currentSkater, season: s.currentSeason })),
)
// usa: season.resultadosTemporada (filtrado por skater.id en useMemo)
```

```tsx
// pages/WeeklyPlanning.tsx:53-58  ← M1
const { skater, club, season } = useGameStore(
  useShallow(s => ({ skater: s.currentSkater, club: s.currentClub, season: s.currentSeason })),
)
// usa: season.semanaActual, season.calendario (filtrado), season.historialSemanas.length
```

```tsx
// pages/DisenadorPrograma.tsx:30-36  ← M2
const { skater, season, gameState } = useGameStore(
  useShallow(s => ({ skater: s.currentSkater, season: s.currentSeason, gameState: s.currentState })),
)
// usa: season.temporadaNumero (un único campo numérico)
```

```tsx
// pages/SessionResume.tsx:7-13  ← M3
const { sessionSummary, skater, season } = useGameStore(
  useShallow((s) => ({ sessionSummary: s.sessionSummary, skater: s.currentSkater, season: s.currentSeason })),
)
// usa: season.temporadaNumero, season.semanaActual (dos campos numéricos)
```

**Veredicto tarea 2:** Pasa la verificación sintáctica (no hay BAD-* puros) pero falla la verificación semántica de D4 en seis archivos. El uso de `useShallow` ha creado una **falsa sensación de seguridad** — `useShallow` sirve para envolver subsets de campos primitivos, no para envolver una referencia de objeto que muta con frecuencia.

---

## 4. Mutaciones (tarea 3)

Se buscaron asignaciones del tipo `<varDeSelector>.<campo> =` en todos los componentes. **No se detectó ninguna.** Toda mutación de estado de dominio pasa por:

- Acciones del store (`set/get` interno).
- `useGameStore.getState().applyWeekTransition(…)` para cambios cross-store.

Los cierres de patrón inmutable se respetan: `weekService.ts` clona skater/club/season (`{ ...skater }`) antes de devolver el patch, sin tocar el original.

**Veredicto tarea 3:** ✅ Sin hallazgo.

---

## 5. Crecimiento de `currentSeason` (tarea 4)

Componentes que se suscriben al objeto `currentSeason` completo (cualquiera de los cuales sufre el problema descrito en §3.2):

| Componente | Línea | Pantalla principal del GDD | Severidad |
|---|---|---|---|
| `pages/Calendario.tsx` | 18 | ✅ sí (cap. 18) | **C1 CRÍTICO** |
| `pages/Competition.tsx` | 43 | ✅ sí (cap. 18) | **C2 CRÍTICO** |
| `pages/WeeklyPlanning.tsx` | 53 | ✅ sí (HubSemanal del GDD) | **M1 MAYOR** (no CRÍTICO porque sólo se itera `historialSemanas.length`, no se renderiza el array) |
| `pages/DisenadorPrograma.tsx` | 30 | ✅ sí (cap. 18) | **M2 MAYOR** |
| `pages/SessionResume.tsx` | 7 | — (transitoria de carga) | **M3 MAYOR** |
| `pages/SeasonEnd.tsx` | 35 | — (transitoria intersesión) | **m2 MENOR** |

Componentes que tocan `historialSemanas` o `resultadosTemporada` directamente (lecturas, no mutaciones):

| Componente | Línea | Operación | Comentario |
|---|---|---|---|
| `pages/Calendario.tsx:30` | `season.historialSemanas.filter(w => w.eventoNarrativoId)` | sin memoización | reconstruye un Set en cada render — exacerbado por C1 |
| `pages/SeasonEnd.tsx:48-61` | itera ambos arrays | dentro de `useMemo([season])` ✅ | el `useMemo` es correcto pero la dep es `season` completa, así que se re-evalúa con cualquier mutación |
| `pages/Competition.tsx:52-54` | `season.resultadosTemporada.filter(r => r.skaterId === skater.id)` | dentro de `useMemo([season, skater])` ✅ | igual que arriba |
| `pages/WeeklyPlanning.tsx:110` | `season.historialSemanas.length >= 30` | un campo derivado | barato; no problemático en sí mismo |

**Veredicto tarea 4:** Hallazgos C1, C2, M1, M2, M3, m2.

---

## 6. Acción compuesta `applyWeekTransition` (tarea 5)

### 6.1 Existencia y firma

`applyWeekTransition` ([gameStore.ts:121-129](src/stores/gameStore.ts:121)):

```ts
applyWeekTransition: (patch) => {
  const { currentSkater, currentCoach, currentClub, currentSeason } = get()
  const next: Partial<GameStoreState> = {}
  if (patch.skater && currentSkater) next.currentSkater = { ...currentSkater, ...patch.skater }
  if (patch.coach  && currentCoach)  next.currentCoach  = { ...currentCoach,  ...patch.coach  }
  if (patch.club   && currentClub)   next.currentClub   = { ...currentClub,   ...patch.club   }
  if (patch.season && currentSeason) next.currentSeason = { ...currentSeason, ...patch.season }
  set(next, false, 'game/applyWeekTransition')
}
```

Hace **un único** `set(...)` ✅. Atomicidad cross-store garantizada.

### 6.2 Callers

```
pages/WeekProcessing.tsx:86      ✅ aplica el WeekResult
pages/NarrativeEvent.tsx:149     ✅ aplica el patch del skater tras una elección
pages/Competition.tsx:226        ✅ aplica el patch tras un Moment in-pista
pages/Competition.tsx:268        ✅ aplica resultadosTemporada
```

### 6.3 Setters individuales

Setters todavía expuestos en gameStore (legítimo para bootstrap):

- `setCurrentSkater`, `setCurrentCoach`, `setCurrentClub`, `setCurrentSeason` ([gameStore.ts:109-112](src/stores/gameStore.ts:109)).

**Callers reales** (excluyendo tests):

| archivo:línea | uso |
|---|---|
| `pages/CoachCreation.tsx:337` | `gs.setCurrentSkater(skater)` — bootstrap (creación de partida). |
| `pages/CoachCreation.tsx:339` | `gs.setCurrentSeason(season)` — bootstrap. |
| `pages/SeasonEnd.tsx:99` | `gs.setCurrentSkater(nextSkater)` — **transición intersesión**. |
| `pages/SeasonEnd.tsx:100` | `gs.setCurrentSeason(nextSeason)` — **transición intersesión**. |

`SeasonEnd.tsx:99-100` **no es bootstrap** y muta dos entidades en serie:

```ts
// pages/SeasonEnd.tsx:99-100
gs.setCurrentSkater(nextSkater)
gs.setCurrentSeason(nextSeason)
```

Entre las dos llamadas, cualquier suscriptor que esté montado verá un estado imposible: `skater.age` ya incrementado pero `season` aún apuntando a la temporada vieja con `historialSemanas` lleno y `temporadaNumero` viejo. En la práctica el componente desmonta inmediatamente al `navigate('/disenador-programa')`, así que el render intermedio no llega a observarse — pero **rompe la garantía D3 por construcción**, no por casualidad. La forma correcta es:

```ts
// fix sugerido (fuera de alcance)
gs.applyWeekTransition({
  skater: { age: …, weeklyState: … },
  season: { semanaActual: 1, faseActual: …, temporadaNumero: …, calendario: …, resultadosTemporada: [], historialSemanas: [] },
})
```

`CoachCreation.tsx:337-339` es bootstrap — la primera vez que entran skater y season al store. `currentSkater === null` y `currentSeason === null` antes; ningún renderer reactivo monta la UI hasta que ambos están seteados (ver `WeeklyPlanning.tsx:89` early-return). Riesgo despreciable; se anota como **m3 MENOR**.

**Veredicto tarea 5:** Hallazgo M4 sobre `SeasonEnd.tsx:99-100` y m3 sobre `CoachCreation.tsx:337-339`. El bucle semanal en sí (la pregunta principal) usa `applyWeekTransition` correctamente.

---

## 7. Recomendaciones (fuera del alcance del fix)

### 7.1 Reescritura de los 6 selectores sobre `currentSeason`

| Componente | Selector actual | Selector recomendado |
|---|---|---|
| `Calendario.tsx:18` | `useShallow(s => ({ season: s.currentSeason }))` | 4 selectores primitivos: `historialSemanas`, `calendario`, `semanaActual`, `temporadaNumero`, `faseActual` (o un `useShallow` que **proyecte** sólo esos campos primitivos en el envoltorio) |
| `Competition.tsx:43` | `useShallow(s => ({ skater, season: s.currentSeason }))` | `useShallow(s => ({ skater: s.currentSkater, resultados: s.currentSeason?.resultadosTemporada }))` — ahora el envoltorio sólo cambia cuando `resultadosTemporada` se reasigna, no cuando lo hace `semanaActual` |
| `WeeklyPlanning.tsx:53` | `useShallow(s => ({ skater, club, season: s.currentSeason }))` | `useShallow(s => ({ skater: s.currentSkater, club: s.currentClub, semanaActual: s.currentSeason?.semanaActual, calendario: s.currentSeason?.calendario, historialLen: s.currentSeason?.historialSemanas.length ?? 0 }))` |
| `DisenadorPrograma.tsx:30` | `useShallow(s => ({ skater, season: s.currentSeason, gameState }))` | `useShallow(s => ({ skater: s.currentSkater, temporadaNumero: s.currentSeason?.temporadaNumero, gameState: s.currentState }))` |
| `SessionResume.tsx:7` | `useShallow(s => ({ sessionSummary, skater, season: s.currentSeason }))` | `useShallow(s => ({ sessionSummary: s.sessionSummary, skater: s.currentSkater, temporadaNumero: s.currentSeason?.temporadaNumero, semanaActual: s.currentSeason?.semanaActual }))` |
| `SeasonEnd.tsx:35` | `useShallow(s => ({ skater, season: s.currentSeason, club }))` | (transitoria — bajo coste; opcional) |

El patrón general: **proyectar campos primitivos en el envoltorio**, no la referencia del objeto entero.

### 7.2 Extraer `applySeasonTransition` (M4)

Añadir una acción compuesta en `gameStore` análoga a `applyWeekTransition` pero pensada para la transición intersesión:

```ts
applySeasonTransition: (patch: { skater?: Partial<SkaterData>; season?: Partial<SeasonData> }) => { … }
```

O reutilizar `applyWeekTransition` directamente desde `SeasonEnd.tsx:99-100`. La firma ya admite skater + season en un único `set(...)`.

### 7.3 Memoización del Set en Calendario

`pages/Calendario.tsx:30` reconstruye `eventWeeks: Set<number>` en cada render. Tras el fix de C1, este Set ya sólo se reconstruirá cuando `historialSemanas` cambie. Si se quiere optimizar más, envolverlo en `useMemo([historialSemanas])`.

---

## 8. Apéndice — Tabla compacta archivo → selector → clasificación

| archivo | línea | clasificación | severidad |
|---|---|---|---|
| components/ui/SaveSlotPicker.tsx | 19,20,21,22,23,24 | GOOD-PRIMITIVE | — |
| pages/CoachDiary.tsx | 34 | GOOD-SHALLOW | m1 |
| pages/CoachDiary.tsx | 39 | GOOD-PRIMITIVE | — |
| pages/Competition.tsx | 43 | GOOD-SHALLOW | **C2** |
| pages/Competition.tsx | 46,47 | GOOD-PRIMITIVE | — |
| pages/MainMenu.tsx | 9,10,11 | GOOD-PRIMITIVE | — |
| pages/Calendario.tsx | 18 | GOOD-SHALLOW | **C1** |
| pages/SeasonEnd.tsx | 35 | GOOD-SHALLOW | m2 |
| pages/SessionResume.tsx | 7 | GOOD-SHALLOW | **M3** |
| router/ProtectedRoute.tsx | 33 | GOOD-PRIMITIVE | — |
| router/GameLayout.tsx | 19 | GOOD-PRIMITIVE | — |
| pages/NarrativeEvent.tsx | 10 | GOOD-SHALLOW | — |
| pages/NarrativeEvent.tsx | 11 | GOOD-PRIMITIVE | — |
| pages/WeeklyPlanning.tsx | 53 | GOOD-SHALLOW | **M1** |
| pages/WeeklyPlanning.tsx | 61,62,64,67,68 | GOOD-PRIMITIVE | — |
| pages/DisenadorPrograma.tsx | 30 | GOOD-SHALLOW | **M2** |
| pages/DisenadorPrograma.tsx | 38–56 | GOOD-PRIMITIVE (×16) | — |
| pages/FichaPatinador.tsx | 29 | GOOD-SHALLOW | (analógico m1) |

---

## 9. Recapitulativo por tarea del enunciado

| Tarea | Pregunta | Veredicto |
|---|---|---|
| 1 | ¿Stores con devtools? | ✅ todos lo tienen — sin hallazgo |
| 2 | ¿Selectores correctos? | ✅ patrón sintáctico OK; ⚠️ patrón semántico falla en 6 archivos por suscripción a `currentSeason` completo (C1, C2, M1, M2, M3, m2 + analógico m1 para skater) |
| 3 | ¿Mutación post-selector? | ✅ ninguna — sin hallazgo |
| 4 | ¿Componente suscrito a season completa? | 🔴 sí, 6 — Calendario y Competition CRÍTICOS, WeeklyPlanning + DisenadorPrograma + SessionResume MAYORES, SeasonEnd MENOR |
| 5 | ¿`applyWeekTransition` existe y se usa? | ✅ existe, atómico, usado por el bucle. ⚠️ M4 — `SeasonEnd.tsx:99-100` lo bypasa con dos setters individuales |

**Cierre:** No hay patrones de Zustand "rotos por completo". Hay un anti-patrón coherente y replicado en seis pantallas (envolver `currentSeason` con `useShallow` creyendo que protege) y una violación localizada de atomicidad en la transición intersesión. Ambos se arreglan mecánicamente sin cambios de arquitectura.
