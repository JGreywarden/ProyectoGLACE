# INFORME A1 — Auditoría de Reglas de Dependencia

| Campo | Valor |
|---|---|
| Fase | 1 (vertical slice endurecido) |
| Auditoría | A1 — Reglas de dependencia |
| Fecha | 2026-05-01 |
| Rama auditada | `claude/interesting-perlman-9a13d2` |
| Commit base | `284ca43` |
| Alcance | Todo `src/` |
| Modo | Read-only (no se modificó código) |
| Fuente normativa | [CLAUDE.md](../../CLAUDE.md) — sección "Regla de dependencias" |

---

## 1. Resumen ejecutivo

**Estado global:** ✅ mayormente conforme. **2 violaciones reales** (regla R4) + **1 observación** sobre el worker + **1 matiz documental** sobre la regla R5.

| Regla | Estado | Detalle |
|---|---|---|
| R1 — `pages`/`components` no son importados por capas inferiores | ✅ Cumplida | 0 imports inversos |
| R2 — `features/*/service.ts` no importa React | ✅ Cumplida | 7/7 services limpios |
| R3 — `utils/` no importa código del proyecto | ✅ Cumplida | 2/2 archivos sin imports al proyecto |
| R4 — Imports cross-feature solo vía barrel `index.ts` | ⚠️ **2 violaciones** | Rutas internas en `program/service.ts` y `saveService.test.ts` |
| R5 — Motor de competición delega lógica al worker | ✅ Cumplida con matiz | Lógica pura en `engine.ts`; worker delega; merece actualizar texto del CLAUDE.md |
| R6 — Cada feature expone barrel `index.ts` | ✅ Cumplida | 12/12 features con barrel |

**Acciones sugeridas (fuera de esta tarea):**
1. Cambiar 2 imports de ruta interna a barrel (cambios de 1 línea cada uno).
2. Aclarar en `CLAUDE.md` que "el motor de competición vive como módulo puro en `features/competition/engine.ts` y el worker lo invoca off-main-thread"; el texto actual sugiere que la lógica vive físicamente en `workers/`.
3. Decidir política explícita para imports `workers/ → features/`: la regla R4 habla de imports **entre features** y `workers/` no es feature, pero se importa una ruta interna.

---

## 2. Resultado por regla

### R1 — `pages/` y `components/` importan de `features/`/`stores/`, nunca al revés

**Estado:** ✅ CUMPLIDA.

Comando reproducible:

```bash
grep -rn "from ['\"]@/pages\|from ['\"]@/components" \
  src/features/ src/stores/ src/services/ src/lib/ src/hooks/ 2>/dev/null
```

Resultado: **vacío**. Ningún archivo de las capas internas importa `@/pages/...` ni `@/components/...`.

---

### R2 — `features/*/service.ts` no importa React

**Estado:** ✅ CUMPLIDA.

Services analizados (7): `athlete/service.ts`, `competition/service.ts`, `economy/service.ts`, `narrative/service.ts`, `program/service.ts`, `rivals/service.ts`, `training/service.ts`.

Comando reproducible:

```bash
grep -rn "from ['\"]react\|from ['\"]react-dom\|from ['\"]@/components\|from ['\"]@/pages" \
  src/features/*/service.ts
```

Resultado: **vacío**. Ningún `service.ts` importa React, react-dom, componentes ni páginas.

> Nota: `program/service.ts` toca `AudioContext` runtime dentro de `extractMusicInfo`, comentado en el propio archivo. Eso no es React/DOM-rendering ni quebranta la regla.

---

### R3 — `utils/` no importa de ningún otro módulo del proyecto

**Estado:** ✅ CUMPLIDA.

| Archivo | Imports | Veredicto |
|---|---|---|
| [src/utils/validation.ts](../../src/utils/validation.ts) | (ninguno) | ✅ |
| [src/utils/safeStorage.ts](../../src/utils/safeStorage.ts) | (ninguno) | ✅ |
| [src/utils/validation.test.ts](../../src/utils/validation.test.ts) | `vitest` (npm) + `./validation` (relativo propio) | ✅ |
| [src/utils/safeStorage.test.ts](../../src/utils/safeStorage.test.ts) | `vitest` (npm) + `./safeStorage` (relativo propio) | ✅ |

Ningún archivo de `utils/` importa `@/...` (módulos del proyecto).

---

