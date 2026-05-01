# INFORME A2 — Auditoría de Tipado TypeScript

| Campo | Valor |
|---|---|
| Fase | 1 (vertical slice endurecido) |
| Auditoría | A2 — Tipado estático y validación runtime |
| Fecha | 2026-05-01 |
| Rama auditada | `claude/quirky-ptolemy-07dd70` |
| Commit base | `b5e909d` |
| Alcance | Todo `src/` + `tsconfig.*` |
| Modo | Read-only (no se modificó código) |
| Fuente normativa | [CLAUDE.md](../../CLAUDE.md) — sección "Normas de código" + "Patrones D1/D2" |

---

## 1. Resumen ejecutivo

| Severidad | Cantidad | Bloqueante para Fase 1 |
|---|---|---|
| 🔴 CRÍTICO | 1 | sí — `npm run type-check` falla |
| 🟠 MAYOR | 4 | no, pero rompen el patrón D1 |
| 🟡 MENOR | 3 | no |
| ✅ OK | — | — |

| Bloque | Estado |
|---|---|
| `tsconfig` strict + opciones derivadas | ✅ mayormente — falta `noUncheckedIndexedAccess` (MENOR) |
| `npm run type-check` | 🔴 **3 errores** en `economy/service.test.ts` |
| Casts `as` en `src/` | ✅ todos clasificados como legítimos (152 ocurrencias) |
| `: any` / `<any>` / `as any` | ✅ 0 ocurrencias |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | ✅ 0 ocurrencias |
| 11 validadores `validateXxxData` | 🟠 2 sin rangos completos + 1 entidad sin validador |
| Persistencia: `safeStorage` + `JSON.parse` | 🟠 4 campos de `SaveFile` se hidratan sin validación per-element |

**Acciones sugeridas (fuera del alcance, no se ejecutan):**

1. 🔴 Arreglar el literal `Sponsor` en `economy/service.test.ts` añadiendo `tipo` y `semanasRestantes` (3 ocurrencias) — o crear un helper `makeSponsor()` que rellene los campos por defecto.
2. 🟠 Endurecer `validateProgramData`: validar rangos numéricos y recorrer `elementos[]`.
3. 🟠 Añadir validación per-elemento para `dialogueHistory`, `emittedEvents`, `narrativeFlags` y especialmente `generatedEvents` en `migrateSave` — los eventos generados por Claude deben pasar por `validateNarrativeEvent`.
4. 🟠 Crear `validateSponsor` y enchufarlo dentro de `validateClubData`.
5. 🟡 Activar `"noUncheckedIndexedAccess": true` en `tsconfig.app.json`.

---

## 2. Configuración del compilador

### 2.1. Estado actual

[tsconfig.app.json](../../tsconfig.app.json) (proyecto principal):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

### 2.2. Comprobación punto a punto

| Flag pedido | Estado | Evidencia |
|---|---|---|
| `strict: true` | ✅ | línea 22 |
| `noImplicitAny` | ✅ implícito por `strict` | TS docs |
| `noUncheckedIndexedAccess` | ❌ ausente | — |
| `exactOptionalPropertyTypes` | ✅ | línea 26 (mejor que pedido) |

Adicionales detectados (todos positivos): `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`.

### 2.3. Hallazgo MENOR — falta `noUncheckedIndexedAccess`

**Justificación de activarlo:**

La base usa intensamente `Record<string, X>` y acceso indexado dentro de los validadores (`data['campo']`). Sin `noUncheckedIndexedAccess`, TypeScript trata `data['campo']` como `unknown` (vía la firma del Record), pero un `record[clave]` típico devuelve `X` aunque la clave no exista.

Activarlo:

- Forzaría a tratar cada lectura indexada como `X | undefined`.
- Detectaría accesos como `arr[arr.length - 1]` (que pueden ser undefined si arr está vacío) — varios sitios en `saveService.ts:303-305` (`resultados[resultados.length - 1]`) y `pages.smoke.test.tsx`.
- Afianzaría aún más los validadores: `(data['x'] as number) < 0` se convertiría en error si `data['x']` no fuera primero estrechado.

