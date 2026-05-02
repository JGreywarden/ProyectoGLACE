# INFORME B1 — Auditoría del motor de competición ISU

| Campo | Valor |
|---|---|
| Fase | 1 (vertical slice endurecido) |
| Auditoría | B1 — Motor de competición y puntuación ISU |
| Fecha | 2026-05-01 |
| Rama auditada | `claude/flamboyant-wing-18e370` |
| Alcance | `engine.ts`, `competitionWorker.ts`, `service.ts`, `engine.test.ts`, `lib/balance.ts`, datos de jueces |
| Modo | Read-only (no se modificó código) |
| Fuente normativa | `glace_GDD_v2.pdf`, capítulo 5 — Motor de Competición y Puntuación ISU (págs. 12-13) |

---

## 1. Resumen ejecutivo

**Estado global:** ✅ aislamiento, determinismo y mecánica básica TES/PCS bien fundados. **5 hallazgos MAYORES** concentrados en (a) sesgos de juez parcialmente inertes y (b) divergencia entre las fórmulas PCS implementadas y la tabla del GDD.

| Nº | Severidad | Hallazgo |
|---|---|---|
| M1 | ⚠️ MAYOR | `judge.sesgos.tes` no se aplica en la simulación |
| M2 | ⚠️ MAYOR | Penalización post-caída (-12 %) aplicada universalmente en lugar de como sesgo de Anna Müller |
| M3 | ⚠️ MAYOR | Mapping PCS → atributos diverge del GDD en los 5 componentes |
| M4 | ⚠️ MAYOR | `PCS_ATTRIBUTE_WEIGHTS` declarado pero no consumido (dead code con keys ajenas al dominio) |
| M5 | ⚠️ MAYOR | Jueces nombrados del GDD no presentes en `judges.json` |
| m1 | 🟡 MENOR | `Math.random` como default de `rng` (no-determinismo silencioso si el caller olvida pasarlo) |
| m2 | 🟡 MENOR | Test de determinismo cubre GOE pero no `ProgramScore` completa |
| m3 | 🟡 MENOR | Cohesión (Ensayo) ausente del PCS pese a aparecer en la tabla del GDD |

**Acciones sugeridas (fuera del alcance de esta auditoría):** consolidar `PCS_ATTRIBUTE_WEIGHTS` o eliminarlo; aplicar `judge.sesgos.tes` en la suma TES (o documentar la simplificación); reubicar `FIRST_FALL_GOE_PENALTY` como sesgo per-juez; añadir test de reproducibilidad bit-a-bit sobre `simulate(seed=K)`; poblar `judges.json` con los cuatro arquetipos del GDD.

---

## 2. Tabla de mapeo GDD → implementación