### R4 — Imports cross-feature solo vía barrel `index.ts` del feature destino

**Estado:** ⚠️ **2 violaciones** (rutas internas) + **1 observación** (worker).

Comando reproducible:

```bash
grep -rn "from ['\"]@/features" src/ --include="*.ts" --include="*.tsx" | sort
```

Tabla completa más abajo (sección 3). Las 2 violaciones se detallan en sección 4.

---

### R5 — Motor de competición corre en `workers/`; `features/competition/` solo le envía mensajes

**Estado:** ✅ CUMPLIDA, con matiz documental.

#### Distribución real de la lógica

| Archivo | Líneas | Rol | Contiene lógica TES/PCS pesada |
|---|---|---|---|
| [src/features/competition/engine.ts](../../src/features/competition/engine.ts) | 483 | Módulo puro: `computeGOE`, `computeTESElement`, `computeTES`, `simulateProgramElements`, `computePCSComponent`, `computePCS`, `finalizeProgramScore`, `applyMomentToElements`, `summarizeMomentImpact` | **Sí — aquí vive la lógica** |
| [src/workers/competitionWorker.ts](../../src/workers/competitionWorker.ts) | 85 | Worker: recibe `postMessage`, construye RNG `mulberry32` determinista, delega a `engine`, responde | No (solo orquestación) |
| [src/features/competition/service.ts](../../src/features/competition/service.ts) | 95 | API main-thread: spawnea worker, envuelve `postMessage` en `Promise` | No (solo wrapper) |

#### Matiz

El CLAUDE.md afirma "el motor de competición corre en `workers/` — `features/competition/` solo le envía mensajes". En la práctica:

- La **lógica pura** (sin estado, testeable, reutilizable) vive en `features/competition/engine.ts`.
- El **worker** la invoca off-main-thread (`postMessage` → `engine.simulate*` → `postMessage`).
- El **service main-thread** envuelve el worker en una API basada en Promesas.

Este patrón es mejor que poner toda la lógica dentro del worker:

1. `engine.ts` se testea con Vitest sin necesidad de un worker (`engine.test.ts` existe).
2. `program/service.ts` puede computar puntuaciones de validación de forma síncrona sin pagar el coste de spawnear un worker (importa `engine` directamente).

**Recomendación documental:** actualizar el párrafo del CLAUDE.md para reflejar que el motor (módulo puro) vive en `features/competition/engine.ts`, que `workers/competitionWorker.ts` lo ejecuta off-main-thread, y que `features/competition/service.ts` es la API main-thread basada en `postMessage`. Esto evita ambigüedad en futuras auditorías.

---

### R6 — Cada feature expone barrel `index.ts`

**Estado:** ✅ CUMPLIDA. 12/12 features tienen `index.ts`.

| Feature | `index.ts` | Exports públicos |
|---|---|---|
| athlete | ✅ | `applyBondDecay`, `applyFatigueRecovery`, `computeTraitVisibilityLayer`, `computeVisibleTraits`, `applyAttributeGains`, `rollMutation`, `activityAllowedDuringInjury`, ... |
| calendar | ✅ | (vacío — placeholder) |
| club | ✅ | (vacío — placeholder) |
| coach | ✅ | (vacío — placeholder) |
| competition | ✅ | `runCompetition`, `runProgramSimulation`, `type ProgramSimulation`, `export * from './engine'` |
| economy | ✅ | `computeWeeklyCashFlow`, `applyFinancialPressureSideEffects`, `type CashFlowBreakdown`, `type FinancialPressureState`, ... |
| legacy | ✅ | (vacío — placeholder) |
| narrative | ✅ | tipos (`NarrativeEvent`, `MomentOutcome`, `EventOutcome`, `DecisionRecord`, `NarrativeOption`, `NarrativeEventType`, `MomentoTrigger`), store (`useNarrativeStore`), validators, services |
| program | ✅ | `useProgramStore`, `extractMusicInfo`, `getJumpBaseValue`, `createDefaultProgram`, tipos (`MusicInfo`, `ValidationResult`, `ValidationViolation`) |
| rivals | ✅ | `useRivalsStore`, `generateRivalPool`, `simulateRivalProgram`, `validateRivalsPool`, `COMPETITION_FIELD_SIZE`, tipos |
| scouting | ✅ | (vacío — placeholder) |
| training | ✅ | tipos (`ActivityId`, `Activity`, `TrainingSlot`, `WeekSchedule`, `TensionId`), `ACTIVITY_DEFINITIONS`, `calcGain`, `detectTensions`, `resolveWeekEffects`, `useTrainingStore` |

