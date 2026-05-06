# INFORME C2 — Auditoría de persistencia (safeStorage / saves)

| Campo | Valor |
|---|---|
| Fase | 1 (vertical slice endurecido) |
| Auditoría | C2 — Persistencia: `safeStorage`, save slots, hidratación, migraciones, tamaño |
| Fecha | 2026-05-06 |
| Rama auditada | `claude/laughing-blackwell-ebe838` |
| Alcance | `src/utils/safeStorage.ts`, `src/services/saveService.ts`, `src/stores/saveStore.ts`, `src/main.tsx`, `src/App.tsx`, `src/components/ErrorBoundary.tsx`, `src/components/ui/SaveSlotPicker.tsx`, tests asociados |
| Modo | Read-only (no se modificó código) |
| Fuente normativa | CLAUDE.md §D2 (acceso a storage), §D1 (validación runtime), regla 9 (ErrorBoundary), GDD cap. 19 |

> **Nota metodológica.** Se ejecutó `grep -rn "localStorage" src/` para enumerar todos los accesos al API nativo y se leyeron de extremo a extremo los archivos del wrapper (`safeStorage.ts`), el servicio (`saveService.ts`), el store (`saveStore.ts`), el bootstrap (`main.tsx`, `App.tsx`) y el ErrorBoundary. La estimación de tamaño se calculó sobre los campos de `SaveFile` que crecen con el tiempo, asumiendo una carrera completa de 15 temporadas × 30 semanas. No se midió tamaño real con un save sintético: la cifra es analítica, no empírica.

---

## 1. Resumen ejecutivo

**Estado global:** ✅ Cero violaciones de D2 en código de producción (todo acceso a `localStorage` pasa por `safeStorage`). ✅ Bootstrap no asume `available === true`. ✅ ErrorBoundary raíz cumple regla 9. ✅ La cadena de hidratación real (`load → tryParse → migrateSave`) valida cada entidad con los validadores de §D1. ✅ Los 3 slots están aislados (claves separadas + backup por slot). ⚠️ **Dos puntos preventivos para release**: no hay router de migraciones encadenadas y el tamaño estimado de save (~380 KB/slot) es seguro hoy pero crece con `generatedEvents` (Fase 6) — habrá que migrar a IndexedDB antes de Steam.

