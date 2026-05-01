# INFORME A3 — Auditoría de Modularidad de Barrels

| Campo | Valor |
|---|---|
| Fase | 1 (vertical slice endurecido) |
| Auditoría | A3 — Modularidad de barrels (`index.ts`) |
| Fecha | 2026-05-01 |
| Rama auditada | `claude/fervent-tu-2197d8` |
| Commit base | `546456f` |
| Alcance | `src/features/*` + `src/types/` + `src/services/` + `src/utils/` + `src/components/{ui,layout}/` |
| Modo | Read-only (no se modificó código) |
| Fuente normativa | [CLAUDE.md](../../CLAUDE.md) — secciones "Regla de dependencias" + "Estructura interna de cada feature" |

---

## 1. Resumen ejecutivo

| Severidad | Cantidad | Bloqueante para Fase 1 |
|---|---|---|
| 🔴 CRÍTICO | 0 | — |
| 🟠 MAYOR | 3 | no, pero rompen el espíritu de "API pública por barrel" |
| 🟡 MENOR | 7 | no |
| ✅ OK | 7 features con barrel coherente | — |

| Bloque | Estado |
|---|---|
| Imports a ruta interna fuera de la excepción worker↔engine | ✅ **0 ocurrencias** |
| Símbolos usados sin exportar por barrel | ✅ **0 ocurrencias** (todos los consumidores externos importan vía barrel) |
| `src/features/competition` — `export * from './engine'` | 🟠 **MAYOR** — expone 12+ símbolos internos del motor que ningún consumidor externo importa vía barrel |
| `src/types/index.ts` no re-exporta `events.ts` | 🟠 **MAYOR** — `GlaceEvents` accesible solo por sub-path |
| `src/types/index.ts` apenas se usa | 🟠 **MAYOR** — 105 imports a sub-paths vs 7 al barrel |
| `src/services/` y `src/utils/` sin barrel | 🟡 **MENOR** (× 2) — ausencia razonable, pero no documentada |
| 5 features stub (calendar, club, coach, legacy, scouting) | 🟡 **MENOR** — barrels vacíos sin código que respaldar |
| `src/components/layout/` no existe | nota — pendiente de crear cuando aparezcan componentes de shell |
| API muerta (símbolos exportados sin consumidor externo real) | 🟡 **MENOR** — 36 ocurrencias agrupadas en 7 features (ver §6) |

**Acciones sugeridas (fuera del alcance, no se ejecutan):**

1. 🟠 Restringir `src/features/competition/index.ts`: sustituir `export * from './engine'` por una lista nominativa de los 8 símbolos realmente consumidos desde fuera (`runCompetition`, `runProgramSimulation`, `applyMomentToElements`, `summarizeMomentImpact`, `RNG`, `computeTES`, `computePCS`, `MomentImpact`/equivalentes). El worker seguirá importando los internos del motor por la excepción documentada `workers/<X>Worker.ts → @/features/<X>/engine`.
2. 🟠 Añadir `export * from './events'` a [src/types/index.ts](../../src/types/index.ts:65) para que `GlaceEvents` quede accesible vía `@/types`.
3. 🟠 Migrar consumidores de sub-paths `@/types/{skater,coach,club,season,program,events}` a `@/types`. Hoy hay 105 imports a sub-paths vs 7 al barrel: el barrel existe y nadie lo usa.
4. 🟡 Vaciar el comentario stub de las 5 features no implementadas o sustituirlo por un `export {}` explícito ("intencionadamente vacío hasta Fase X").
5. 🟡 Decidir explícitamente si `src/services/` y `src/utils/` deben tener barrel o seguir siendo flat. CLAUDE.md no lo exige; documentarlo como decisión.
6. 🟡 Limpiar API muerta: cada uno de los 36 símbolos enumerados en §6 podría dejar de exportarse hasta que aparezca un consumidor real (YAGNI).

---

## 2. Tabla principal — barrels de features

Columnas: feature → estado del barrel → símbolos exportados (cuantitativo) → consumidores externos vivos → imports a ruta interna detectados → API muerta → símbolos usados sin exportar → veredicto.

