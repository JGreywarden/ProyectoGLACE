# INFORME C3 — Auditoría de plataforma (Worker, event bus, ErrorBoundary)

| Campo | Valor |
|---|---|
| Fase | 1 (vertical slice endurecido) |
| Auditoría | C3 — Capa de plataforma: Web Worker de competición, event bus mitt, ErrorBoundary y manejo de errores |
| Fecha | 2026-05-07 |
| Rama auditada | `claude/vibrant-agnesi-d40285` |
| Alcance | `src/workers/competitionWorker.ts`, `src/features/competition/service.ts`, `src/lib/events.ts`, `src/types/events.ts`, `src/stores/eventStore.ts`, `src/components/ErrorBoundary.tsx`, `src/App.tsx`, `src/main.tsx`, `src/features/*/service.ts`, `src/services/dataService.ts`, `src/services/saveService.ts`, `src/features/narrative/service.ts`, `src/features/program/service.ts` |
| Modo | Read-only (no se modificó código) |
| Fuente normativa | CLAUDE.md regla 9 (ErrorBoundary), CLAUDE.md §arquitectura (worker como módulo puro + wrapper main-thread), comentario `events.ts:4-5` (bus solo para efectos desacoplados) |

> **Nota metodológica.** Lectura completa de los archivos del worker, su engine público y el wrapper main-thread; recorrido exhaustivo de `bus.on(`/`bus.emit(` por todo `src/`; lectura del `ErrorBoundary` y su montaje raíz; barrido de `try {` y `console.\(warn\|error\)` en services. No se ejecutaron tests ni dev server: la auditoría es estática. Las cifras de "spawn por carrera" son analíticas (30 competiciones × 15 temporadas), no medidas.

---

## 1. Resumen ejecutivo

**Estado global:**
- **Foco A (Worker, 5 tareas):** 3 ✅ / 2 ❌ MAYOR. Mensajes tipados, `try/catch` correcto y `terminate()` en ambos handlers. **Falta timeout** (la promesa puede colgar para siempre) y el **tipo de `onerror` está mal acotado** (enmascara el error real).
- **Foco B (Bus, 3 tareas):** 3 ✅. `mitt<GlaceEvents>` correctamente tipado, sin abuso como store, sin memory leaks porque hoy **no hay un solo listener en producción**. La infraestructura está bien, pero dormida: cuando se conecte el primer consumer conviene fijar la pauta de cleanup con un test.
- **Foco C (Errores, 3 tareas):** 1 ✅ + 2 con violaciones de la regla 9. `ErrorBoundary` raíz cumple. **Dos puntos MAYORES** ocultan fallos parciales del bootstrap de datos detrás de `console.warn` y dejan los stores en estado "loaded" mintiendo a la UI.