Activación recomendada en una pasada futura, no ahora — primero hay que limpiar el type-check (sección 3).

---

## 3. `npm run type-check`

### 3.1. Comando y salida

```bash
npm run type-check 2>&1
```

```
> glace@0.1.0 type-check
> tsc --noEmit -p tsconfig.app.json

src/features/economy/service.test.ts(275,11): error TS2739: Type '{ id: string; nombre: string; ingresoSemanal: number; metricasExigidas: {}; }' is missing the following properties from type 'Sponsor': tipo, semanasRestantes
src/features/economy/service.test.ts(286,11): error TS2739: Type '{ id: string; nombre: string; ingresoSemanal: number; metricasExigidas: {}; }' is missing the following properties from type 'Sponsor': tipo, semanasRestantes
src/features/economy/service.test.ts(287,11): error TS2739: Type '{ id: string; nombre: string; ingresoSemanal: number; metricasExigidas: {}; }' is missing the following properties from type 'Sponsor': tipo, semanasRestantes
```

**Exit code: 2** (proceso falló).

### 3.2. Hallazgo CRÍTICO — type-check rompe

El tipo `Sponsor` ([src/types/club.ts:69-78](../../src/types/club.ts:69)) tiene 6 campos obligatorios:

```typescript
export interface Sponsor {
  id:               string
  nombre:           string
  tipo:             SponsorType
  ingresoSemanal:   number
  metricasExigidas: SponsorMetrics
  semanasRestantes: number
}
```

Los tres literales en [src/features/economy/service.test.ts:275,286,287](../../src/features/economy/service.test.ts:275) sólo declaran 4 (`id`, `nombre`, `ingresoSemanal`, `metricasExigidas`):

```typescript
// línea 275
const sponsor: Sponsor = {
  id: 'sp', nombre: 'Test', ingresoSemanal: 200,
  metricasExigidas: {},
}
// líneas 286-287
const a: Sponsor = { id: 'a', nombre: 'Acme', ingresoSemanal: 300, metricasExigidas: {} }
const b: Sponsor = { id: 'b', nombre: 'Beta', ingresoSemanal: 150, metricasExigidas: {} }
```

**Causa probable:** el campo `semanasRestantes` (y posiblemente `tipo`) se añadió a `Sponsor` después de escribir el test. El test pasaba antes de la ampliación del tipo.

**Severidad:** CRÍTICO — `npm run build` ejecuta `tsc -b` antes del bundle de Vite, así que esto bloquea release y CI.

**Fix sugerido (no se aplica):** añadir los dos campos a los tres literales o introducir un helper:

```typescript
function makeSponsor(over: Partial<Sponsor> = {}): Sponsor {
  return {
    id: 'sp', nombre: 'Test', tipo: 'tecnologia',
    ingresoSemanal: 200, metricasExigidas: {}, semanasRestantes: 30,
    ...over,
  }
}
```

---

## 4. Auditoría de `as`

### 4.1. Métricas

Comando: `grep -rn ' as ' src/ --include='*.ts' --include='*.tsx'`.

| Métrica | Valor |
|---|---|
| Total ocurrencias `as ` | 156 (incluye comentarios) |
| Ocurrencias en código real | 152 |
| Ocurrencias en comentarios | 4 (descartadas) |
| Casts sospechosos (cast de `unknown`/`any` a tipo de dominio fuera de validador) | **0** |

### 4.2. Distribución por categoría