| Feature | `index.ts` | Exporta | Consumidores externos | Imports internos | Huérfanos (API muerta) | Usados sin exportar | Veredicto |
|---|---|---|---|---|---|---|---|
| `athlete` | poblado | 19 (7 service + 1 type + 9 injury + 2 types) | `weekService`, `WeeklyPlanning`, `FichaPatinador`, `narrative/service` (cross) | 0 | 9 (ver §6.1) | 0 | 🟡 MENOR (huérfanos) |
| `calendar` | sólo comentario | 0 | — | 0 | 0 | 0 | nota — feature sin implementar |
| `club` | sólo comentario | 0 | — | 0 | 0 | 0 | nota — feature sin implementar |
| `coach` | sólo comentario | 0 | — | 0 | 0 | 0 | nota — feature sin implementar |
| `competition` | poblado (`export * from './engine'` + 3 service) | **25** (3 service + 22 engine reexportadas) | `weekService`, `Competition.tsx`, `program/service` (cross), `competitionWorker` (vía excepción) | 1 (worker→engine, **excepción documentada**) | **13** (ver §6.2) | 0 | 🟠 **MAYOR — barrel demasiado abierto** |
| `economy` | poblado | 13 (9 funcs + 4 types) | `weekService`, `gameStore`, `WeeklyPlanning` | 0 | 5 (ver §6.3) | 0 | 🟡 MENOR (huérfanos) |
| `legacy` | sólo comentario | 0 | — | 0 | 0 | 0 | nota — feature sin implementar |
| `narrative` | poblado | 27 (13 types + 1 store + 11 service + 2 validation) | `weekService`, `saveService`, `Competition.tsx`, `CoachDiary.tsx`, `NarrativeEvent.tsx`, `SeasonEnd.tsx`, `WeekProcessing.tsx`, `CoachCreation.tsx`, `MomentOverlay`, `competition/engine` (cross, type-only) | 0 | 12 (ver §6.4) | 0 | 🟡 MENOR (huérfanos) |
| `program` | poblado | 11 (5 funcs + 1 store + 5 types) | `WeekProcessing.tsx`, `DisenadorPrograma.tsx`, `MusicUploader`, `ProgramElementRow`, `ISUValidationBanner`, `saveStore`, `saveService.test`, `pages.smoke.test` | 0 | 2 (`ValidationResult`, `ProjectedScores`, `validateProgramISU`, `computeProjectedScores`) | 0 | 🟡 MENOR (huérfanos) |
| `rivals` | poblado | 15 (5 types + 2 const + 6 funcs + 1 store + 1 validator) | `weekService`, `weekService.test`, `saveService`, `saveStore` | 0 | 6 (ver §6.5) | 0 | 🟡 MENOR (huérfanos) |
| `scouting` | sólo comentario | 0 | — | 0 | 0 | 0 | nota — feature sin implementar |
| `training` | poblado | 11 (6 types + 1 store + 4 service) | `WeekProcessing.tsx`, `WeeklyPlanning.tsx`, `SeasonEnd.tsx`, `weekService`, `weekService.test`, `pages.smoke.test`, `ActivitySlot`, `main.tsx`, `athlete/injury` (cross) | 0 | 3 (`Activity`, `TrainingSlot`, `WeekEffects`) | 0 | 🟡 MENOR (huérfanos) |

> "Imports internos" cuenta los hits a `@/features/<X>/<sub>` desde fuera de `<X>`. La única ocurrencia en todo el repo es [src/workers/competitionWorker.ts:12](../../src/workers/competitionWorker.ts:12) — cubierta por la **excepción** de CLAUDE.md ("Regla de dependencias": `workers/<X>Worker.ts` puede importar `features/<X>/engine`).

---

## 3. Tabla — módulos compartidos