| Nº | Sev. | Hallazgo |
|---|---|---|
| **M1** | ⚠️ MAYOR (release) | Tamaño estimado por slot ~380 KB hoy → con Claude API generando eventos largos en Fase 6 puede acercarse al límite localStorage (~5 MB para 3 slots + backups). Plan: migrar a IndexedDB en Fase 5 antes de Fase 6. |
| **m1** | 🟡 MENOR (preventivo) | `migrateSave` rechaza con throw cualquier `saveVersion !== 1` ([saveService.ts:362](src/services/saveService.ts:362)). No existe un router `migrate(save, fromVersion, toVersion)` con cadena `1→2→3...`. CRÍTICO en cuanto se introduzca v2 (Steam release). |
| **m2** | 🟡 MENOR (doc) | CLAUDE.md §D2 menciona `getItem/setItem/removeItem` como nombres del API; el código real expone `get/set/remove`. Conviene alinear texto. |
| **m3** | 🟡 MENOR (preventivo) | `getMetadata` ([saveService.ts:289-310](src/services/saveService.ts:289)) acepta cualquier `number` para `semanaActual` y `temporadaNumero` sin validar rango (1-30 / 1+). No es riesgo de seguridad (datos solo se muestran en el slot picker), pero podría exhibir metadata aberrante. La carga real sí valida. |
| **m4** | 🟡 MENOR (Fase 6) | `saveStore.saveGame` ([saveStore.ts:68, 70](src/stores/saveStore.ts:68)) hardcodea `dialogueHistory: []` y `generatedEvents: []` en lugar de leerlos del `narrativeStore`. Coherente hoy (esos campos llegan en Fase 6) pero el `SaveFile` ya tiene los slots — se perderían datos por olvido cuando exista la fuente. |
| **m5** | 🟡 MENOR (test gap) | No hay test explícito que verifique aislamiento entre slots: corromper slot 1 (primary + backup) y comprobar que `getMetadata(2)`/`load(2)` siguen OK. Hoy se prueba implícitamente vía tests por slot, no de forma directa. |
| i1 | 🔵 INFO | Único acceso real a `window.localStorage`: dentro de `safeStorage.ts` ([:21-23, :38, :47, :57](src/utils/safeStorage.ts:21)). Cero violaciones de D2 en producción. |
| i2 | 🔵 INFO | `available` se calcula UNA vez en init mediante probe write→read→remove ([safeStorage.ts:17-30](src/utils/safeStorage.ts:17)). Captura SSR, Safari privado, cookies bloqueadas, quota. |
| i3 | 🔵 INFO | `migrateSave` ([saveService.ts:360-457](src/services/saveService.ts:360)) valida cada entidad persistida con los validadores de §D1: skater, coach, club, season, rivalsPool, decisionHistory, narrativeFlags, dialogueHistory (per-line), emittedEvents (per-string), generatedEvents (per-event), confirmedPrograms (per-program). |
| i4 | 🔵 INFO | Cada slot tiene 2 claves: `glace_save_X` (primary) + `glace_save_X_bak` (backup). Si primary corrupto, `load` cae al backup ([saveService.ts:265-283](src/services/saveService.ts:265)). Cubierto por tests ([saveService.test.ts:51-78](src/services/saveService.test.ts:51)). |
| i5 | 🔵 INFO | Banner "Modo sin guardado" en [SaveSlotPicker.tsx:82](src/components/ui/SaveSlotPicker.tsx:82) condicionado a `useSaveStore.storageAvailable`. Cumple §D2. |
| i6 | 🔵 INFO | `ErrorBoundary` montado en raíz ([App.tsx:8](src/App.tsx:8)) con `getDerivedStateFromError` + `componentDidCatch` + recovery `bypass changeState`. Cumple regla 9. |

**Conclusión:** cero hallazgos CRÍTICOS. La arquitectura de persistencia de Fase 0/1 es sólida y cumple D1, D2, D3 y la regla 9. Todos los puntos abiertos son preventivos para Fase 5/6 y publicación en Steam.

---

## 2. `localStorage` directo (tarea 1)

`grep -rn "localStorage" src/` arroja 24 ocurrencias. Clasificación:

### 2.1 Accesos al API nativo dentro de producción

| Archivo:línea | Contexto | Veredicto |
|---|---|---|
| [src/utils/safeStorage.ts:21](src/utils/safeStorage.ts:21) | `window.localStorage.setItem(PROBE_KEY, '1')` (probe en `detect()`) | ✅ wrapper |
| [src/utils/safeStorage.ts:22](src/utils/safeStorage.ts:22) | `window.localStorage.getItem(PROBE_KEY)` (probe) | ✅ wrapper |
| [src/utils/safeStorage.ts:23](src/utils/safeStorage.ts:23) | `window.localStorage.removeItem(PROBE_KEY)` (probe) | ✅ wrapper |
| [src/utils/safeStorage.ts:38](src/utils/safeStorage.ts:38) | `return window.localStorage.getItem(key)` | ✅ wrapper |
| [src/utils/safeStorage.ts:47](src/utils/safeStorage.ts:47) | `window.localStorage.setItem(key, value)` | ✅ wrapper |
| [src/utils/safeStorage.ts:57](src/utils/safeStorage.ts:57) | `window.localStorage.removeItem(key)` | ✅ wrapper |

**Cero accesos directos fuera del wrapper en producción.** §D2 cumplido.

### 2.2 Accesos en infraestructura de tests (aceptables)

| Archivo:línea | Contexto |
|---|---|
| [src/test/setup.ts:19, :22, :28](src/test/setup.ts:19) | Stub global de `localStorage` para Vitest (Node 22 no lo expone por defecto) |
| [src/utils/safeStorage.test.ts:10](src/utils/safeStorage.test.ts:10) | `window.localStorage.clear()` en setup |
| [src/services/saveService.test.ts:31, :53, :61, :64, :72, :111, :153, :160-161](src/services/saveService.test.ts:31) | Tests inyectan corrupción directamente (necesario para probar fallback a backup) |