| Nº | Sev. | Hallazgo |
|---|---|---|
| **M1** | ❌ MAYOR | Service de competición no tiene timeout. Si el worker cuelga, la promesa no resuelve ni rechaza nunca; el worker permanece vivo y la UI espera indefinidamente. ([service.ts:36-53,74-94](src/features/competition/service.ts:36)) |
| **M2** | ❌ MAYOR | `WorkerLike.onerror` tipado como `(event: { message?: string }) => void` en lugar de `(event: ErrorEvent) => void`. Pierde `error.stack`, `filename`, `lineno`. Cualquier error sin `message` rellenado sale como `'competition worker failed'`. ([service.ts:15,47-50,88-91](src/features/competition/service.ts:15)) |
| **M3** | ❌ MAYOR | `loadEvents` silencia fallos individuales con `console.warn` y devuelve éxito con pool incompleto. Si 5 de 6 archivos cargan, el callsite no distingue éxito completo de degradado. Viola regla 9: el store narrativo queda inconsistente sin que la UI lo sepa. ([narrative/service.ts:221-256](src/features/narrative/service.ts:221)) |
| **M4** | ❌ MAYOR | `preloadAll` degrada toda rejection a `console.warn` y vuelve `void`. El store siempre marca `loaded: true` aunque falte `judges.json`, `competitions.json` o `installations.json` (todos load-bearing en Fase 1). La splash miente. ([dataService.ts:448-463](src/services/dataService.ts:448)) |
| **m1** | 🟡 MENOR | ~450 spawns de worker por carrera (30 competiciones × 15 temporadas). Hoy seguro: cada worker se termina al recibir resultado. Vigilar cuando entre simulación de NPC en lote (Fase 4+); plan: pool reusable de 2-4 workers con cola. ([service.ts:18-23](src/features/competition/service.ts:18)) |
| **m2** | 🟡 MENOR | `estimateBpm` y `extractMusicInfo` devuelven fallback silencioso sin log: si la heurística de BPM se rompe, el equipo no se entera. Contrato documentado, aceptable hoy, revisar cuando se monte el diseñador de programas. ([program/service.ts:378-416,458-476](src/features/program/service.ts:378)) |
| **m3** | 🟡 MENOR | Bus dormido sin cobertura de tests sobre patrón `on/off + cleanup`. Cuando se conecte el primer listener real, escribir test de monte/desmonte que verifique `bus.off` antes de que prolifere el patrón. |
| i1 | 🔵 INFO | Mensajes Worker tipados con discriminated union en ambas direcciones (`SimulateRequest \| SimulateProgramRequest` ↔ `result \| program \| error`). ([competitionWorker.ts:19-40](src/workers/competitionWorker.ts:19)) |
| i2 | 🔵 INFO | Worker captura `try/catch` global y envía `{ type: 'error', message }` con extracción robusta de `Error.message`. Protege también mensajes vacíos y `type` desconocido. ([competitionWorker.ts:56-87](src/workers/competitionWorker.ts:56)) |
| i3 | 🔵 INFO | `terminate()` en `onmessage` y `onerror` de ambas APIs (`runCompetition`, `runProgramSimulation`). Sin worker pool: 1 worker = 1 simulación. ([service.ts:40,48,78,89](src/features/competition/service.ts:40)) |
| i4 | 🔵 INFO | `bus = mitt<GlaceEvents>()` con 12 eventos tipados (lifecycle, skater, narrativa, competición, economía, instalaciones). Cero listeners en producción. Cero abuso como store. ([events.ts:6](src/lib/events.ts:6), [types/events.ts:6-19](src/types/events.ts:6)) |
| i5 | 🔵 INFO | `<ErrorBoundary>` montado en raíz con fallback útil (mensaje en español, recovery a Main Menu, log en `componentDidCatch`, dump del mensaje en DEV). El recovery evita re-throw saltándose `changeState`. ([ErrorBoundary.tsx:15-62](src/components/ErrorBoundary.tsx:15), [App.tsx:5-15](src/App.tsx:5)) |
| i6 | 🔵 INFO | `saveService` traduce excepciones a códigos de razón (`reason: 'corrupt'` / `'storage_unavailable'` / `'not_found'`); patrón correcto de catch escalado por estado tipado. ([saveService.ts:301-307](src/services/saveService.ts:301)) |

**Conclusión:** la capa de plataforma cumple la arquitectura prevista (worker como módulo puro vía wrapper Promise, bus tipado, ErrorBoundary raíz). Quedan **cuatro puntos MAYORES de robustez** que conviene cerrar antes de Fase 4 — dos en el wrapper main-thread del worker (timeout + tipo de error) y dos en el bootstrap de datos (`loadEvents` y `preloadAll` silencian fallos parciales). El bus está bien diseñado y dormido; mantenerlo así hasta tener un consumer real es la decisión correcta.

---

## 2. Foco A — Web Worker

### 2.1 (A1) Mensajes tipados con discriminated union

✅ **Cumple.**

Worker ↔ main thread usan unión discriminada con literal `type` en **ambas direcciones**.

**Main → Worker** ([competitionWorker.ts:19-35](src/workers/competitionWorker.ts:19)):

```ts
export interface SimulateRequest {
  type:         'simulate'
  skater:       SkaterData
  program:      ProgramData
  judges:       Judge[]
  contextFlags: CompetitionContextFlags
}

export interface SimulateProgramRequest {
  type:         'simulate-program'
  // ...
}

export type WorkerRequest = SimulateRequest | SimulateProgramRequest
```

**Worker → Main** ([competitionWorker.ts:37-40](src/workers/competitionWorker.ts:37)):

```ts
export type WorkerResponse =
  | { type: 'result';  result: SimulationResult }
  | { type: 'program'; elements: ElementOutcome[]; score: ProgramScore }
  | { type: 'error';   message: string }
```