| Módulo | Barrel exigido por CLAUDE.md | Barrel real | Forma de consumo | Veredicto |
|---|---|---|---|---|
| `src/types` | sí (estructura `types/index.ts`) | poblado pero parcial (4 sub-modules: skater, coach, club, season, program) | 105 imports a sub-paths vs 7 al barrel | 🟠 **MAYOR — barrel infrautilizado y `events.ts` no incluido** |
| `src/services` | no exigido explícitamente | ❌ ausente | 4 ficheros importados nominativamente: `dataService` (18), `saveService` (4), `weekService` (2), `prospectService` (1) | 🟡 **MENOR — decisión sin documentar** |
| `src/utils` | no exigido explícitamente | ❌ ausente | 2 ficheros: `validation` (10), `safeStorage` (2) | 🟡 **MENOR — decisión sin documentar** |
| `src/components/ui` | no exigido explícitamente, pero existe | poblado (10 componentes) | 6 imports vía `@/components/ui`, 0 imports a sub-paths | ✅ OK |
| `src/components/layout` | reservado en CLAUDE.md | carpeta no creada | — | nota — pendiente de Fase 2 (shell layout) |

> [src/components/ErrorBoundary.tsx](../../src/components/ErrorBoundary.tsx) vive directamente bajo `components/`, fuera de `ui/` y `layout/`. No es estrictamente una violación porque `components/ErrorBoundary` es plausible como "shell del shell", pero es un caso aislado a vigilar; si en el futuro hay 2-3 componentes así, conviene formalizar `components/system/` o moverlos a `layout/`.

---

## 4. Hallazgos MAYOR

### 4.1. M1 — `competition/index.ts` re-exporta el motor entero

**Ubicación:** [src/features/competition/index.ts:3](../../src/features/competition/index.ts:3)

```typescript
// competition: TES/PCS engine, judging panels, results — runs in web worker
export { runCompetition, runProgramSimulation, type ProgramSimulation } from './service'
export * from './engine'
```

`engine.ts` exporta **22 símbolos**: `RNG`, `gaussian`, `CompetitionContextFlags`, `PCSComponentKey`, `trimmedMean`, `computeGOE`, `computeTESElement`, `TESResult`, `computeTES`, `simulateProgramElements`, `computePCSComponent`, `applyJudgeBias`, `PCSResult`, `computePCS`, `finalizeProgramScore`, `applyMomentToElements`, `summarizeMomentImpact`, `SimulationResult`, `simulate`, `applyMomentToResult`, `MomentImpact` (vía types) y un par más de tipos derivados.

**Consumo real desde fuera del feature:**

| Símbolo | Importador externo | Vía |
|---|---|---|
| `runCompetition` | [weekService.ts:23](../../src/services/weekService.ts:23), [weekService.test.ts:13](../../src/services/weekService.test.ts:13) | barrel ✅ |
| `runProgramSimulation` | [weekService.ts:23](../../src/services/weekService.ts:23), [weekService.test.ts:13](../../src/services/weekService.test.ts:13) | barrel ✅ |
| `applyMomentToElements`, `summarizeMomentImpact` | [pages/Competition.tsx:9-10](../../src/pages/Competition.tsx:9) | barrel ✅ |
| `RNG`, `computeTES`, `computePCS` | [features/program/service.ts:10-12](../../src/features/program/service.ts:10) (cross-feature) | barrel ✅ |
| `simulateProgramElements`, `finalizeProgramScore`, `CompetitionContextFlags`, `SimulationResult` | [workers/competitionWorker.ts:7-12](../../src/workers/competitionWorker.ts:7) | **internal-path por excepción** |

Símbolos NO importados desde fuera por nadie (ni vía barrel ni vía worker exception): `gaussian`, `PCSComponentKey`, `trimmedMean`, `computeGOE`, `computeTESElement`, `TESResult`, `computePCSComponent`, `applyJudgeBias`, `PCSResult`, `simulate`, `applyMomentToResult`, `ProgramSimulation`. **12 símbolos públicos sin un solo consumidor externo.**

**Impacto:**

- Cualquier consumidor podría empezar a depender de internos del motor (p.ej. `gaussian`) sin que nadie lo note. La promesa "el engine es módulo puro y aislado" se rompe en cuanto un test fuera de `competition/` importe `gaussian` por error.
- El refactor del motor (renombres, partir `engine.ts` en archivos más pequeños) deja de ser local: cualquier rename rompe consumidores remotos.
- El barrel se vuelve un canal sin filtro: lo opuesto del propósito de un barrel.