Las 5 features con barrel vacío (calendar, club, coach, legacy, scouting) son placeholders del scaffolding — el `index.ts` existe con un comentario describiendo el dominio. Cuando ganen contenido público deberán continuar la disciplina.

---

## 3. Tabla resumen — Imports cross-feature

Comando reproducible: `grep -rn "from ['\"]@/features" src/ --include="*.ts" --include="*.tsx" | sort`

### 3.1. Imports en código de producción

| Origen | Línea | Destino | Vía barrel | Veredicto |
|---|---|---|---|---|
| components/ui/ActivitySlot.tsx | 1 | `@/features/training` | sí | ✅ OK |
| components/ui/ISUValidationBanner.tsx | 1 | `@/features/program` | sí | ✅ OK |
| components/ui/MomentOverlay.tsx | 7 | `@/features/narrative` | sí | ✅ OK |
| components/ui/MusicUploader.tsx | 2-3 | `@/features/program` | sí | ✅ OK |
| components/ui/ProgramElementRow.tsx | 2 | `@/features/program` | sí | ✅ OK |
| features/athlete/injury.ts | 16-17 | `@/features/training` | sí | ✅ OK |
| features/competition/engine.ts | 28 | `@/features/narrative` | sí | ✅ OK |
| features/narrative/service.ts | 4 | `@/features/athlete` | sí | ✅ OK |
| **features/program/service.ts** | **13** | **`@/features/competition/engine`** | **NO (ruta interna)** | ⚠️ **VIOLACIÓN R4 #1** |
| pages/CoachCreation.tsx | 8 | `@/features/narrative` | sí | ✅ OK |
| pages/CoachDiary.tsx | 11-12 | `@/features/narrative` | sí | ✅ OK |
| pages/Competition.tsx | 6-11 | `@/features/{competition,narrative}` | sí | ✅ OK |
| pages/DisenadorPrograma.tsx | 6-7 | `@/features/program` | sí | ✅ OK |
| pages/FichaPatinador.tsx | 6 | `@/features/athlete` | sí | ✅ OK |
| pages/NarrativeEvent.tsx | 5-6 | `@/features/narrative` | sí | ✅ OK |
| pages/SeasonEnd.tsx | 6-7 | `@/features/{training,narrative}` | sí | ✅ OK |
| pages/WeekProcessing.tsx | 5-8 | `@/features/{training,narrative,program,rivals}` | sí | ✅ OK |
| pages/WeeklyPlanning.tsx | 11-13 | `@/features/{training,athlete,economy}` | sí | ✅ OK |
| services/saveService.ts | 11-12 | `@/features/{rivals,narrative}` | sí | ✅ OK |
| services/weekService.ts | 5-37 | `@/features/{training,athlete,narrative,competition,rivals,economy}` | sí | ✅ OK |
| stores/gameStore.ts | 8 | `@/features/economy` | sí | ✅ OK |
| stores/saveStore.ts | 4-6 | `@/features/{program,rivals,narrative}` | sí | ✅ OK |
| workers/competitionWorker.ts | 6-12 | `@/features/competition/engine` | NO (ruta interna) | ⚠️ Observación — ver §4.3 |

### 3.2. Imports en tests

| Origen | Línea | Destino | Vía barrel | Veredicto |
|---|---|---|---|---|
| features/athlete/injury.test.ts | 15 | `@/features/training` | sí | ✅ OK |
| features/competition/engine.test.ts | 23 | `@/features/narrative` | sí | ✅ OK |
| pages/pages.smoke.test.tsx | 9-11 | `@/features/{narrative,program,training}` | sí | ✅ OK |
| **services/saveService.test.ts** | **7** | **`@/features/program/service`** | **NO (ruta interna)** | ⚠️ **VIOLACIÓN R4 #2** |
| services/weekService.test.ts | 13-29 | varios (todos por barrel) | sí | ✅ OK |

### 3.3. Métricas