El service consume mediante el discriminador antes de castear ([service.ts:41-45,79-86](src/features/competition/service.ts:41)). El compilador estrecha la rama correctamente; no hay `as any`.

### 2.2 (A2) `try/catch` que envía `{ type: 'error', message }`

✅ **Cumple, con defensa adicional.**

```ts
// competitionWorker.ts:56-87
scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const data = event.data
  if (!data) {
    scope.postMessage({ type: 'error', message: 'empty message' } satisfies WorkerResponse)
    return
  }
  try {
    // ... routing simulate / simulate-program ...
    scope.postMessage({ type: 'error', message: 'unknown message type' } satisfies WorkerResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    scope.postMessage({ type: 'error', message } satisfies WorkerResponse)
  }
}
```

Tres líneas de defensa: (a) mensaje vacío antes del try; (b) `try/catch` global con extracción robusta vía `instanceof Error`; (c) rama `'unknown message type'` para discriminadores que no encajen. El worker no puede explotar silenciosamente.

### 2.3 (A3) `worker.terminate()` y volumen de spawns

✅ **Cumple en `terminate()`. 🟡 MENOR (m1) en volumen.**

`terminate()` aparece en los cuatro handlers ([service.ts:40,48,78,89](src/features/competition/service.ts:40)):

```ts
// runCompetition (legacy)
worker.onmessage = (event: MessageEvent) => {
  const data = event.data
  worker.terminate()                // ← onmessage
  if (data?.type === 'result') resolve(data.result as SimulationResult)
  else reject(new Error(data?.message ?? 'competition worker returned an unknown response'))
}
worker.onerror = (err) => {
  worker.terminate()                // ← onerror
  reject(new Error(err.message ?? 'competition worker failed'))
}
```

Cada simulación spawnea un worker fresco ([service.ts:18-23](src/features/competition/service.ts:18)) y lo termina en cuanto recibe respuesta o error. No hay leak de workers.

**Volumen estimado por save:** 30 competiciones por temporada × 15 temporadas ≈ **450 worker spawns por carrera completa**. Hoy es seguro: el coste de instanciar un Worker (carga del módulo + parseo del engine) es del orden de 5-20 ms por spawn, y cada simulación ocurre intercalada con horas reales de juego. Los 450 spawns están repartidos en 20-40 minutos × 15 sesiones, no en una sola tanda.

**Riesgo a futuro:** Fase 4+ probablemente añadirá simulación de rivales NPC en bloques (50-100 patinadores simulados al final de cada competición). En ese momento el patrón "worker por simulación" puede saturar (50 spawns secuenciales × 20 ms = 1 s de overhead). **Recomendación de futuro (no bloqueante para Fase 1):** introducir un pool de 2-4 workers reusables con cola de jobs cuando aparezca el bloque de simulación NPC.

### 2.4 (A4) Timeout de seguridad

❌ **MAYOR (M1).**

**No hay timeout en ninguna de las dos APIs del wrapper.** Ni `runCompetition` ([service.ts:36-53](src/features/competition/service.ts:36)) ni `runProgramSimulation` ([service.ts:74-94](src/features/competition/service.ts:74)) instalan un `setTimeout` que rechace la promesa o termine el worker si el worker cuelga.

```ts
return new Promise((resolve, reject) => {
  const worker = spawnWorker()
  worker.onmessage = (event: MessageEvent) => { /* ... */ }
  worker.onerror   = (err) => { /* ... */ }
  worker.postMessage({ type: 'simulate', skater, program, judges, contextFlags })
  // ← no hay setTimeout aquí
})
```

**Impacto:** si el motor entra en un bucle infinito (regresión en `simulateProgramElements`, condición de salida rota en una iteración por elemento o por juez) o si el worker nunca termina de procesar (mensaje malformado que evite las tres ramas y caiga fuera del flujo, deadlock con `Math.imul` corrupto, etc.), entonces:

- la promesa **nunca** resuelve ni rechaza,
- el `await` en el callsite cuelga la pantalla de competición indefinidamente,
- el worker permanece vivo en memoria,
- no hay forma de cancelar (no hay AbortController ni señal externa).

Hoy el motor TES/PCS es determinista, acotado por número de elementos × jueces y `mulberry32` es seguro. Pero el motor es lo bastante complejo (loops anidados sobre 8 elementos × 9 jueces × extracción de GOE × finalización de PCS) para que una regresión futura cuelgue silenciosamente.