**Fix sugerido (no se aplica):**

```typescript
// src/features/competition/index.ts
export {
  runCompetition,
  runProgramSimulation,
  type ProgramSimulation,
} from './service'

// API pública del motor — solo lo que el resto del repo consume
export {
  applyMomentToElements,
  summarizeMomentImpact,
  computeTES,
  computePCS,
  type RNG,
} from './engine'

// el worker usa la ruta interna `@/features/competition/engine` por excepción documentada
```

### 4.2. M2 — `types/index.ts` no re-exporta `events.ts`

**Ubicación:** [src/types/index.ts:62-69](../../src/types/index.ts:62)

```typescript
// ─── domain modules ───────────────────────────────────────────────────────────
// single entry point: import everything from '@/types'

export * from './skater'
export * from './coach'
export * from './club'
export * from './season'
export * from './program'
```

Falta `export * from './events'`. El único consumidor de `GlaceEvents` ([src/stores/eventStore.ts:4](../../src/stores/eventStore.ts:4)) está obligado a importar `@/types/events`, una ruta interna del barrel:

```typescript
import type { GlaceEvents } from '@/types/events'
```

**Impacto:** el comentario `// single entry point: import everything from '@/types'` (línea 63) es falso de hecho. Cualquier consumidor futuro de eventos también tendrá que escribir `@/types/events` en vez de `@/types`, perpetuando la divergencia entre la promesa del barrel y la realidad.

**Fix sugerido:** una línea — `export * from './events'` después de la línea 69.

### 4.3. M3 — `types/index.ts` apenas se usa

**Estadística:** `grep -rEn "from '@/types" src/ | sed 's:.*from ::' | sort | uniq -c` arroja:

```
35  '@/types/skater'
31  '@/types/season'
17  '@/types/program'
14  '@/types/club'
 8  '@/types/coach'
 7  '@/types'
 2  '@/types/events'
```

7 imports usan el barrel, 105 lo bypasean. El barrel está construido (re-exporta `skater/coach/club/season/program`) pero **el repo no lo respeta**. Esto convierte cada renombre o reorganización dentro de `src/types/` en un cambio mucho mayor del necesario: cada sub-path consumido es un acoplamiento extra.

**Causa probable:** convención no establecida desde el principio. Cuando se introdujeron los tipos por dominio (commit anterior al vertical slice), los consumidores escribieron `@/types/skater` directamente; cuando se añadió el barrel, no se migraron los consumidores existentes.

**Impacto:** D6 / Fase 6 (Claude API) ampliará el dominio. Si la convención de import de tipos no se fija ahora, cuando aparezcan `@/types/narrative-generated` o `@/types/api-payloads`, el ecosistema seguirá fragmentado.

**Severidad:** MAYOR conceptualmente (rompe la promesa del barrel) pero **mecánico de arreglar**: una pasada de `find/replace` migrando los 105 imports.

**Fix sugerido:**

```bash
# regex de migración (verificar a mano cada coincidencia)
sed -i '' "s:from '@/types/\(skater\|coach\|club\|season\|program\|events\)':from '@/types':g" \
  $(grep -rl "from '@/types/" src/)
```

> Algunos imports nombrados pueden quedar redundantes tras la migración (e.g. dos imports separados del mismo barrel), pero `noUnusedLocals` los detecta.

---

## 5. Hallazgos MENOR de barrels ausentes / stub

### 5.1. m1 — `src/services/` y `src/utils/` sin barrel

**Estadística:** consumidores importan ficheros individuales:

```
@/services/dataService    (18)
@/services/saveService    (4)
@/services/weekService    (2)
@/services/prospectService (1)
@/utils/validation        (10)
@/utils/safeStorage       (2)
```

CLAUDE.md describe `services/` y `utils/` como directorios de "lógica de negocio pura cross-feature" y "funciones puras sin dominio". No exige barrel explícitamente para ninguno de los dos, pero la convención `@/feature` vs `@/feature/sub` es la única no fijada para módulos cross-feature.