| Métrica | Valor |
|---|---|
| Total imports cross-feature (prod + test) | 28 |
| Imports vía barrel | 25 (89.3%) |
| Imports a ruta interna | 3 (10.7%) — 2 violaciones + 1 observación worker |
| Features con barrel `index.ts` | 12/12 (100%) |
| Features con contenido público | 7/12 (58%) |
| `service.ts` con import a React/DOM/components/pages | 0/7 |
| Archivos en `utils/` con import al proyecto | 0/4 |

---

## 4. Violaciones detalladas

### 4.1. VIOLACIÓN R4 #1 — `program/service.ts` importa ruta interna de `competition`

**Archivo:** [src/features/program/service.ts:5-13](../../src/features/program/service.ts:5)

**Snippet:**

```typescript
import {
  computeTES as engineComputeTES,
  computePCS as engineComputePCS,
  type RNG,
} from '@/features/competition/engine'
```

**Regla incumplida:** R4 — "Imports entre features: solo a través del `index.ts` del otro feature (nunca imports internos cruzados)".

**Análisis:** El barrel [src/features/competition/index.ts](../../src/features/competition/index.ts) re-exporta el engine completo:

```typescript
export { runCompetition, runProgramSimulation, type ProgramSimulation } from './service'
export * from './engine'
```

Por tanto `computeTES`, `computePCS` y `RNG` están disponibles desde `@/features/competition`. La elección de la ruta interna parece pragmática (evitar pasar por una capa) pero contradice la regla literal.

El comentario del propio archivo justifica el **uso síncrono** del engine ("scoring uses the pure engine, never the worker"), lo cual es legítimo y deseable. Solo la ruta del import es incorrecta.

**Fix sugerido (1 línea):**

```diff
- } from '@/features/competition/engine'
+ } from '@/features/competition'
```

**Severidad:** baja (no causa bug; es disciplina arquitectural).

---

### 4.2. VIOLACIÓN R4 #2 — `saveService.test.ts` importa ruta interna de `program`

**Archivo:** [src/services/saveService.test.ts:7](../../src/services/saveService.test.ts:7)

**Snippet:**

```typescript
import { createDefaultProgram } from '@/features/program/service'
```

**Regla incumplida:** R4 — misma regla que 4.1.

**Análisis:** `createDefaultProgram` ya está exportado desde el barrel `program/index.ts`. El test la importa directamente desde `service.ts` sin necesidad.

**Fix sugerido (1 línea):**

```diff
- import { createDefaultProgram } from '@/features/program/service'
+ import { createDefaultProgram } from '@/features/program'
```

**Severidad:** baja (es un test, no afecta runtime).

---

### 4.3. OBSERVACIÓN — `competitionWorker.ts` importa ruta interna de `competition`

**Archivo:** [src/workers/competitionWorker.ts:6-12](../../src/workers/competitionWorker.ts:6)

**Snippet:**

```typescript
import {
  finalizeProgramScore,
  simulate,
  simulateProgramElements,
  type CompetitionContextFlags,
  type SimulationResult,
} from '@/features/competition/engine'
```

**Regla afectada:** R4 habla literalmente de "imports entre **features**". `src/workers/` no es un feature, así que el caso queda en zona gris.

**Análisis:** El comentario del worker es explícito sobre la intención: "all heavy lifting lives in `'@/features/competition/engine'`". Arquitectónicamente el worker actúa como capa de threading del motor (regla R5) y la importación directa al engine es coherente con ese rol.

**Recomendación:** establecer política explícita para imports `workers/ → features/`. Dos opciones razonables:

- **Opción A (estricta):** workers también pasan por barrel. Cambio idéntico al §4.1.
- **Opción B (preferida por simetría):** documentar en CLAUDE.md que `src/workers/<X>Worker.ts` puede importar `src/features/<X>/<archivo-interno>` cuando representa la pareja worker-engine; los demás cruces siguen R4.

**No se cuenta como violación estricta de R4.**

---

## 5. Conclusión

El repositorio cumple la arquitectura feature-first prescrita en [CLAUDE.md](../../CLAUDE.md) con **2 desviaciones menores** (rutas internas de import) y **1 punto de aclaración documental** (rol del worker frente al motor puro). 25/28 imports cross-feature pasan por barrel (89.3%). Ningún `service.ts` arrastra React. `utils/` está aislado. No hay imports inversos `features → pages/components`.

Los dos fixes propuestos en §4.1 y §4.2 son cambios de una sola línea y no requieren modificar APIs públicas (ambos símbolos ya están en los barrels correspondientes).