| Categoría | Cantidad aprox | Veredicto |
|---|---|---|
| `as const` (tuplas/literales) | 38 | ✅ legítimo |
| `as unknown as X` (corruption-test fixture) | 6 | ✅ legítimo (sólo en tests) |
| Cast dentro de `validateXxxData` para estrechar `data['campo']` tras `isInteger`/`isPlainObject` | 12 | ✅ legítimo (ya validado por la línea anterior) |
| Narrowing de literal-union sobre `e.target.value`, `Number()`, datos controlados | ~15 | ✅ legítimo |
| `Object.keys(x) as Array<keyof X>` / `Object.entries(x) as [K, V][]` | 8 | ✅ legítimo |
| `as Record<string, unknown>` para acceder a campos opcionales sobre input ya pasado por `isPlainObject` | 6 | ✅ legítimo |
| Brand de scope (`self as DedicatedWorkerGlobalScope`) | 1 | ✅ legítimo |
| Brand de import JSON (`skatersRaw as SkaterProfile[]`, `traitsRaw as TraitData[]`) | 2 | 🟡 ver §4.4 (MENOR) |
| Cast post-validador en `migrateSave` (`skater as SkaterData` después de `validateSkaterData(skater)`) | 5 | ✅ legítimo |
| Cast en `WorkerLike` y `event.data` del worker (`as SimulationResult`, `as ProgramScore`, `as ElementOutcome[]`) | 4 | ✅ legítimo (mensaje del propio worker) |
| Casos triviales (`null as NarrativeEvent | null`, `outcome as MomentOutcome`, etc.) | ~12 | ✅ legítimo |
| Resto: `as 1|2|3|4`, `as ActivityId`, `as JumpType`, `as ElementType`, `as TraitId`, `as RivalTier`, etc. (narrowing de literal-union local) | ~43 | ✅ legítimo |

**Casts sospechosos (cast directo de `unknown`/`any` a tipo de dominio fuera de validador): 0.**

### 4.3. Casos investigados específicamente

| # | Archivo:línea | Snippet | Veredicto |
|---|---|---|---|
| 1 | [src/services/saveService.ts:165](../../src/services/saveService.ts:165) | `out[skaterId] = list as ProgramData[]` | ✅ Legítimo. La línea 161 ejecuta `if (!list.every(validateProgramData)) throw …`. El cast viene **después** de la validación. |
| 2 | [src/services/saveService.ts:266](../../src/services/saveService.ts:266) | `const d = JSON.parse(raw) as Record<string, unknown>` | ✅ Legítimo (`getMetadata`). Se usa solo para extraer 4 campos cosméticos de UI y cada uno se vuelve a chequear con `typeof`. No alimenta ningún store. |
| 3 | [src/services/saveService.ts:380-389](../../src/services/saveService.ts:380) | `skater as SkaterData | null`, etc. | ✅ Legítimo para los **4 entidades validadas** (skater, coach, club, season). 🟠 No legítimo para `dialogueHistory`/`emittedEvents`/`narrativeFlags`/`generatedEvents` — ver §6.3. |
| 4 | [src/features/competition/service.ts:42,81,82](../../src/features/competition/service.ts:42) | `data.result as SimulationResult`, `data.score as ProgramScore`, `data.elements as ElementOutcome[]` | ✅ Legítimo. La fuente es el propio worker (`competitionWorker.ts`), código bajo control del proyecto, no input externo. |
| 5 | [src/services/dataService.ts:371](../../src/services/dataService.ts:371) | `return data as MusicLibraryEntry[]` | ✅ Legítimo. La línea 369 ejecuta `if (!data.every(isMusicLibraryEntry)) return null`. Validación per-element previa. |
| 6 | [src/services/prospectService.ts:62](../../src/services/prospectService.ts:62) | `(skatersRaw as SkaterProfile[]).filter(...)` | 🟡 Ver §4.4. JSON bundleado en build, no entra por `fetch`. |
| 7 | [src/services/dataService.ts:337](../../src/services/dataService.ts:337) | `const TRAITS_STATIC = traitsRaw as TraitData[]` | 🟡 Mismo patrón que el anterior. JSON bundleado. |

### 4.4. Hallazgo MENOR — JSON bundleado sin validador

[src/services/prospectService.ts:62](../../src/services/prospectService.ts:62) y [src/services/dataService.ts:337](../../src/services/dataService.ts:337) confían en imports JSON estáticos:

```typescript
import skatersRaw from '@/data/skaters.json'
const SKATERS_STATIC = (skatersRaw as SkaterProfile[]).filter(...)
```

D1 dice "todo dato que entra desde `localStorage`, `fetch('/data/...')` o una llamada a API externa…". El JSON bundleado en build no encaja literalmente — es código compilado, no un payload runtime. **No es violación estricta**, pero:

- Si en el futuro estos datasets pasan a `/public/data/*.json` (cargados con `fetch`), el cast quedará obsoleto y se perderá la garantía.
- Para `traits` y `skaters` no existe `validateTraitData` / `validateSkaterProfile`, así que aunque alguien convirtiera la fuente a `fetch`, no habría adónde pasar el payload.

**Acción sugerida:** documentar la asunción ("JSON bundleado, sin validación runtime — válido sólo mientras la fuente sea import compile-time") o crear validadores ligeros para que el cast pueda tornarse en una llamada `validate*` el día que la fuente cambie.

---

## 5. `: any`, `<any>`, `as any`

Comando: `grep -rn ': any\|<any>\|as any' src/ --include='*.ts' --include='*.tsx'`.

**Resultado:** 1 ocurrencia, todas en comentarios:

```
src/features/program/service.ts:427: * Never throws: any failure surfaces as fallback fields (...)
```

✅ **0 ocurrencias en código real.**

---

## 6. `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`

Comando: `grep -rn "@ts-ignore\|@ts-expect-error\|@ts-nocheck" src/ --include='*.ts' --include='*.tsx'`.

**Resultado:** 0 ocurrencias. ✅

---

## 7. Validadores `validateXxxData` — tabla principal

### 7.1. Inventario y cobertura de rangos