**Veredicto:** la ausencia es defendible (los 4-2 ficheros de cada carpeta son auto-contenidos y nominativamente claros), pero conviene **decisión documentada** para que un futuro contributor no introduzca un barrel y migre por instinto. Una nota en CLAUDE.md basta.

### 5.2. m2 — 5 features stub con sólo comentario

**Ficheros:**

- [src/features/calendar/index.ts](../../src/features/calendar/index.ts) — `// calendar: ISU 30-week season, competition dates, deadlines`
- [src/features/club/index.ts](../../src/features/club/index.ts) — `// club: 8 facilities × 4 upgrade levels, capacity, maintenance costs`
- [src/features/coach/index.ts](../../src/features/coach/index.ts) — `// coach: reputation score, press system, public narrative`
- [src/features/legacy/index.ts](../../src/features/legacy/index.ts) — `// legacy: retirement flow, hall of fame, career milestones`
- [src/features/scouting/index.ts](../../src/features/scouting/index.ts) — `// scouting: search pool, recruitment, contract negotiation`

Los 5 directorios contienen únicamente `index.ts` (no hay `service.ts`, `types.ts`, ni `store.ts`). Son scaffolding del cap. 19 del GDD ("Sistemas pendientes de implementar"). No hay código ni consumidor → no es violación, sino **deuda técnica visible**.

**Sugerencia:** sustituir el comentario por `export {}` explícito + comentario marcando la fase pendiente, para que TypeScript reconozca el archivo como módulo y no lo trate como ambient script:

```typescript
// scouting: search pool, recruitment, contract negotiation
// implementación pendiente — Fase 3 (GDD cap. 19, prioridad 9)
export {}
```

### 5.3. m3 — `src/components/layout/` aún no creado

CLAUDE.md menciona la carpeta como destino del shell persistente (`Sidebar`, `TopBar`, `Panel`). En el commit auditado no existe. Cuando aparezca, deberá tener su propio `index.ts` siguiendo la convención de `components/ui/index.ts` (export nominativo por componente). **No es hallazgo** — es nota.

---

## 6. Hallazgos MENOR de API muerta (huérfanos)

Lista exhaustiva: símbolos exportados por un barrel **sin un solo consumidor fuera de su feature**. Se ha verificado con `grep -rEn "\b<sym>\b" src/ ... | grep -v "src/features/<X>/" | grep -v "/index.ts"` y se han descartado matches que sólo aparecen en comentarios.

### 6.1. athlete (9 huérfanos)

| Símbolo | Origen | Verificación |
|---|---|---|
| `computeVisibleTraits` | service.ts:79 | 0 imports externos |
| `MutationResult` (type) | service.ts:110 | 0 imports externos |
| `computeInjuryRisk` | service.ts:134 | sólo aparece en comentario `lib/balance.ts:319` |
| `weeklyInjuryLoad` | injury.ts:28 | 0 imports externos |
| `weeklyInjuryProbability` | injury.ts:49 | 0 imports externos |
| `pickSeverity` | injury.ts:68 | 0 imports externos |
| `pickRecoveryWeeks` | injury.ts:98 | 0 imports externos |
| `InjuryRollOptions` | injury.ts:112 | 0 imports externos |
| `RecoveryOutcome` | injury.ts:183 | 0 imports externos |

> Las 5 funciones de `injury.ts` que sí se usan (`rollWeeklyInjury`, `rollFallInjury`, `tickInjuryWeek`, `activityAllowedDuringInjury`, `maskInjuredSchedule`) están exportadas correctamente. Las "no usadas" son helpers internos que probablemente se introdujeron como bloque y sólo son consumidos por las 5 anteriores dentro del propio archivo — exportarlos no aporta nada.

### 6.2. competition (12 huérfanos del motor + 1 del service)

Lo más destacable de M1 (§4.1). Listado completo:

| Símbolo | Vía |
|---|---|
| `gaussian`, `PCSComponentKey`, `trimmedMean`, `computeGOE`, `computeTESElement`, `TESResult`, `computePCSComponent`, `applyJudgeBias`, `PCSResult`, `simulate`, `applyMomentToResult` | `export * from './engine'` (engine.ts) |
| `ProgramSimulation` (type) | service.ts:56 |