**Recomendación:** añadir timeout en ambas funciones (mismo patrón):

```ts
return new Promise((resolve, reject) => {
  const worker = spawnWorker()
  const timer = setTimeout(() => {
    worker.terminate()
    reject(new Error('competition worker timeout'))
  }, 5000)  // 5 s es generoso para cualquier simulación legítima
  worker.onmessage = (event) => { clearTimeout(timer); worker.terminate(); /* ... */ }
  worker.onerror   = (err)   => { clearTimeout(timer); worker.terminate(); /* ... */ }
  worker.postMessage({ /* ... */ })
})
```

### 2.5 (A5) Tipo de `onerror` y enmascaramiento

❌ **MAYOR (M2).**

`WorkerLike.onerror` está tipado de manera **incompleta y peligrosa** ([service.ts:11-16](src/features/competition/service.ts:11)):

```ts
interface WorkerLike {
  postMessage: (msg: unknown) => void
  terminate:   () => void
  onmessage:   ((event: MessageEvent) => void) | null
  onerror:     ((event: { message?: string }) => void) | null  // ← incorrecto
}
```

El cast `as unknown as WorkerLike` ([service.ts:22](src/features/competition/service.ts:22)) lo aplica al `Worker` real. La firma correcta es `(event: ErrorEvent) => void`, donde `ErrorEvent` expone `message`, `filename`, `lineno`, `colno` y, sobre todo, `error` (el `Error` real con stack trace).

Los handlers consumen así:

```ts
// service.ts:47-50 y 88-91
worker.onerror = (err) => {
  worker.terminate()
  reject(new Error(err.message ?? 'competition worker failed'))
}
```

**Problemas:**

1. **Pérdida del stack trace.** `event.error` (el `Error` real, si está disponible) es invisible al tipo, así que nunca se transfiere al `Error` que se construye para `reject`. El stack del callsite se pierde.
2. **`'competition worker failed'` por defecto.** `ErrorEvent.message` casi siempre se rellena, pero hay rutas (errores de carga del módulo de Vite, errores nativos del runtime, fallos de import dinámico antes de que el script ejecute) donde el evento puede llegar con `message` vacío o no estándar. En esos casos el usuario ve el mensaje genérico, no la causa real.
3. **Nada distingue `Event` de `ErrorEvent`.** En navegadores estrictos `worker.onerror` puede recibir un `Event` "neutralizado" cuando el worker está cross-origin o cuando ha habido CSP block; el tipo actual no fuerza al desarrollador a comprobarlo.

**Recomendación:** tipar correctamente y enriquecer el reject:

```ts
interface WorkerLike {
  postMessage: (msg: unknown) => void
  terminate:   () => void
  onmessage:   ((event: MessageEvent) => void) | null
  onerror:     ((event: ErrorEvent) => void) | null
}

worker.onerror = (event) => {
  worker.terminate()
  const inner = event.error instanceof Error ? event.error : null
  const msg   = inner?.message ?? event.message ?? 'competition worker failed'
  const error = new Error(msg)
  if (inner?.stack) error.stack = inner.stack
  reject(error)
}
```

---

## 3. Foco B — Event bus mitt

### 3.1 (B1) `Emitter<EventMap>` tipado

✅ **Cumple.**

```ts
// src/lib/events.ts:6
export const bus = mitt<GlaceEvents>()
```

`GlaceEvents` declara 12 eventos con payload tipado ([types/events.ts:6-19](src/types/events.ts:6)):

| Evento | Payload | Categoría |
|---|---|---|
| `week_confirmed` | `{ week, season }` | lifecycle |
| `week_processed` | `{ week, skaterId, gainMap }` | lifecycle |
| `bond_changed` | `{ skaterId, delta, reason, newValue }` | skater |
| `attribute_changed` | `{ skaterId, attribute, delta, newValue }` | skater |
| `trait_revealed` | `{ skaterId, traitId, layer }` | skater |
| `trait_mutated` | `{ skaterId, traitId, direction }` | skater |
| `skater_injured` | `{ skaterId, injuryType, recoveryWeeks }` | skater |
| `narrative_event_triggered` | `{ eventId, type }` | narrativa |
| `competition_result` | `{ skaterId, competitionId, tes, pcs, total, placement }` | competición |
| `financial_pressure_changed` | `{ level, budget }` | economía |
| `installation_upgraded` | `{ facilityId, newLevel }` | club |
| `season_ended` | `{ season }` | lifecycle |