| Requisito GDD cap. 5 | Ubicación en código | Estado |
|---|---|---|
| TES por elemento; cada elemento tiene base + GOE | `engine.ts:150` `computeTESElement` — `base * (1 + goe * factor)` | ✅ |
| GOE en rango [-5, +5] | `engine.ts:144` `clamp(goe, GOE_RANGE.min, GOE_RANGE.max)`; `balance.ts:125` `GOE_RANGE = { min: -5, max: 5 }` | ✅ |
| GOE = f(atributos técnicos) | `engine.ts:118-119` `techMix` desde `saltos/giros/secuenciaDePasos` | ✅ |
| GOE = f(fatiga acumulada) | `engine.ts:121-123` `fatiguePenalty` sobre `FATIGUE_BLOCK_THRESHOLD` | ✅ |
| GOE = f(posición en programa) | `engine.ts:126-127` `positionPenalty = -positionIndex * 0.15` | ✅ |
| GOE = f(presión competitiva) | `engine.ts:129` `pressureMod = (presionCompetitiva/100) * pressureWeight` | ✅ |
| GOE = f(varianza[Resistencia mental]) gaussiana | `engine.ts:131-132` `gaussian(rng, MENTAL_VARIANCE_SIGMA(resistenciaMental))` | ✅ |
| σ inversamente proporcional a Resistencia Mental | `balance.ts:211-213` `σ = SIGMA_MIN + (SIGMA_MAX - SIGMA_MIN)*(1 - rm/100)` (estrictamente decreciente) | ✅ |
| Test de la propiedad σ↓ con rm↑ | `engine.test.ts:118-139` ('larger empirical stddev when resistenciaMental is low') | ✅ |
| PCS — Skating Skills (SK) ← Amplitud/Línea, Sec. pasos, Físico | `engine.ts:230-232` `0.5·amplitudLinea + 0.3·sec.pasos + 0.2·**saltos**` (no hay atributo "Físico") | ⚠️ |
| PCS — Transitions (TR) ← Sec. pasos, Artística (+ cohesión ensayo) | `engine.ts:234-236` `0.5·sec.pasos + 0.4·amplitudLinea + 0.1·densidadEmocional` (sustituye Artística por amplitudLinea, sin cohesión real) | ⚠️ |
| PCS — Performance (PE) ← Artística, Confianza, Presión competitiva | `engine.ts:238-242` `0.4·amplitudLinea + 0.3·confianza + 0.3·presionCentrada` (Artística → amplitudLinea) | ⚠️ |
| PCS — Composition (CO) ← Diseño, Cohesión, Coreógrafo | `engine.ts:244-246` `0.3·densidadEmocional + 0.4·coreografoNivel + 0.3·amplitudLinea` (no usa cohesión real de Ensayo) | ⚠️ |
| PCS — Interpretation (IN) ← Artística, Vínculo con la música, Rasgos | `engine.ts:248-250` `0.3·densidad + 0.3·amplitudLinea + 0.2·vinculo + 0.2·motivacionIntrinseca` (`vinculo` aquí es con el entrenador, no con la música; `Rasgos` ausentes) | ⚠️ |
| Trim de panel ISU (descartar mejor y peor) | `engine.ts:66-78` `trimmedMean` aplicado **por componente** en `computePCS` (`engine.ts:288-292`) | ✅ |
| Sesgo PCS por juez por componente | `engine.ts:256-257` `base + judge.sesgos.pcs?.[component]` | ✅ |
| Sesgo TES por juez | `engine.ts:262-270` `applyJudgeBias` definido pero **nunca llamado** desde `computeTES`/`simulate`. `judge.sesgos.tes` en `judges.json` queda inerte. | ❌ |
| Penalización -12 % GOE post-caída como sesgo de Anna Müller | `engine.ts:140-142` aplica `FIRST_FALL_GOE_PENALTY` a **todos** los elementos siguientes, sin discriminar juez. | ❌ |
| Caída ISU: deducción 1 pto por caída | `balance.ts:155` `FALL_DEDUCTION = 1.0`; `engine.ts:206` `deduccion = caida ? FALL_DEDUCTION : 0` (una vez por elemento) | ✅ |
| Invalidación de salto crítico | `engine.ts:90-92` `isInvalidated` con threshold -4; `engine.ts:205` `tesBruto = invalid ? 0 : …` | ✅ |
| Off-main-thread del motor | `service.ts:30-94` `runCompetition` y `runProgramSimulation` postMessage al worker; `competitionWorker.ts` hace todo el trabajo pesado | ✅ |

---

## 3. Resultado por tarea

### 3.1 Aislamiento (tarea 1) — ✅ con observación menor

`engine.ts` no importa React, ni `window`, ni Zustand, ni `fetch`. La única dependencia "del runtime" es `Math` (Box-Muller en `gaussian`). El RNG es **inyectable** en todas las funciones que producen ruido:

- `computeGOE(skater, element, contextFlags, rng = Math.random)` (`engine.ts:108-145`)
- `computeTES(program, skater, contextFlags, rng = Math.random)` (`engine.ts:163-181`)
- `simulateProgramElements(program, skater, contextFlags, rng = Math.random)` (`engine.ts:192-211`)
- `simulate(skater, program, judges, contextFlags, rng = Math.random)` (`engine.ts:432-449`)

**Observación m1 (🟡 MENOR).** El default `rng = Math.random` permite que un caller que olvide inyectar `rng` introduzca no-determinismo sin error. No hay errores actuales en el árbol de llamadas (worker, tests y `program/service.ts` siempre pasan `rng` explícito), pero el riesgo está latente. Sugerencia: hacer `rng` parámetro obligatorio en las funciones expuestas y dejar que sea el worker quien decida `mulberry32(seed)` vs `Math.random`.

### 3.2 Determinismo (tarea 2) — ✅

`competitionWorker.ts:42-51` define `mulberry32(seed)` y se construye solo cuando `data.contextFlags?.seed` es número (`competitionWorker.ts:62-64`). El test `simulateProgramElements › is reproducible for a given seeded rng` (`engine.test.ts:346-351`) demuestra reproducibilidad bit-a-bit del array de GOEs:

```typescript
const a = simulateProgramElements(tinyProgram(), skater, {}, mulberry32(123))
const b = simulateProgramElements(tinyProgram(), skater, {}, mulberry32(123))
expect(a.map(e => e.goe)).toEqual(b.map(e => e.goe))
```

**Observación m2 (🟡 MENOR).** El test compara solo GOEs. Faltan asserts equivalentes sobre `tesBruto`, `caida`, `deduccion`, `tes` total y `pcs` total para certificar que la pipeline completa (`simulate` con seed) es bit-a-bit idéntica. No es un fallo, pero la promesa de "determinismo en el worker" se cumple parcialmente en suite de tests.

**Observación adicional.** Cuando `contextFlags.seed` es `undefined`, el worker cae a `Math.random` (`competitionWorker.ts:62-64`). Es comportamiento por diseño (queremos no-determinismo en producción real), pero conviene que **cualquier llamada en tests/QA** pase siempre seed explícito. Hoy lo hacen.

### 3.3 GOE — los 5 inputs del GDD (tarea 3) — ✅

GDD pág. 12: `GOE = f(Atributos técnicos, Fatiga acumulada, Posición en el programa, Presión competitiva, Varianza[Resistencia mental])`. Verificación:

| Input GDD | Línea | Fórmula |
|---|---|---|
| Atributos técnicos | `engine.ts:118-119` | `techMix = (saltos·0.4 + giros·0.3 + secuenciaDePasos·0.3) / 10`; `baseGOE = (techMix - 5) · 0.4` |
| Fatiga acumulada | `engine.ts:121-123` | `fatiga > 70 → -(fatiga - 70) · 0.03`, si no `0` |
| Posición en programa | `engine.ts:126-127` | `-(posicionEnPrograma - 1) · 0.15` |
| Presión competitiva | `engine.ts:129` | `(presionCompetitiva/100) · 0.5` |
| Varianza[Resistencia mental] | `engine.ts:131-132` | `gaussian(rng, MENTAL_VARIANCE_SIGMA(resistenciaMental))` |

Adicionales: multiplicador para Axel (`engine.ts:136-138`) y propagación de la "Anna-Müller-universalizada" (`engine.ts:140-142`, ver M2). Clamp `[-5, +5]` aplicado al final (`engine.ts:144`).

**Conclusión:** los cinco inputs del GDD están presentes y todos contribuyen al GOE final. Sin lagunas.

### 3.4 Varianza gaussiana inversa a Resistencia Mental (tarea 4) — ✅

`balance.ts:211-213`:

```typescript
const SIGMA_MAX = 2.0   // resistenciaMental = 0
const SIGMA_MIN = 0.3   // resistenciaMental = 100
export function MENTAL_VARIANCE_SIGMA(resistenciaMental: number): number {
  return SIGMA_MIN + (SIGMA_MAX - SIGMA_MIN) * (1 - resistenciaMental / 100)
}
```

`σ` es estrictamente decreciente en `resistenciaMental`. La gaussiana `gaussian(rng, sigma)` (`engine.ts:35-42`) usa Box-Muller con rechazo de `u=0`. El test empírico (`engine.test.ts:118-139`) calcula stddev sobre 1000 muestras con `mulberry32` reproducible y verifica `stddev(low) > stddev(high)`. ✅

### 3.5 PCS — los 5 componentes (tarea 5) — ⚠️ M3

GDD pág. 12 (tabla):

| Componente | Atributos fuente GDD | Implementación (`engine.ts:228-251`) | Diferencia |
|---|---|---|---|
| **SK** Skating Skills | Amplitud/Línea, Sec. pasos, **Físico** | `0.5·amplitudLinea + 0.3·secuenciaDePasos + 0.2·saltos` | "Físico" → `saltos`. No existe atributo `physical`/`fisico` en `TechnicalAttributes`; usar `saltos` como proxy es debatible (el físico es el conjunto stamina+amplitud+resistencia, no la habilidad de salto). |
| **TR** Transitions | Sec. pasos, **Artística** (+ cohesión ensayo) | `0.5·secuenciaDePasos + 0.4·amplitudLinea + 0.1·densidadEmocional` | "Artística" no existe como atributo del patinador (los técnicos son saltos/giros/sec.pasos/amplitudLinea); `amplitudLinea` actúa como proxy. La cohesión de Ensayo no se modela. |
| **PE** Performance | **Artística**, Confianza, Presión competitiva | `0.4·amplitudLinea + 0.3·confianza + 0.3·((50 + presionCompetitiva/2))` | "Artística" → `amplitudLinea`. Recentrado de presión a 0-100 OK. |
| **CO** Composition | Diseño del programa, **Cohesión**, Coreógrafo | `0.3·densidadEmocional + 0.4·coreografoNivel + 0.3·amplitudLinea` | "Cohesión" (que el GDD ata a las ranuras Ensayo) NO se usa; sustituida por `amplitudLinea`. |
| **IN** Interpretation | Artística, **Vínculo con la música**, **Rasgos** | `0.3·densidadEmocional + 0.3·amplitudLinea + 0.2·vinculo + 0.2·motivacionIntrinseca` | El `vinculo` que se usa es con el entrenador (`weeklyState.vinculo`), no con la música. Los `rasgos` no entran. |