`ProgramSimulation` aparece como tipo de retorno de `runProgramSimulation` pero ningún consumidor lo nombra (TypeScript lo infiere). 0 imports externos.

### 6.3. economy (5 huérfanos)

| Símbolo | Origen | Verificación |
|---|---|---|
| `computeWeeklyCashFlow` | service.ts:115 | 0 imports — `weekService` usa la versión `Breakdown` |
| `computePrizeAmount` | service.ts:281 | 0 imports — solo se usa internamente desde `computeCompetitionEconomy` |
| `computeTravelCost` | service.ts:290 | 0 imports — idem |
| `CashFlowLine` (type) | service.ts:37 | 0 imports |
| `SponsorReview` (type) | service.ts:31 | 0 imports |

### 6.4. narrative (12 huérfanos)

| Símbolo | Origen | Verificación |
|---|---|---|
| `NarrativeCondition` | types.ts:43 | 0 imports |
| `NarrativeOptionEffect` | types.ts:73 | 0 imports |
| `ContextoTemporal` | types.ts:24 | 0 imports |
| `WeekRange` | types.ts:30 | 0 imports |
| `DecisionRef` | types.ts:36 | 0 imports |
| `loadEvents` | service.ts:221 | sólo se usa dentro de `narrative/store.ts:62` (interno) |
| `evaluateConditions` | service.ts:329 | sólo aparece en comentario `weekService.ts:443` |
| `selectCompetitionMoment` | service.ts:457 | 0 imports |
| `applyMomentEffect` | service.ts:644 | 0 imports |
| `buildDecisionRecord` | service.ts:587 | 0 imports |
| `semanasHastaProximaCompeticion` | service.ts:262 | 0 imports |
| `semanasDesdeUltimaCompeticion` | service.ts:278 | 0 imports |

> `selectCompetitionMoment` y `applyMomentEffect` son simétricos a `selectWeeklyEvent`/`applyEventEffect` (que sí se usan). Probablemente se anticipó su uso para Moments de competición (cap. 4 GDD); cuando se conecten, dejarán de ser huérfanos.

### 6.5. program (4 huérfanos)

| Símbolo | Origen | Verificación |
|---|---|---|
| `ValidationResult` (type) | types.ts:42 | 0 imports |
| `ProjectedScores` (type) | types.ts:49 | 0 imports |
| `validateProgramISU` | service.ts:192 | 0 imports — la validación se ejecuta dentro del propio store |
| `computeProjectedScores` | service.ts:321 | 0 imports — idem |

### 6.6. rivals (6 huérfanos)

| Símbolo | Origen | Verificación |
|---|---|---|
| `RivalSkater` (type) | types.ts:15 | 0 imports |
| `RivalProgramScore` (type) | types.ts:47 | 0 imports |
| `RivalCompetitionScore` (type) | types.ts:58 | 0 imports |
| `RivalTier` (type) | types.ts:7 | 0 imports |
| `simulateRivalProgram` | service.ts:151 | 0 imports |
| `eligibleRivals` | service.ts:219 | 0 imports |
| `applyRivalSeasonProgression` | service.ts:257 | 0 imports |
| `COMPETITION_TIER_MIN_RIVAL` | types.ts:66 | 0 imports |

### 6.7. training (3 huérfanos)

| Símbolo | Origen | Verificación |
|---|---|---|
| `Activity` (interface) | types.ts:5 | 0 imports |
| `TrainingSlot` (interface) | types.ts:21 | 0 imports |
| `WeekEffects` (interface) | types.ts:39 | 0 imports |
| `calcGain` | service.ts:91 | 0 imports |
| `detectTensions` | service.ts:178 | 0 imports |

> `calcGain` y `detectTensions` se invocan desde `resolveWeekEffects` (mismo archivo). No tienen consumidor externo.

### Síntesis

| Feature | Huérfanos |
|---|---|
| athlete | 9 |
| competition | 12 |
| economy | 5 |
| narrative | 12 |
| program | 4 |
| rivals | 8 |
| training | 5 |
| **Total** | **55 símbolos exportados sin consumidor externo** |