Cobertura coherente con los dominios del GDD.

### 3.2 (B2) `off` en cleanup de `useEffect`

✅ **Cumple por vacuidad. 🟡 m3 (cobertura preventiva).**

Búsqueda de `bus.on(` y de `events.on(` sobre todo `src/`: **cero call-sites en componentes/hooks/services**. El único módulo que importa `bus` es `src/stores/eventStore.ts`, cuyo wrapper expone `on/off/emit` de forma defensiva (la closure devuelve la función de cleanup correcta):

```ts
// eventStore.ts:42-43
on: (event, handler) => {
  bus.on(event, handler)
  return () => bus.off(event, handler)
},
```

Sin embargo, `eventStore` **no es importado por ninguna pantalla en Fase 1**. La consecuencia es **cero memory leaks hoy** y **cero tests sobre el patrón de cleanup**. Cuando el primer listener real aterrice, no habrá precedente de "useEffect + off" en el código base.

**Recomendación leve (m3):** cuando se introduzca el primer listener real, acompañarlo de un test mínimo (Vitest + RTL) que monte/desmonte el componente y verifique que `bus.off` se invocó. Establece la pauta antes de que se convierta en costumbre olvidarlo.

### 3.3 (B3) Uso indebido como sustituto de stores

✅ **Cumple. No hay abuso.**

El catálogo de `GlaceEvents` describe **transiciones de dominio** (resultados, lesiones, mutaciones, fin de temporada), no estado persistente. Compárese con los stores Zustand que sí gestionan estado:

- `gameStore`: `currentState`, `currentSkater`, `currentCoach` — actualizado directamente vía `set(...)`, nunca emitido.
- `narrativeStore`: `emittedEvents`, `narrativeFlags` — estado que se persiste en el save.
- `saveStore`, `dataStore`: estado de carga y disponibilidad.

Ningún evento del bus duplica un campo de un store, ni es una vía de actualización paralela. El comentario en [events.ts:4-5](src/lib/events.ts:4) lo formaliza:

```ts
// singleton — import `bus` wherever you need cross-feature communication
// prefer direct store updates for same-feature state; bus is for decoupled side-effects
```

**Por qué hoy está dormido es legítimo:** la Fase 1 entrega un vertical slice donde features no necesitan reaccionar entre sí. La proyección razonable es que en Fase 4-6 un evento `competition_result` dispare reputación + sponsors + narrativa sin acoplar las tres features. Mantener la infra hoy y conectar listeners cuando haga falta es la decisión correcta — siempre que la pauta de cleanup quede fijada (m3).

---

## 4. Foco C — ErrorBoundary y manejo de errores

### 4.1 (C1) `<ErrorBoundary>` y fallback útil

✅ **Cumple.**

Definido en [ErrorBoundary.tsx:15-62](src/components/ErrorBoundary.tsx:15) como `Component<Props, State>` clásico:

```ts
static getDerivedStateFromError(error: Error): State { return { error } }

componentDidCatch(error: Error, info: ErrorInfo): void {
  console.error('ErrorBoundary captured error:', error, info.componentStack)
}
```

Montado en la raíz del árbol vía `<RootLayout>` ([App.tsx:5-15](src/App.tsx:5)):

```tsx
export function RootLayout() {
  return (
    <div className="min-h-screen bg-bg-deep text-content-primary">
      <ErrorBoundary>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </ErrorBoundary>
    </div>
  )
}
```

El fallback **no es** `return null`. Renderiza ([ErrorBoundary.tsx:36-58](src/components/ErrorBoundary.tsx:36)):

- Título "Algo ha salido mal".
- Mensaje tranquilizador: "El estado del juego está a salvo en tus slots de guardado".
- En DEV (`import.meta.env.DEV`), `<pre>` con `error.message` para debugging.
- Botón "Volver al menú principal" que invoca `handleReturnToMenu`.

El recovery ([ErrorBoundary.tsx:26-34](src/components/ErrorBoundary.tsx:26)) es prudente: usa `useGameStore.setState` directamente en lugar de `changeState`, evitando que la validación de transiciones (que podría re-throw desde un estado terminal) reentre al boundary y produzca un loop. Tras el reset hace `window.location.assign('/')` para forzar remount limpio.