**Hallazgo M3 (⚠️ MAYOR).** Los cinco componentes divergen del GDD. Tres patrones de divergencia:

1. **"Artística" usada como sinónimo de `amplitudLinea`** (TR, PE, IN). Si la intención es que `amplitudLinea` ≡ "Artística", debería estar documentado en algún sitio (no lo está). Si no, hay un atributo del GDD ("Artística") que falta crear o aliasar.
2. **"Cohesión" del Ensayo** declarada en GDD para TR y CO no se materializa: ni `WeeklyState` ni `ProgramData` exponen un campo `cohesion`. Las ranuras de Ensayo (`SLOT_EFFECTS.Ensayo` en `balance.ts:90-94`) suben fatiga y no tocan ningún `cohesion` numérico.
3. **"Rasgos" en IN** ausentes: la lista `TraitId` (`CLAUDE.md`) define `ArtistaNato`, `ArtistaPlena`, `ArteInstrumentalizado` como rasgos directamente relevantes para PCS-IN, pero el cálculo no los consulta.

**Hallazgo M4 (⚠️ MAYOR).** `PCS_ATTRIBUTE_WEIGHTS` (`balance.ts:179-185`) declara una tabla con keys `jump`, `spin`, `steps`, `stamina`, `flexibility`, `artistry`, `focus`, `resilience`, `mentalStrength` — un sistema de atributos **diferente** al actual (`saltos`, `giros`, `secuenciaDePasos`, `amplitudLinea`). La constante no se importa desde ningún archivo. Es dead code, posiblemente residuo de un diseño previo. Riesgo: que un futuro desarrollador la consuma esperando que esté sincronizada con el cálculo real, generando inconsistencias.

**Hallazgo m3 (🟡 MENOR).** La cohesión del programa (incremento por ranuras Ensayo) no está modelada en ningún campo de `ProgramData` ni `WeeklyState`, y por tanto no entra en CO ni TR aunque el GDD lo prescriba. Es una pieza pendiente más que un bug.

### 3.6 Trim de panel (tarea 6) — ✅

`engine.ts:66-78`:

```typescript
export function trimmedMean(values: readonly number[]): number {
  if (values.length === 0) return 0
  if (values.length <= 2) return promedio
  const sorted = [...values].sort((a, b) => a - b)
  const trimmed = sorted.slice(1, -1)   // descarta min y max
  return promedio(trimmed)
}
```

Aplicado por componente PCS (`engine.ts:288-292`): cada juez del panel produce una puntuación 0-10 para el componente, se descarta el alto y el bajo, se promedia. Coincide con el procedimiento ISU real. Test `trimmedMean (ISU trimming) › drops single min and single max with 7 samples` (`engine.test.ts:144-156`) verifica `trimmedMean([1,3,5,5,5,7,9]) === 5`.

**Observación.** TES no usa trimming porque no hay panel para GOE: el motor produce un solo valor por elemento (más una varianza gaussiana ligada a `resistenciaMental`). En la ISU real GOE también es panel + trim. Es una simplificación deliberada — aceptable y coherente con la sección "Motor TES" del GDD que describe GOE como una función única (no panel).

### 3.7 Sesgos de juez (tarea 7) — ⚠️ M1, M2, M5

#### M1 — `sesgos.tes` no se aplica en la simulación (⚠️ MAYOR)

- Schema: `JudgePCSBias` y `Judge` (`dataService.ts:84-104`). `Judge.sesgos.tes` es `number | undefined`.
- Datos: `judges.json` puebla `tes` para los 8 jueces (`tes: 0.3`, `0.5`, `-0.2`, `-0.3`, …).
- Pipeline: `computeTES` (`engine.ts:163-181`) **no recibe `judges`** y `simulate` (`engine.ts:432-449`) tampoco aplica el bias TES en ningún paso:

```typescript
export function simulate(skater, program, judges, contextFlags, rng) {
  const elements = simulateProgramElements(program, skater, contextFlags, rng)
  const score = finalizeProgramScore(elements, skater, program, judges)  // PCS sí, TES no
  return { tes: score.tes, ... }
}
```

`finalizeProgramScore` (`engine.ts:306-331`) suma `e.tesBruto` directamente; el sesgo TES de cada juez nunca se mezcla. La función `applyJudgeBias` (`engine.ts:262-270`) está exportada y testada (`engine.test.ts:182-197`) pero ninguna ruta de simulación la invoca con `component === undefined` (rama TES).

**Consecuencia.** El campo `tes` de `judges.json` y de `Judge.sesgos` está **muerto en producción**. La narrativa GDD ("conocer al panel es una ventaja real") solo se cumple para PCS.

#### M2 — Penalización -12 % post-caída como regla universal (⚠️ MAYOR)

GDD pág. 13 (Anna Müller): "Anti-caídas extrema. Penalización adicional del 12 % en GOE de elementos posteriores a una caída en el mismo programa."

En el código, este -12 % se aplica como `FIRST_FALL_GOE_PENALTY = 0.88` (`balance.ts:159`) en dos puntos:

- `engine.ts:140-142`: dentro de `computeGOE`, si `contextFlags.firstFallTriggered`, multiplica el GOE final del elemento actual por 0.88.
- `engine.ts:368-371`: dentro de `applyMomentToElements`, propaga 0.88 a todos los elementos posteriores cuando un Momento causa la primera caída.

El bias se aplica **una vez**, por programa, **independientemente del juez**. Es decir, todos los jueces del panel "ven" el mismo GOE atenuado. La intención GDD es que sólo Anna Müller (y los jueces que el diseño extienda con ese rasgo) aporten ese -12 %; un juez como Petrov, pro-escuela rusa con tendencia a perdonar, no debería propagar esta penalización.

**Consecuencia.** El -12 % se confunde semánticamente con una regla ISU genérica. La diferenciación entre jueces ("conocer al panel") pierde una dimensión narrativa importante. Recomendación de diseño: mover esta regla al campo `Judge.sesgos` (e.g. `sesgos.postFallGoePenalty?: number`) y aplicarla durante el agregado por juez (que hoy no existe para GOE — ver M1).

Notar que el comentario en `balance.ts:157-159` ya nombra la constante "Anna Muller", lo que indica que la intención original era exactamente esa: la implementación se quedó en una primera aproximación universal.

#### M5 — Jueces nombrados del GDD no presentes en `judges.json` (⚠️ MAYOR)

El GDD describe cuatro arquetipos de juez con nombre y rasgos distintivos:

- Kenji Tanaka (JPN) — pro-artística, +0.15 PE e IN con relación favorable.
- Anna Müller (GER) — anti-caídas extrema (-12 % post-caída).
- Sarah Walsh (USA) — neutral mediana.
- Nikolai Petrov (RUS) — pro-escuela rusa +0.3-0.8 GOE; gatilla "La llamada de Petrov" en Acto III-IV.

`public/data/judges.json` contiene ocho jueces distintos: Nakamura Keiko, Isabelle Lecomte, Aleksandr Petrov (no es el mismo Nikolai), Kim Min-Jun, Ursula Hoffmann, Chen Wei, Marco Rossi, Paavo Virtanen. Los rasgos especiales del GDD (penalización post-caída de Anna Müller, evento de Petrov, relación con `IceTime Magazine` de Tanaka) no están modelados como datos: no hay campo `relacionConMedios`, ni `triggerEvent`, ni el penalty post-caída es per-juez.

**Consecuencia.** La promesa GDD "Los jueces no son generadores aleatorios de puntuación. Son personajes con historia, sesgos documentados, y relaciones con entrenadores y patinadores que evolucionan a lo largo de temporadas" no se cumple en el dataset actual. Solo los sesgos numéricos PCS están vivos.

### 3.8 Caídas y deducciones (tarea 8) — ✅