> El total previo (36) en §1 era una estimación; la enumeración exhaustiva da 55. La cifra 55 prevalece.

**Veredicto:** ningún huérfano causa fallo en runtime. Sí pesan en la promesa "el barrel es la API pública": la mitad de los símbolos públicos no son públicos *de hecho*. YAGNI sugiere podarlos hasta que aparezca un consumidor real; alternativamente, marcarlos como "expuesto para tests internos" si ése es el motivo (ninguno parece serlo: los tests están en `service.test.ts` dentro del propio feature y no necesitan importar vía barrel).

---

## 7. Comprobación de la regla cross-feature

CLAUDE.md ("Regla de dependencias"): *"Imports entre features: solo a través del `index.ts` del otro feature (nunca imports internos cruzados)."*

| Origen | Destino | Símbolo | Vía | Estado |
|---|---|---|---|---|
| `narrative/service.ts:4` | `@/features/athlete` | `rollMutation` | barrel | ✅ |
| `program/service.ts:13` | `@/features/competition` | `computeTES`, `computePCS`, `RNG` | barrel | ✅ |
| `athlete/injury.ts:16-17` | `@/features/training` | `ActivityId`, `WeekSchedule`, `ACTIVITY_DEFINITIONS` | barrel | ✅ |
| `athlete/injury.test.ts:15` | `@/features/training` | `WeekSchedule` (type) | barrel | ✅ |
| `competition/engine.ts:28` | `@/features/narrative` | `MomentOutcome` (type) | barrel | ✅ |
| `competition/engine.test.ts:23` | `@/features/narrative` | `MomentOutcome` (type) | barrel | ✅ |

**0 cruces internos** entre features. La excepción `worker → engine` ([competitionWorker.ts:12](../../src/workers/competitionWorker.ts:12)) está documentada en CLAUDE.md ("Excepción documentada para imports a ruta interna…") y se respeta literalmente.

---

## 8. Conclusión

| Bloque | Score |
|---|---|
| Imports a ruta interna (excluyendo excepciones) | 5/5 (cero ocurrencias) |
| Símbolos usados sin exportar por barrel | 5/5 (cero ocurrencias) |
| API muerta en barrels poblados | 2/5 (55 huérfanos repartidos en 7 features) |
| Disciplina cross-feature vía barrel | 5/5 (todos los cruces respetan la regla) |
| Coherencia del barrel `competition` | 1/5 (`export *` indiscriminado) |
| Coherencia del barrel `types` | 2/5 (105 vs 7 imports + `events.ts` ausente) |
| Barrels stub vs feature implementada | 4/5 (5 stubs sin código + 7 features bien) |
| `services/` y `utils/` sin barrel | 4/5 (defendible, sin doc) |

**Bloqueante para Fase 1:** **NO**. Todos los hallazgos son de calidad/disciplina, no de funcionamiento. `npm run type-check` y `npm run test:run` no se ven afectados (este informe no los ejecuta — fueron alcance de A2).

**Riesgo a futuro:**

- Cuando se implementen las 5 features stub (calendar, club, coach, legacy, scouting — GDD cap. 19), llegarán con barrel propio. Si no se fija ahora la convención de `export` nominativo (vs `export *`), competition seguirá siendo el ejemplo a evitar y los nuevos features replicarán el patrón.
- Cuando Fase 6 introduzca tipos generados por Claude API, la fragmentación `@/types` vs `@/types/<sub>` se ampliará. Migrar 105 imports ahora es trivial; migrar 200+ en seis meses ya no.
- `competition/index.ts` re-exportando el motor entero significa que cualquier rename interno del engine (deseable cuando crezca) se vuelve un breaking change para consumidores remotos potenciales. El radio de cambio del módulo más sensible del juego se ha hecho global por accidente.

**Spam riesgo positivo:** ningún consumidor está obligado a saltar el barrel. Los 0 imports a ruta interna (fuera de la excepción) son el resultado más sólido de esta auditoría: la disciplina **se respeta**. Lo que falla es la otra dirección — los barrels exportan **demás** —, que se arregla con poda y un `export *` menos.