### 4.2 (C2) `try/catch` en services — barrido

`grep -rn "try {" src/features/*/service.ts src/services/*.ts` arroja 4 bloques relevantes. Veredicto por bloque:

#### 4.2.1 `estimateBpm` — 🟡 m2 (aceptable con matiz)

[program/service.ts:378-416](src/features/program/service.ts:378). Envuelve análisis perceptual de audio y devuelve `null` ante cualquier error. El docstring ya documenta el contrato "fallback contract"; el caller maneja `tempo: null`.

**Veredicto:** aceptable porque es función pura de análisis donde el fallback es semántico ("no se pudo estimar"), no error de dominio. **Pero**: ningún log ni telemetría. Si la heurística se rompe globalmente por una regresión futura, el equipo no se entera. **Recomendación:** `console.warn('[program] BPM estimate failed', err)` o evento de telemetría cuando exista.

#### 4.2.2 `extractMusicInfo` — 🟡 m2 (aceptable con matiz)

[program/service.ts:458-476](src/features/program/service.ts:458). Captura `await file.arrayBuffer()` + `decodeAudioData` y devuelve `{ tempo: null, duration: 0 }`. El `finally` cierra el `AudioContext` con un segundo `try/catch { /* ignore close errors */ }`.

**Veredicto:** mismo patrón documentado que `estimateBpm`, pero **silencia errores reales** (archivo corrupto vs. `AudioContext` bloqueado por la política del navegador vs. fallo de red). Aceptable solo porque Fase 1 acepta `MusicInfo` degradado. **A revisar en Fase 4** cuando se monte el diseñador de programas: probablemente el usuario debe ver "no se pudo leer la pista", no un programa con duración 0 silencioso.

#### 4.2.3 `loadEvents` — ❌ MAYOR (M3)

[narrative/service.ts:221-256](src/features/narrative/service.ts:221). Recorre 6 archivos JSON; **cualquier fallo individual** se registra con `console.warn` y se hace `continue`. Solo lanza si `successCount === 0` (todos fallan).

```ts
for (const tipo of EVENT_FILES) {
  try {
    const res = await fetch(`/data/events/${tipo}.json`)
    if (!res.ok) { console.warn(`[narrative] skip ${tipo}.json: HTTP ${res.status}`); continue }
    const raw: unknown = await res.json()
    if (!Array.isArray(raw)) { console.warn(`[narrative] skip ${tipo}.json: expected array`); continue }
    successCount++
    for (const entry of raw) {
      if (validateNarrativeEvent(entry)) events.push(entry)
      else console.warn(`[narrative] invalid event in ${tipo}.json: ...`)
    }
  } catch (err) {
    console.warn(`[narrative] failed to load ${tipo}.json:`, err)
  }
}
if (successCount === 0) throw new Error('[narrative] failed to load any event file')
return events
```

**Por qué viola la regla 9.** Si 5 de 6 archivos cargan y `crisis.json` devuelve 404, la función **devuelve éxito** con un pool incompleto. El `narrativeStore` queda alimentado con un subset, el juego corre, y los eventos de tipo `crisis` sencillamente nunca se disparan. La regla 9 prohíbe "silenciar con try/catch locales que dejan el store en estado inconsistente" — este es exactamente ese caso: el store queda consistente **internamente** (el array es válido), pero **inconsistente respecto al diseño** (faltan categorías enteras).

El docstring ya lo declara explícitamente, pero documentar un comportamiento incorrecto no lo hace correcto.

**Recomendación:** cambiar la firma a `Promise<{ events, missing }>` o emitir un evento `bus.emit('narrative:partial_load', { missing: [...] })` para que `dataStore` propague la advertencia a la UI (banner "Modo limitado: faltan eventos de tipo X" o bloqueo de "Nueva partida" si es crítico).

#### 4.2.4 `saveService.tryParse` / `migrateSave` — ✅ Cumple

[saveService.ts:301-307](src/services/saveService.ts:301). El catch traduce excepción a estado tipado:

```ts
const primary = safeStorage.get(SAVE_KEYS[slot])
if (primary) {
  const parsed = tryParse(primary)
  if (parsed) return { file: parsed, reason: 'ok' }
  console.error(`saveService: slot ${slot} primary corrupt — falling back to backup`)
}
const backup = safeStorage.get(BACKUP_KEYS[slot])
// ... fallback al backup ...
if (parsed) return { file: parsed, reason: 'ok' }
console.error(`saveService: slot ${slot} backup also corrupt`)
return { file: null, reason: 'corrupt' }
```