| # | Validador | Archivo:línea | Type predicate `value is X`? | Forma | Rangos | Rangos cubiertos / faltantes | Veredicto |
|---|---|---|---|---|---|---|---|
| 1 | `validateSkaterData` | [src/types/skater.ts:924](../../src/types/skater.ts:924) | ✅ | ✅ | ✅ | `age` 0-120; `technical` 0-100; `psychological` unit 0-100; `presionCompetitiva` -100..100; `physical.techos/historial/velocidad` 0-100; `weeklyState` (vínculo/fatiga/estrés) 0-100; `semanasEntrenadas ≥ 0`; `currentInjury.{injuredAtWeek,recoveryWeeks*}` ≥ 0; `severity ∈ {leve,moderada,grave}` | ✅ **OK** |
| 2 | `validateProgramData` | [src/types/program.ts:123](../../src/types/program.ts:123) | ✅ | parcial | ❌ | sólo `typeof === 'number'` para `temporada`, `densidadEmocional`, `coreografoNivel`, `tesProyectado`, `pcsProyectado`. **No** itera `elementos[]`. **No** valida `tipo ∈ {corto, libre}`. **No** valida `coreografoNivel ∈ 1..5`. **No** valida `densidadEmocional ∈ 0..1`. | 🟠 **MAYOR — ver §7.3** |
| 3 | `validateClubData` | [src/types/club.ts:162](../../src/types/club.ts:162) | ✅ | ✅ | parcial | `presupuestoReservas` finito ✅; `instalaciones[].nivel` 0-4 ✅; `reputacion.*` 0-100 ✅ (5 ejes); **NO valida sponsors[] per-elemento** (sólo `Array.isArray`). | 🟠 **MAYOR — ver §7.4** |
| 4 | `validateCoachData` | [src/types/coach.ts:133](../../src/types/coach.ts:133) | ✅ | ✅ | ✅ | `temporadasCompletadas ≥ 0`; `perfilInferido.rama*` 0-1; **invariante de suma `≈ 1.0` con tolerancia 0.01** ✅; `legadoTotal.patinadorFormados ≥ 0`; `reputacion.*` 0-100 (5 ejes) | ✅ **OK** |
| 5 | `validateSeasonData` | [src/types/season.ts:242](../../src/types/season.ts:242) | ✅ | ✅ | ✅ | `semanaActual` 1-30; `temporadaNumero ≥ 1`; calendario/resultadosTemporada/historialSemanas como arrays | ✅ OK (no recorre los arrays — los entries no se persisten directamente, ver §7.5) |
| 6 | `validateCompetitionResult` | [src/types/season.ts:259](../../src/types/season.ts:259) | ✅ | ✅ | ✅ | `id` no vacío; `semana` 1-30; `tes`/`pcs`/`total`/`deducciones` finitos; `posicion ≥ 1`; `caidas ≥ 0`; `pcsDetalle.{sk,tr,pe,co,in}` finitos | ✅ OK (no se valida 0-10 PCS-component, pero el engine clampa internamente) |
| 7 | `validateRivalsPool` (+ `validateRival`) | [src/features/rivals/validation.ts](../../src/features/rivals/validation.ts) | ✅ | ✅ | ✅ | `seasonNumber ≥ 1`; rival: `id` y `nombre` no vacíos; `edad` 10-50; `tier ∈ {1,2,3,4,5}`; `technical` 0-100 (4 atributos); `psychological` 0-100 + `presionCompetitiva` -100..100; `difficultyBudget.{corto,libre}` finitos y ≥ 0 | ✅ **OK** |
| 8 | `validateDecisionHistory` (+ `validateDecisionRecord`) | [src/features/narrative/validation.ts](../../src/features/narrative/validation.ts) | ✅ | ✅ | ✅ | `season ≥ 1`; `week` 1-30; `eventTipo ∈ VALID_TYPES`; resto son strings y arrays de strings | ✅ **OK** |
| 9 | `validateNarrativeEvent` (+ `validateConditions`, `validateOption`, `validateOptionEffect`) | [src/features/narrative/service.ts:185](../../src/features/narrative/service.ts:185) | ✅ | ✅ | ✅ | `tipo ∈ VALID_TYPES`; `min/maxVinculo`, `min/maxEstres` 0-100; `temporadaMinima ≥ 1`; severidad ∈ {leve,moderada,grave}; `momentTimeoutSeconds` 1-60; `vinculoDelta`/`estresDelta`/`fatigueDelta`/`bondDelta` -100..100; `probabilidadMutacion` 0-1; `goeDeltaCurrent` -1..1; `goeDeltaRemaining` -0.3..0.3; `varianzaMultiplier` 0.5..2.0 | ✅ **OK** (el más completo del repo) |
| 10 | `validateMusicLibrary` (+ `isMusicLibraryEntry`) | [src/services/dataService.ts:367](../../src/services/dataService.ts:367) | ❌ devuelve `MusicLibraryEntry[] | null` (no es predicate) | ✅ | parcial | `duracionSegundos > 0`; resto strings | 🟡 **MENOR — devuelve `T[] | null` en vez de predicate; pierde un nivel de tipado pero funcionalmente correcto** |
| 11 | `validateConfirmedPrograms` | [src/services/saveService.ts:150](../../src/services/saveService.ts:150) | ❌ devuelve `Record<string, ProgramData[]>` y **lanza** en vez de predicate | depende de #2 | hereda gap de #2 | recorre el record y aplica `validateProgramData`. Su debilidad es heredada — al ser `validateProgramData` débil, esto también lo es. | 🟠 **MAYOR (heredado) — ver §7.3** |

### 7.2. Validadores faltantes (entidades persistidas sin validador propio)

| Entidad | ¿Persistida? | ¿Tiene validador? |
|---|---|---|
| `Sponsor` | sí (dentro de `ClubData.sponsors`) | ❌ **falta** |
| `Installation` | sí (dentro de `ClubData.instalaciones`) | parcial — sólo se valida `nivel` 0-4 |
| `DialogueLine` | sí (`SaveFile.dialogueHistory`) | ❌ **falta** |
| `NarrativeEvent` (en `SaveFile.generatedEvents`) | sí | existe (`validateNarrativeEvent`) **pero `migrateSave` no lo invoca por elemento** |
| `narrativeFlags` | sí | ❌ no se valida que los valores sean `boolean | number | string` |
| `emittedEvents` | sí | ❌ no se valida que los elementos sean strings |
| `ProgramElement` | sí (dentro de `ProgramData.elementos`) | ❌ `validateProgramData` no recorre el array |