Aceptable: ningún test es código de producción y la regla §D2 aplica al runtime de la app.

### 2.3 Strings y comentarios (no son accesos)

[SaveSlotPicker.tsx:82, :175, :184](src/components/ui/SaveSlotPicker.tsx:82), [MainMenu.tsx:81](src/pages/MainMenu.tsx:81): textos visibles al usuario. [saveStore.ts:29](src/stores/saveStore.ts:29), [saveService.ts:39](src/services/saveService.ts:39): comentarios de documentación.

**Veredicto tarea 1:** ✅ Sin hallazgo.

---

## 3. API de `safeStorage` (tarea 2)

Firma real ([safeStorage.ts:7-13](src/utils/safeStorage.ts:7)):

```ts
interface SafeStorage {
  readonly available: boolean
  get:    (key: string) => string | null
  set:    (key: string, value: string) => boolean
  remove: (key: string) => void
}
```

| Método | Comportamiento cuando `!available` | Comportamiento ante throw |
|---|---|---|
| `get(key)` | retorna `null` ([:36](src/utils/safeStorage.ts:36)) | `try/catch` retorna `null` ([:39-41](src/utils/safeStorage.ts:39)) |
| `set(key, value)` | retorna `false` ([:45](src/utils/safeStorage.ts:45)) | `try/catch` retorna `false` ([:49-51](src/utils/safeStorage.ts:49)) |
| `remove(key)` | retorna `void` ([:55](src/utils/safeStorage.ts:55)) | `try/catch` ignora silenciosamente ([:58-60](src/utils/safeStorage.ts:58)) |

`detect()` ([safeStorage.ts:17-28](src/utils/safeStorage.ts:17)) hace probe write→read→remove dentro de un `try/catch` que cubre:
- `typeof window === 'undefined'` (SSR / Web Worker accidental)
- `!window.localStorage` (navegadores muy antiguos)
- Throws nativos: Safari privado pre-2022, cookies bloqueadas, iframes restrictivos, quota exhausted al inicializar.

**Veredicto tarea 2:** ✅ API funcional cumple §D2. ⚠️ **m2**: el enunciado de la auditoría y la sección §D2 de CLAUDE.md hablan de `getItem/setItem/removeItem` (nombres nativos del DOM Storage API). El código real usa `get/set/remove`. Es una discrepancia documental, no técnica. Recomendación: actualizar §D2 para que mencione los nombres reales.

---

## 4. Bootstrap (tarea 3)

### 4.1 Orden de arranque

[main.tsx:15-16](src/main.tsx:15) ejecuta antes de `ReactDOM.createRoot`:

```ts
useSaveStore.getState().loadSlotMetadata()
useGameStore.getState().changeState(GameState.MAIN_MENU)
```

Ninguno asume `safeStorage.available === true`:

- `loadSlotMetadata()` ([saveStore.ts:50-56](src/stores/saveStore.ts:50)) llama `getMetadata(slot)` para cada slot 1/2/3.
- `getMetadata` ([saveService.ts:290](src/services/saveService.ts:290)) bloquea con `if (!safeStorage.available) return null` ANTES de tocar storage. La acción `save/loadSlotMetadata` deja `slots: { 1: null, 2: null, 3: null }`, idéntico al estado inicial. No hay throw.
- El estado `storageAvailable` del store se inicializa con el valor real de `safeStorage.available` ([saveStore.ts:46](src/stores/saveStore.ts:46)).

### 4.2 Banner "Modo sin guardado"

Presente en [SaveSlotPicker.tsx:82](src/components/ui/SaveSlotPicker.tsx:82):

```tsx
{!storageAvailable && (
  <div className="...">
    Modo sin guardado: el navegador bloquea localStorage. Las partidas no se conservarán entre sesiones.
  </div>
)}
```

Y referenciado en [MainMenu.tsx:81](src/pages/MainMenu.tsx:81). Cumple la exigencia explícita de §D2 ("la UI consulta `useSaveStore.storageAvailable` para mostrar un banner").

### 4.3 ErrorBoundary