**Veredicto:** patrón correcto. El catch no silencia: lo convierte en `reason: 'corrupt'`, que el caller usa para decidir UX (cae al backup, marca el slot como dañado, ofrece "reiniciar"). Es lo opuesto a M3.

### 4.3 (C3) `console.warn`/`error` sobre fallos críticos

`grep -rn 'console\.\(warn\|error\)' src/` clasificado:

| Lugar | Veredicto | Justificación |
|---|---|---|
| [ErrorBoundary.tsx:23](src/components/ErrorBoundary.tsx:23) | ✅ aceptable | `console.error` con stack **además** del fallback UI. El error está visible al usuario. |
| [narrative/service.ts:229,234,243,247](src/features/narrative/service.ts:229) | ❌ MAYOR (M3) | Cuatro `console.warn` que ocultan: HTTP no-OK, payload no-array, evento individual inválido, throw de fetch. Crítico porque el caller no distingue "1500 eventos cargados completos" de "500 eventos porque tres archivos fallaron". |
| [dataService.ts:458-462](src/services/dataService.ts:458) | ❌ MAYOR (M4) | Detalle abajo. |
| [saveService.ts:301-307](src/services/saveService.ts:301) | ✅ aceptable | `console.error` acompaña a `reason: 'corrupt'`, no lo sustituye. |

#### M4 — `preloadAll` (detalle)

```ts
// dataService.ts:448-463
export async function preloadAll(): Promise<void> {
  const paths = [
    ...EVENT_TYPES.map(t => EVENT_PATHS[t]),
    '/data/judges.json',
    '/data/installations.json',
    '/data/competitions.json',
    '/data/music_library.json',
  ]
  const results = await Promise.allSettled(paths.map(path => load(path)))
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`dataService: ${paths[i]} no disponible — funcionalidad limitada`)
    }
  })
}
```

`preloadAll` devuelve `Promise<void>`: cualquier `rejected` en `allSettled` se loguea como warning y se descarta. El `dataStore` que la invoca hace `set({ loaded: true })` **sin distinguir** éxito completo de degradado:

```ts
// (dataStore aprox.)
await preloadAll()
set({ loaded: true }, false, 'data/loaded')
```

**Impacto.** En Fase 1 los archivos load-bearing son: `judges.json` (panel de jueces de la competición), `competitions.json` (calendario ISU), `installations.json` (8 instalaciones × 4 niveles del club). Si cualquiera falla, el splash dice "datos cargados", el jugador entra al juego, y el primer hub semanal explota cuando intenta resolver el calendario o pintar la competición. La carga **mintió**.

**Recomendación.**

```ts
export async function preloadAll(): Promise<{ failed: string[] }> {
  const results = await Promise.allSettled(/* ... */)
  const failed: string[] = []
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`dataService: ${paths[i]} no disponible`)
      failed.push(paths[i])
    }
  })
  return { failed }
}

// dataStore
const { failed } = await preloadAll()
const status: 'ok' | 'degraded' | 'failed' =
  failed.length === 0 ? 'ok'
  : failed.some(isLoadBearing) ? 'failed'
  : 'degraded'
set({ loaded: status !== 'failed', status, failed }, false, 'data/loaded')
```

La pantalla de splash puede entonces mostrar el banner adecuado y, si `status === 'failed'`, bloquear el botón de "Nueva partida".

---

## 5. Cierre

La capa de plataforma de Fase 1 es **estructuralmente correcta**: la disciplina de no usar React en el motor, la separación engine puro / worker / wrapper main-thread, el bus tipado y el `ErrorBoundary` raíz son patrones sólidos sobre los que se puede construir. Los **cuatro hallazgos MAYORES** son todos de robustez operativa, no de arquitectura, y se concentran en dos puntos: el wrapper main-thread del worker (M1, M2) y el bootstrap de datos (M3, M4). Cerrar los cuatro antes de Fase 4 deja la plataforma lista para añadirle reactividad cross-feature (cuando empiecen a aterrizar los listeners) sin sobresaltos. El bus dormido es un activo, no un problema: mantenerlo así hasta que haya un consumer real, y al primero acompañarlo de un test de cleanup (m3).