### 7.3. Hallazgo MAYOR — `validateProgramData` no valida rangos ni recorre `elementos[]`

[src/types/program.ts:123-140](../../src/types/program.ts:123):

```typescript
export function validateProgramData(data: unknown): data is ProgramData {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false
  const d = data as Record<string, unknown>

  if (typeof d['id'] !== 'string') return false
  if (typeof d['skaterId'] !== 'string') return false
  if (typeof d['temporada'] !== 'number') return false
  if (typeof d['tipo'] !== 'string') return false
  if (typeof d['musicaGenero'] !== 'string') return false
  if (typeof d['musicaTempo'] !== 'string') return false
  if (typeof d['densidadEmocional'] !== 'number') return false
  if (!Array.isArray(d['elementos'])) return false
  if (typeof d['coreografoNivel'] !== 'number') return false
  if (typeof d['tesProyectado'] !== 'number') return false
  if (typeof d['pcsProyectado'] !== 'number') return false

  return true
}
```

**Lo que NO se valida:**

- `temporada` puede ser negativa, 0, NaN, Infinity.
- `tipo` no se restringe a `'corto' | 'libre'`.
- `densidadEmocional` no se acota (el código de `engine` asume 0..1 normalmente).
- `coreografoNivel` no se acota a `1..5`.
- `tesProyectado` y `pcsProyectado` pueden ser negativos o NaN — el engine asume ≥ 0.
- `elementos[]` no se recorre. Cualquier basura dentro pasa.

**Impacto:** un save corrupto con `coreografoNivel: 999`, `densidadEmocional: -50` o `elementos: [{...basura}]` se carga sin queja, y el motor de competición lo procesa. Posibles NaN en TES/PCS.

**Fix sugerido:** alinear con el patrón de `validateSkaterData` (usar `isInRange`, `isIntegerInRange` y un `validateProgramElement` interno):

```typescript
// pseudo
if (!isIntegerInRange(d['temporada'], 1, 99)) return false
if (d['tipo'] !== 'corto' && d['tipo'] !== 'libre') return false
if (!isInRange(d['densidadEmocional'], 0, 1)) return false
if (!isIntegerInRange(d['coreografoNivel'], 1, 5)) return false
if (!isNonNegative(d['tesProyectado'])) return false
if (!isNonNegative(d['pcsProyectado'])) return false
if (!d['elementos'].every(validateProgramElement)) return false
```

### 7.4. Hallazgo MAYOR — `validateClubData` no valida `sponsors[]` per-elemento

[src/types/club.ts:175](../../src/types/club.ts:175):

```typescript
if (!Array.isArray(data['sponsors'])) return false
```

`Sponsor` requiere 6 campos (incluido `tipo` ∈ `SponsorType` y `semanasRestantes ≥ 0` finitos), pero el array sólo se confirma como array. Cualquier elemento defectuoso (string, null, objeto con campos missing) entra al store.

**Impacto:** `economy/service.ts` itera sponsors para calcular ingresos semanales y revisar contratos vencidos. Si `semanasRestantes` no es número, el cálculo falla silenciosamente o produce NaN en la caja del club.

**Fix sugerido:** introducir `validateSponsor` (sale gratis dado que ya hay `SponsorType` y `SponsorMetrics`):