[App.tsx:5-15](src/App.tsx:5) envuelve `<PageTransition><Outlet /></PageTransition>` con `<ErrorBoundary>`. Cualquier throw del bootstrap (incluyendo el que pudiera surgir de un `loadSlotMetadata` futuro mal manejado) cae en el fallback en lugar de blanquear la app. Detalle del componente en §9.

**Veredicto tarea 3:** ✅ Sin hallazgo.

---

## 5. Hidratación (tarea 4)

### 5.1 Cadena real al cargar un slot

El usuario pulsa "Cargar" en `SaveSlotPicker` → `useSaveStore.loadGame(slot)` ([saveStore.ts:86-111](src/stores/saveStore.ts:86)) → `load(slot)` del servicio ([saveService.ts:265-283](src/services/saveService.ts:265)):

```
safeStorage.get(SAVE_KEYS[slot])         ← null si !available o key no existe
  → tryParse(raw)                         ← saveService.ts:206-214
    → JSON.parse(raw)                     ← throw atrapado por tryParse
    → migrateSave(data)                   ← saveService.ts:360-457
      → isSaveFile(data)                  ← rechaza si saveVersion !== 1
      → validateSkaterData                ← throw si fuera de rango
      → validateCoachData                 ← idem
      → validateClubData                  ← idem
      → validateSeasonData                ← idem
      → validateRivalsPool                ← idem
      → validateDecisionHistory           ← per-elemento (D1.1)
      → validateNarrativeFlags            ← per-clave
      → validateDialogueLine.every        ← per-línea (D1.1)
      → validateNarrativeEvent.every      ← per-evento (D1.1)
      → validateConfirmedPrograms         ← per-programa con validateProgramData
      → return SaveFile completo
  → si throw: return null
  → fallback: safeStorage.get(BACKUP_KEYS[slot]) → tryParse → si OK reason='ok'
  → si ambos fallan: reason='corrupt'
```

Si `load()` devuelve `file: SaveFile`, `loadGame` hidrata los stores ([saveStore.ts:93-109](src/stores/saveStore.ts:93)):

- `useGameStore.setState({...})` con skater/coach/club/season **ya validados** por `migrateSave`.
- `useProgramStore.hydrateConfirmedPrograms(file.confirmedPrograms)` — datos pre-validados.
- `useRivalsStore.hydratePool(file.rivalsPool)` — pre-validado.
- `useNarrativeStore.hydrateFromSave({ narrativeFlags, emittedEvents, decisionHistory })` — pre-validados.

**No hay paso saltado en el camino real de carga.** Todo dato persistido pasa por su `validateXxxData` antes de llegar a un store. Cumple §D1.

### 5.2 Camino ligero: `getMetadata`

[`getMetadata`](src/services/saveService.ts:289-310) NO invoca `migrateSave`. Solo extrae 4 campos:

```ts
{
  fechaGuardado:   string,
  semanaActual:    number,    // del season.semanaActual
  temporadaNumero: number,    // del season.temporadaNumero
  nombrePatinador: string,    // del skater.name
}
```

Guards mínimos ([:296](src/services/saveService.ts:296)): `saveVersion === 1 && typeof fechaGuardado === 'string'`. **No valida rangos** de `semanaActual` (debería ser 1-30) ni `temporadaNumero` (debería ser ≥1).

**Hallazgo m3 (MENOR):** un JSON parcialmente corrupto que pase los guards mínimos podría devolver metadata con `semanaActual: 999` o números negativos. Se mostraría texto raro en el slot picker, pero no compromete la carga real (que sí valida). Por diseño, `getMetadata` está pensada para ser barata (no rehacer toda la validación). Suficiente con añadir guards `isIntegerInRange(season['semanaActual'], 1, 30)` antes del retorno.

### 5.3 Snapshot al guardar — campos hardcodeados

[saveStore.ts:67-73](src/stores/saveStore.ts:67):

```ts
const snapshot: GameStateSnapshot = {
  // ...
  dialogueHistory: [],          // ← hardcoded
  emittedEvents:   ns.emittedEvents,
  generatedEvents: [],          // ← hardcoded
  // ...
}
```