| Aspecto | Línea | Verificación |
|---|---|---|
| Constante de deducción | `balance.ts:155` `FALL_DEDUCTION = 1.0` | Coincide con la regla ISU senior. |
| Detección de caída | `engine.ts:85-87` `isFall: tipo === 'salto' && goe ≤ -3` | Solo saltos cuentan; spins/steps no producen caída en este sistema. Aceptable como simplificación. |
| Deducción una vez por elemento | `engine.ts:206` `deduccion = caida ? FALL_DEDUCTION : 0` | No hay acumulación entre `computeTES` y `finalizeProgramScore`: ambos suman `e.deduccion` del mismo `ElementOutcome[]`. La pipeline no llama a las dos en cascada sobre las mismas caídas. |
| Invalidación de salto crítico | `engine.ts:90-92` `isInvalidated: tipo === 'salto' && goe ≤ -4` | Modela la regla ISU "no value": `tesBruto = 0` además de la deducción. |
| Total computado correctamente | `engine.ts:329` `total = tes + pcs.total - deducciones` | Resta las deducciones una vez. |
| Test multi-trial de caídas con `deduccion ≈ 1.0` | `engine.test.ts:353-371` | Patinador débil + fatigado a través de 80 seeds; verifica `deduccion ≈ 1.0` por cada caída. |

**Edge case revisado.** Cuando un Momento fuerza caída (`applyMomentToElements`, `engine.ts:345-385`), la nueva caída produce `caida = true` y `deduccion = FALL_DEDUCTION` (`engine.ts:381`). Como reemplaza el `ElementOutcome` íntegro, no hay double-count con la caída original (que ya no existe en el output). ✅

**Bookkeeping de "primera caída".** `firstFallTriggered` se marca true tras una caída (`engine.ts:208`) y se propaga a los elementos siguientes vía multiplicación por `FIRST_FALL_GOE_PENALTY` (`engine.ts:140-142`). No se aplica al elemento que cayó (eso sería doble penalización), solo a los posteriores. ✅

### 3.9 Off-main-thread (tarea 9) — ✅

`grep` cruzado a las funciones `simulate`, `simulateProgramElements`, `finalizeProgramScore`, `computeGOE`, `computeTES`, `computePCS`:

| Caller | Vía | Estado |
|---|---|---|
| `pages/Competition.tsx:217` | `applyMomentToElements(elements, mo, revealedIndex, mo.causesFall)` | ✅ Excepción documentada en CLAUDE.md (función pura, recompute cheap, evita round-trip al worker). No es `simulate`. |
| `features/program/service.ts:331-334` | `engineComputeTES(program, skater, {}, PROJECTION_RNG)` y `engineComputePCS(skater, program, panel)` | ✅ Uso síncrono autorizado por CLAUDE.md ("Otras features pueden invocar el engine síncronamente para validación"). |
| `features/competition/service.ts` | `runCompetition`/`runProgramSimulation` → worker | ✅ Toda simulación de bucle de juego va vía worker. |
| `features/rivals/service.ts` | `simulateRivalProgram`/`simulateRivalCompetition` (motor distinto, simplificado) | ➖ Fuera del alcance de esta auditoría (no usa el engine ISU). |

**Ninguna llamada directa a `simulate` o `simulateProgramElements` desde `pages/` o `components/`**. La regla R5 del CLAUDE.md (resumida en INFORME A1) se respeta para el motor de competición ISU.

---

## 4. Conclusión

El motor está **arquitectónicamente bien**: pureza, RNG inyectable, worker, tests de propiedades clave, trim ISU, clamps correctos, no-double-count de caídas, off-main-thread limpio. Los problemas se concentran en **fidelidad al GDD pág. 12-13**: la tabla PCS no se cumple atributo por atributo, los sesgos TES están desconectados, y los cuatro jueces emblemáticos del GDD aún no son datos. Son hallazgos MAYORES porque erosionan la promesa "ISU real, jueces como personajes" del GDD, pero ninguno es CRÍTICO: el motor produce puntuaciones plausibles y reproducibles.

**Sugerencia de orden de remediación (fuera de esta auditoría):**

1. M4 + M3 — decidir si `PCS_ATTRIBUTE_WEIGHTS` se borra o se reescribe con las keys reales y si los componentes deben pasar a consumirlo. Resolver simultáneamente la divergencia atributo-a-atributo con el GDD.
2. M1 — aplicar `judge.sesgos.tes` en `simulate`/`finalizeProgramScore` (sumarlo al TES total, posiblemente con trimming si se decide modelar GOE per-juez).
3. M2 — mover `FIRST_FALL_GOE_PENALTY` al campo `Judge.sesgos` y aplicarlo per-juez.
4. M5 — añadir los cuatro jueces del GDD a `judges.json` con sus rasgos distintivos (esto requiere primero M2 para que tenga sentido).
5. m1, m2, m3 — tareas menores de robustez y cobertura.