```typescript
// nuevo en club.ts
const VALID_SPONSOR_TYPES: ReadonlySet<string> = new Set([
  'equipamiento', 'indumentaria', 'medios', 'institucional', 'tecnologia',
])

export function validateSponsor(v: unknown): v is Sponsor {
  if (!isPlainObject(v)) return false
  if (typeof v['id'] !== 'string' || v['id'].length === 0) return false
  if (typeof v['nombre'] !== 'string') return false
  if (typeof v['tipo'] !== 'string' || !VALID_SPONSOR_TYPES.has(v['tipo'])) return false
  if (!isNonNegative(v['ingresoSemanal'])) return false
  if (!isNonNegative(v['semanasRestantes'])) return false
  if (!isPlainObject(v['metricasExigidas'])) return false
  // metricasExigidas tiene todos campos opcionales — comprobar finitud cuando estén
  return true
}

// y dentro de validateClubData:
if (!data['sponsors'].every(validateSponsor)) return false
```

### 7.5. Notas sobre `validateSeasonData`

La función no recorre `calendario`, `resultadosTemporada` ni `historialSemanas`. Sin embargo:

- `calendario` se rellena al inicio de la temporada por código bajo control del proyecto, no entra desde fuera.
- `resultadosTemporada` se hidrata desde el save: cada entry **debería** pasar `validateCompetitionResult` per-elemento. Hoy no se hace en `migrateSave` ni dentro del propio validador. **Hallazgo MENOR** (ver §7.6).
- `historialSemanas` (WeekSummary) — mismo análisis.

### 7.6. Hallazgo MENOR — `validateSeasonData` no recorre arrays de la temporada

`resultadosTemporada` puede crecer hasta cientos de entradas a lo largo de 15 temporadas. Si una entry está corrupta (típico tras un upgrade de save format), entra al store y revienta cuando el `Diario`/`Calendario` la pinta.

**Fix sugerido:** dentro de `validateSeasonData`, añadir:

```typescript
if (!data['resultadosTemporada'].every(validateCompetitionResult)) return false
// y un validateWeekSummary análogo si se decide endurecer
```

---

## 8. Persistencia: `safeStorage` + `JSON.parse` → validador

### 8.1. Inventario

Comando: `grep -rn "safeStorage\|JSON\.parse" src/ --include='*.ts' --include='*.tsx' | grep -v ".test."`.

| Archivo:línea | Operación | Validación posterior |
|---|---|---|
| [src/utils/safeStorage.ts:38](../../src/utils/safeStorage.ts:38) | `localStorage.getItem` interno | n/a (es la implementación de `safeStorage`) |
| [src/stores/saveStore.ts:46](../../src/stores/saveStore.ts:46) | `safeStorage.available` (booleano) | n/a |
| [src/services/saveService.ts:179](../../src/services/saveService.ts:179) | `JSON.parse(raw)` dentro de `tryParse` | ✅ inmediatamente pasa por `migrateSave(data)` que valida los 4 entidades principales. |
| [src/services/saveService.ts:221,239,245,263,286-288](../../src/services/saveService.ts:221) | `safeStorage.get/set/remove` para slots y backups | flujo `get → tryParse → migrateSave → validate*Data` ✅ |
| [src/services/saveService.ts:266](../../src/services/saveService.ts:266) | `JSON.parse(raw) as Record<string, unknown>` dentro de `getMetadata` | ✅ aceptable (sólo extrae 4 campos cosméticos para UI; verifica typeof por campo y nunca alimenta un store) |

**Veredicto general:** ✅ todos los puntos de entrada pasan por validador antes de entrar a un store.

### 8.2. Hallazgo MAYOR — `migrateSave` no valida 4 campos del SaveFile

[src/services/saveService.ts:384-389](../../src/services/saveService.ts:384):

```typescript
narrativeFlags:  (typeof d['narrativeFlags'] === 'object' && d['narrativeFlags'] !== null
  ? d['narrativeFlags'] as Record<string, boolean | number | string>
  : {}),
dialogueHistory: Array.isArray(d['dialogueHistory']) ? (d['dialogueHistory'] as DialogueLine[])   : [],
emittedEvents:   Array.isArray(d['emittedEvents'])   ? (d['emittedEvents']   as string[])         : [],
generatedEvents: Array.isArray(d['generatedEvents']) ? (d['generatedEvents'] as NarrativeEvent[]) : [],
```