`dialogueHistory` y `generatedEvents` se guardan siempre vacíos. **Hallazgo m4 (MENOR, Fase 6):** coherente con el estado actual (esos campos llegan en Fase 6 con Claude API), pero el `SaveFile` ya tiene los slots y los validadores per-elemento existen. Conviene añadir un comentario `// TODO Fase 6` en las líneas hardcoded o conectarlos al store cuando exista la fuente, para no perder datos por olvido.

**Veredicto tarea 4:** ✅ Camino real OK. ⚠️ m3, m4 anotados.

---

## 6. Save slots (tarea 5)

### 6.1 Estructura

| Aspecto | Implementación |
|---|---|
| Tipo del store | `slots: Record<1\|2\|3, SaveMetadata \| null>` ([saveStore.ts:32](src/stores/saveStore.ts:32)) |
| Claves localStorage | `glace_save_{1,2,3}` + `glace_save_{1,2,3}_bak` ([saveService.ts:27-37](src/services/saveService.ts:27)) |
| Metadata por slot | 4 campos extraídos sin `migrateSave` ([saveService.ts:289-310](src/services/saveService.ts:289)) |

### 6.2 Carga independiente

✅ Sí. Cada `getMetadata(slot)` y `load(slot)` opera exclusivamente sobre `SAVE_KEYS[slot]` / `BACKUP_KEYS[slot]`. No hay "metadata global" compartida.

### 6.3 Aislamiento de corrupción

✅ Sí. Cubierto por:

- [saveService.test.ts:51-69](src/services/saveService.test.ts:51): "fallback a backup cuando primary está corrupt" → corrompe `glace_save_1` y verifica que `load(1)` devuelve el backup.
- [saveService.test.ts:71-78](src/services/saveService.test.ts:71): "ambos primary+backup corrupto → reason: 'corrupt'" → confirma que `load` retorna `{ file: null, reason: 'corrupt' }` sin propagar throw.

**Hallazgo m5 (MENOR):** no hay test explícito que corrompa slot 1 (primary + backup) y verifique que `getMetadata(2)` y `load(2)` siguen funcionando. Es trivialmente cierto por construcción (claves separadas), pero un test directo aporta documentación viva del invariante. Sugerencia, no bloqueante.

### 6.4 Slot picker ligero

✅ `getMetadata` no carga la partida completa: extrae 4 campos primitivos sin reconstruir entidades ni invocar validadores pesados. Arranque rápido garantizado. Comentario explícito en [saveService.ts:286-288](src/services/saveService.ts:286) ("returns only the four metadata fields without full save validation").

**Veredicto tarea 5:** ✅ Sin hallazgo bloqueante. m5 anotado como sugerencia.

---

## 7. Migraciones (tarea 6)

### 7.1 Estado actual

`SaveFile.saveVersion` está tipado como **literal `1`** ([saveService.ts:55](src/services/saveService.ts:55)), no `number`. `migrateSave`:

- Rechaza con throw cualquier `data.saveVersion !== 1` ([:362](src/services/saveService.ts:362)).
- Hace migración implícita v1 → "current" rellenando defaults para campos opcionales nuevos (líneas 395-455). Esto cubre el caso "save de Fase 0 sin campo X" sin error.

Comentario del autor ([:354-358](src/services/saveService.ts:354)): *"extend this function to handle format migrations when saveVersion increases"*.

### 7.2 Carencias

❌ No hay router `migrate(save, fromVersion, toVersion)` con cadena de transformaciones `1→2→3...`. Cuando se introduzca v2:

- O se refactoriza `migrateSave` para aceptar versiones encadenadas (cambio mayor en la firma y los tests asociados).
- O se duplica el cuerpo de la función con un `switch` por versión (deuda técnica).

❌ El tipo `saveVersion: 1` no admite v2 sin cambio del propio tipo. Cualquier futura versión obliga a relajar el tipo a `1 | 2` o un `number` genérico.

### 7.3 Severidad

**Hallazgo m1 (MENOR ahora, CRÍTICO antes de Steam release):** un cambio de schema sin sistema de migraciones invalida los saves de jugadores que actualicen el cliente. En Fase 1 esto no afecta a nadie (la única versión es v1). En Fase 5+ —y especialmente al publicar en Steam— cada release que rompa schema sin migración perderá partidas.

**Recomendación:** en Fase 5, antes de Fase 6:

1. Cambiar `saveVersion: 1` por `saveVersion: number` en `SaveFile`.
2. Introducir `MIGRATIONS: Record<number, (save: any) => any>` en `saveService.ts`.
3. Reescribir `migrateSave` como `applyMigrations(data, data.saveVersion, CURRENT_VERSION)` con cadena `1→2→3`.
4. Documentar el patrón en CLAUDE.md.

---

## 8. Tamaño de save (tarea 7)

### 8.1 Estimación analítica

Para una carrera completa (15 temporadas × 30 semanas = 450 semanas), por slot:

| Campo | Estimado | Cálculo |
|---|---|---|
| `decisionHistory` | ~135 KB | 5-8 decisiones/semana × 450 semanas × ~300 B/decisión |
| `historialSemanas` | ~90 KB | 30 semanas × 15 temporadas × ~200 B/semana |
| `dialogueHistory` (Fase 6) | ~67 KB | 1-2 líneas/semana × 450 × ~150 B |
| `resultadosTemporada` | ~45 KB | 3 competiciones/temporada × 15 × ~3 KB |
| `generatedEvents` (Fase 6) | ~22 KB | 3-5 eventos/temporada × 15 × ~1.5 KB |
| `confirmedPrograms` | ~3 KB | 2 programas/temporada × 15 × ~500 B |
| `rivalsPool` | ~5 KB | Generado 1× por temporada |
| `narrativeFlags`, `emittedEvents` | ~2 KB | 30-50 flags + ~15 eventos |
| Resto (skater, coach, club, season metadata) | ~10 KB | Estático |
| **Total por slot** | **~380 KB** | |

3 slots × (primary + backup) = 6 archivos = **~2,3 MB**.

### 8.2 Comparación con límites

| Umbral | Valor | Estado |
|---|---|---|
| `SIZE_WARN_BYTES` ([saveService.ts:40](src/services/saveService.ts:40)) | 4 MB | Margen confortable hoy |
| Límite localStorage típico | ~5 MB por origen | Dentro del margen |
| Quotas estrictas (Safari iOS, modo privado) | 2-3 MB en algunos casos | Riesgo en escenarios extremos con 3 slots intensivos |

### 8.3 Riesgo de Fase 6

`generatedEvents` (Claude API) podría inflarse si:

- Cada evento generado mide 1-3 KB de descripción + opciones.
- Un jugador alcanza 50+ eventos generados por temporada.
- 50 ev/temp × 15 temp × 2 KB = **1.5 MB solo en generatedEvents**.

Combinado con el resto, un slot podría acercarse a 2 MB. 3 slots ocupados × 2 (backup) = 12 MB, **muy por encima del límite localStorage**.

### 8.4 Hallazgo M1 (MAYOR de cara a release)

Recomendación: planificar migración a **IndexedDB** en Fase 5 (arquitectura de persistencia), antes de Fase 6 (Claude API), no después.

Ventajas:

- Sin límite duro (~50% del disco en navegadores modernos).
- Carga parcial por clave (no hay que parsear el save completo para mostrar metadata).
- Soporta blobs/binarios de forma nativa.

Implementación recomendada: mantener la API actual de `safeStorage` (`get/set/remove/available`) y crear un wrapper `safeIDB` con la misma firma para que el blast radius del cambio sea solo el contenido de `saveService.ts` (no los stores ni la UI).

---

## 9. ErrorBoundary (tarea 8)

[ErrorBoundary.tsx:15-62](src/components/ErrorBoundary.tsx:15) cumple regla 9 de CLAUDE.md:

| Aspecto | Implementación |
|---|---|
| `getDerivedStateFromError` | ✅ ([:18-20](src/components/ErrorBoundary.tsx:18)) |
| `componentDidCatch` | ✅ con `console.error` + componentStack ([:22-24](src/components/ErrorBoundary.tsx:22)) |
| Fallback UI | ✅ ([:36-58](src/components/ErrorBoundary.tsx:36)) con mensaje "Algo ha salido mal" |
| Recovery sin re-throw | ✅ `handleReturnToMenu` hace `setState` directo bypass `changeState` ([:26-34](src/components/ErrorBoundary.tsx:26)) |
| Mensaje de error en dev | ✅ condicionado a `import.meta.env.DEV` ([:45-49](src/components/ErrorBoundary.tsx:45)) |
| Montaje en raíz | ✅ [App.tsx:8](src/App.tsx:8) envuelve toda la app |

Cualquier throw inesperado (incluyendo errores de transición ilegal del state machine, errores de hidratación que se escapen al fallback de `tryParse`, etc.) cae aquí en lugar de blanquear la app. El comentario en [:12-14](src/components/ErrorBoundary.tsx:12) documenta la decisión de bypass.

**Veredicto tarea 8:** ✅ Sin hallazgo.

---

## 10. Cumplimiento de CLAUDE.md

| Sección | Cumplimiento |
|---|---|
| §D1 (validación runtime en frontera) | ✅ `migrateSave` valida cada entidad. §D1.1 (per-elemento) cubierto en `dialogueHistory`, `emittedEvents`, `generatedEvents`, `decisionHistory`, `confirmedPrograms`, `narrativeFlags`. |
| §D2 (acceso a storage) | ✅ Cero accesos directos a `localStorage` en producción. ⚠️ Discrepancia documental (m2). |
| §D3 (atomicidad cross-store) | ✅ `loadGame` hidrata 4 stores en serie pero el flujo es de inicialización (no de bucle de juego), aceptable. La auditoría C1 cubre los casos sensibles del bucle semanal. |
| §D5 (tests con Vitest) | ✅ Suites: `saveService.test.ts` (150+ líneas), `safeStorage.test.ts` (32), `validators.test.ts` (130+). m5 anota un test sugerido. |
| Regla 9 (ErrorBoundary raíz) | ✅ Montado en `App.tsx`, recovery seguro. |

---

## 11. Acciones recomendadas (fuera del alcance de este informe)

1. **m2 — alinear documentación**: actualizar CLAUDE.md §D2 para que mencione `get/set/remove` en lugar de `getItem/setItem/removeItem`.
2. **m3 — endurecer `getMetadata`**: añadir `isIntegerInRange(season['semanaActual'], 1, 30)` y `isInteger(season['temporadaNumero']) && temporadaNumero >= 1` antes del retorno.
3. **m4 — comentario en hardcoded**: añadir `// pendiente Fase 6` en [saveStore.ts:68, 70](src/stores/saveStore.ts:68) o conectar al `narrativeStore` cuando exista la fuente.
4. **m5 — test de aislamiento**: añadir caso en `saveService.test.ts` que corrompe slot 1 (primary + backup) y verifica que `getMetadata(2)` y `load(2)` siguen OK.
5. **m1 — router de migraciones (Fase 5)**: refactorizar `migrateSave` para aceptar versiones encadenadas. Cambiar `saveVersion: 1` por `saveVersion: number` en `SaveFile`. Introducir `MIGRATIONS` map.
6. **M1 — IndexedDB (Fase 5)**: planificar wrapper `safeIDB` con misma firma que `safeStorage` y migrar `saveService.ts` antes de Fase 6 (Claude API). Conservar `safeStorage` para preferencias ligeras (idioma, opciones de UI).

---

## 12. Conclusión

Cero hallazgos CRÍTICOS. La persistencia de Fase 0/1 es robusta:

- Wrapper `safeStorage` impecable y único punto de acceso.
- Validación runtime per-elemento en toda la frontera de hidratación.
- Slots aislados con backup automático.
- ErrorBoundary raíz correctamente integrado.

Los puntos abiertos son **preventivos**: alinear documentación (m2), endurecer `getMetadata` (m3), conectar campos hardcoded en Fase 6 (m4), añadir test de aislamiento (m5), introducir router de migraciones antes de v2 (m1) y migrar a IndexedDB antes de Fase 6 / Steam (M1). Ninguno bloquea el cierre de Fase 1.