Cada uno usa un cast desnudo después de un check superficial:

| Campo | Check | Falta validar |
|---|---|---|
| `narrativeFlags` | `typeof === 'object'` y no null | que cada **valor** sea `boolean | number | string` (no anidado, no arrays) |
| `dialogueHistory` | `Array.isArray` | per-elemento: `semana` (1-30), `temporada` (≥ 1), `speakerId` no vacío, `text` string |
| `emittedEvents` | `Array.isArray` | que cada elemento sea string |
| `generatedEvents` | `Array.isArray` | per-elemento: **debe pasar `validateNarrativeEvent`**. Estos cuerpos **vienen de Claude API** (Fase 6); si la generación o el caché se corrompen, se acepta basura. |

**Severidad MAYOR:** rompe el patrón D1 ("todo dato que entra desde `localStorage` … debe pasar por un `validateXxxData`"). Los casts después de `Array.isArray` son justo el patrón que D1 prohíbe (`as` para saltarse validación).

**Fix sugerido en `migrateSave`:**

```typescript
// generatedEvents — el más crítico (origen Claude API)
let generatedEvents: NarrativeEvent[] = []
if (Array.isArray(d['generatedEvents'])) {
  if (!d['generatedEvents'].every(validateNarrativeEvent)) {
    throw new Error('migrateSave: generatedEvents contiene un evento inválido')
  }
  generatedEvents = d['generatedEvents']
}

// dialogueHistory — crear validateDialogueLine
function validateDialogueLine(v: unknown): v is DialogueLine {
  if (!isPlainObject(v)) return false
  if (!isIntegerInRange(v['semana'], 1, 30)) return false
  if (!isInteger(v['temporada']) || v['temporada'] < 1) return false
  if (typeof v['speakerId'] !== 'string' || v['speakerId'].length === 0) return false
  if (typeof v['text'] !== 'string') return false
  return true
}

// emittedEvents y narrativeFlags análogamente
```

> Nota: hoy `saveStore.saveGame` siempre pasa `dialogueHistory: []` y `generatedEvents: []` (líneas 68 y 70), por lo que el riesgo está latente — sólo se materializa cuando alguien escriba a esos campos en una fase futura. Aun así, **el patrón D1 obliga a validar la entrada, no a confiar en que el origen es de fiar**.

---

## 9. Conclusión

El repositorio cumple **el espíritu** del tipado estricto del CLAUDE.md, pero presenta **un fallo crítico** que rompe `npm run type-check` y **cuatro brechas mayores** en validación runtime que dejan persistencia parcialmente protegida.

| Bloque | Score |
|---|---|
| `tsconfig` strict + opciones | 4/5 (falta `noUncheckedIndexedAccess`) |
| `npm run type-check` | 0/1 (falla) |
| Casts `as` | 5/5 (todos legítimos) |
| `any`/`@ts-*` | 5/5 (cero) |
| Validadores con rangos | 9/11 (`validateProgramData` débil + `validateClubData` no valida sponsors) |
| Persistencia → validador | 4/5 (`migrateSave` no valida 4 campos del SaveFile) |

**Bloqueante para Fase 1:** SÍ — el type-check rojo impide build y CI. Los 4 hallazgos MAYOR son endurecimiento del patrón D1; deberían cerrarse antes de integrar Claude API en Fase 6 (los `generatedEvents` sin validación serán entonces un agujero de seguridad real, no teórico).

**Riesgo a futuro:**

- Cuando Fase 6 active la generación de eventos vía Claude API, `migrateSave.generatedEvents` será el **vector más explotable** del save format. La validación per-elemento debe estar antes de esa integración.
- Cuando se materialice el sistema económico completo (Fase 2/3, sponsors operando dinámicamente), la falta de `validateSponsor` causará bugs silenciosos de NaN si un save se desincroniza.
