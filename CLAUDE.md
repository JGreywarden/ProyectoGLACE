# GLACÉ — Guía de Proyecto para Claude

## Qué es GLACÉ

Manager narrativo de patinaje artístico sobre hielo para navegador. El jugador es entrenador: gestiona la relación con sus patinadores a lo largo de una carrera completa. Los resultados deportivos son consecuencia de esas relaciones, no el objetivo.

**Intersección de géneros:**
- Football Manager (profundidad de simulación deportiva, datos ISU reales)
- Hades / Persona (relaciones profundas con NPCs, historia emergente)
- This War of Mine (simulación narrativa, consecuencias morales)

**Dirección estética:** Nordic Noir sobre hielo.

**Distribución:** versión web gratuita (navegador) + versión comercial en Steam vía Electron/Tauri.

**Sesiones objetivo:** 20-40 minutos. Sin instalación. Sin login requerido.

---

## Stack técnico

| Capa | Tecnología | Uso |
|---|---|---|
| Lenguaje | TypeScript 5.x (strict) | Todo el proyecto. Tipado estático obligatorio. |
| UI / Renderizado | React 18 + JSX | Todas las pantallas de gestión y narrativa |
| Estilos | Tailwind CSS v3 | Clases utilitarias; paleta definida via CSS custom properties |
| Estado global | Zustand v5 | Un store por feature; devtools middleware siempre activo |
| Routing | React Router v6 | Una ruta por pantalla principal |
| Eventos cross-feature | mitt | Bus tipado (`src/lib/events.ts`); solo para efectos desacoplados |
| Cómputo pesado | Web Worker | Motor de competición TES/PCS — nunca en el hilo principal |
| Bundler | Vite 6 | Alias `@` → `src/`, chunk split vendor/state, sourcemaps en prod |
| Despliegue | Vercel | SPA rewrite en `vercel.json` |

**Resolución de referencia:** 1440×900. Debe adaptarse hasta 1280×720 y 1920×1080.

---

## Arquitectura de carpetas

```
src/
  assets/           # fuentes, iconos, audio — solo estáticos sin lógica
  components/
    ui/             # átomos del design system: Button, Card, Badge, ProgressBar…
    layout/         # shell persistente: Sidebar, TopBar, Panel…
  features/         # un directorio por dominio de juego (ver detalle abajo)
    training/       # bucle semanal: 5 ranuras, 6 actividades, 6 tensiones
    athlete/        # atributos, rasgos, vínculo, fatiga
    competition/    # motor TES/PCS, GOE por elemento, panel de jueces
    program/        # diseñador de programas musicales, elementos ISU
    club/           # 8 instalaciones × 4 niveles, atmósfera emergente
    economy/        # ingresos, sponsors, 4 estados de presión financiera
    scouting/       # radar de talento, niebla de información, pipeline 6 etapas
    calendar/       # calendario ISU 30 semanas, tipos de semana
    coach/          # reputación en 5 dimensiones, 5 medios del circuito
    legacy/         # retirada de patinadores, legado, hall of fame
  hooks/            # hooks React reutilizables cross-feature
  lib/
    events.ts       # mitt bus singleton tipado — solo efectos desacoplados
  pages/            # componentes de ruta (uno por pantalla principal)
  router/           # configuración de React Router
  services/         # lógica de negocio pura cross-feature (sin React)
  stores/
    gameStore.ts    # reloj global: week / season / phase
  types/
    index.ts        # tipos de dominio compartidos (Skater, Attribute…)
    events.ts       # contrato tipado del event bus
  utils/            # funciones puras sin dominio (clamp, formatScore…)
  workers/          # Web Workers — competitionWorker.ts va aquí
```

### Estructura interna de cada feature

```
features/training/
  components/       # componentes React exclusivos de esta feature
  hooks/            # hooks React exclusivos de esta feature
  service.ts        # lógica de negocio pura (sin React, sin efectos)
  store.ts          # Zustand slice con devtools
  types.ts          # tipos locales de la feature
  index.ts          # barrel export — API pública de la feature
  service.test.ts   # tests unitarios de service.ts
```

### Regla de dependencias

- `pages/` y `components/` importan de `features/` y `stores/`, nunca al revés.
- `features/*/service.ts` no importa React.
- `utils/` no importa de ningún otro módulo del proyecto.
- Imports entre features: solo a través del `index.ts` del otro feature (nunca imports internos cruzados). Si necesitas un símbolo que el barrel no exporta, primero amplía el barrel; nunca acortes la ruta saltándotelo.
- El motor de competición es un **módulo puro** que vive en `features/competition/engine.ts` (funciones sin estado: `computeTES`, `computePCS`, `simulate*`, `finalizeProgramScore`, …). `workers/competitionWorker.ts` lo ejecuta off-main-thread vía `postMessage`. `features/competition/service.ts` es la API main-thread basada en `Promise` que envuelve el worker. Otras features pueden invocar el engine síncronamente para validación (p.ej. `program/service.ts`); para cálculo en bucle de juego, **siempre vía worker**.
- Excepción documentada para imports a ruta interna: `workers/<X>Worker.ts` puede importar `features/<X>/engine` (o equivalente) directamente porque worker y engine son la pareja threading↔lógica del mismo motor. Cualquier otro cruce sigue la regla del barrel sin excepciones.

---

## Normas de código

### Principios generales

- **KISS** — la solución más simple que funcione. Sin abstracciones antes de que haga falta.
- **DRY** — si la misma lógica aparece dos veces, extraerla.
- **YAGNI** — solo lo que se va a usar. No diseñar para requisitos hipotéticos.

### Nombrado de archivos

| Tipo de archivo | Convención | Ejemplo |
|---|---|---|
| Componente React | `PascalCase.tsx` | `TrainingGrid.tsx` |
| Hook | `useCamelCase.ts` | `useTrainingSlots.ts` |
| Store Zustand | `camelCaseStore.ts` | `gameStore.ts` |
| Service / lógica pura | `camelCase.ts` dentro de su feature | `service.ts` |
| Tipos de feature | `types.ts` | — |
| Barrel export | `index.ts` | — |
| Test | `camelCase.test.ts` | `service.test.ts` |
| Web Worker | `camelCaseWorker.ts` | `competitionWorker.ts` |

### Nombrado de identificadores

- Variables y funciones: camelCase en inglés. `calculateGOE`, `updateSkaterFatigue`, `applyBondDecay`.
- Tipos e interfaces: PascalCase. `SkaterAttributes`, `WeeklySlotType`, `CompetitionResult`.
- Constantes globales: UPPER_SNAKE. `MAX_WEEKLY_SLOTS`, `BOND_DECAY_PER_WEEK`.
- Stores Zustand: `useXxxStore`. `useTrainingStore`, `useAthleteStore`.
- Acciones en devtools: `'feature/actionName'`. `'training/setSlot'`, `'game/advanceWeek'`.
- Event bus keys: `'dominio:accion'`. `'week:advance'`, `'competition:result'`.
- CSS custom properties del tema: `--c-{categoria}-{variante}`. `--c-ice-500`, `--c-bg-deep`.

### Comentarios

- Solo cuando el **por qué** no es obvio en el código.
- En minúsculas, concisos, sin punto final.
- Explicar restricciones del dominio, fórmulas no triviales, o decisiones de diseño contraintuitivas.

```typescript
// el GOE cae exponencialmente si historialLesiones > 70 (regla GDD cap. 3)
const injuryPenaltyMultiplier = skater.historialLesiones > 70
  ? Math.exp((skater.historialLesiones - 70) / 30) - 1
  : 0
```

### Funciones

- Una responsabilidad por función.
- Máximo ~30 líneas. Si crece, dividir.
- Preferir funciones puras en `service.ts` (entrada → salida sin efectos).
- Los efectos secundarios (persistencia, eventos del bus) quedan en stores o handlers de página.

### Stores Zustand

- Un store por feature. El store global `gameStore.ts` es solo para el reloj (week/season/phase).
- Toda acción lleva nombre de devtools: tercer argumento de `set()`.
- No poner lógica de negocio en el store: llamar a funciones de `service.ts` y guardar el resultado.

```typescript
addGains: (skaterId, gains) => {
  const updated = applyGains(get().athletes[skaterId], gains)  // service.ts
  set({ athletes: { ...get().athletes, [skaterId]: updated } }, false, 'athlete/addGains')
}
```

### Tests

- Test unitario por cada función de negocio en `service.ts`.
- Framework: **Vitest** (nativo con Vite, sin configuración adicional).
- Usar fixtures que reflejen casos límite del GDD: fatiga > 70, vínculo en umbrales, rasgos en mutación.
- Validar invariantes del dominio: `vinculo` siempre 0-100, `fatigaAcumulada` nunca negativa, `techosBiologico` nunca aumenta.

---

## Vocabulario de dominio

Usar estos nombres exactos en el código para mantener coherencia con el GDD.

### Entidades principales

| Concepto | Nombre en código | Tipo |
|---|---|---|
| Patinador | `Skater` | entidad |
| Entrenador | `Coach` | entidad |
| Club | `Club` | entidad |
| Temporada | `Season` | entidad |
| Semana | `Week` | unidad de tiempo |

### Atributos del patinador

```typescript
// atributos técnicos (visibles desde el inicio)
saltos: number            // 0-100
giros: number             // 0-100
secuenciaDePasos: number  // 0-100
amplitudLinea: number     // 0-100

// atributos psicológicos (ocultos, se revelan por umbral de vínculo)
confianza: number              // visible con vínculo >= 20
resistenciaMental: number      // visible con vínculo >= 40
presionCompetitiva: number     // visible con vínculo >= 55 (puede ser + o -)
motivacionIntrinseca: number   // visible con vínculo >= 65
autoexigencia: number          // solo en crisis o diálogo

// atributos físicos permanentes (no mejorables directamente)
techosBiologico: number         // 0-100; solo puede reducirse por sobreentrenamiento
historialLesiones: number       // 0-100; sube con cada lesión; > 70 = riesgo exponencial
velocidadRecuperacion: number   // derivado de techosBiologico e historialLesiones

// estado dinámico semanal
fatigaAcumulada: number  // 0-100; > 70 bloquea mejora técnica
estres: number           // 0-100; afecta GOE y PCS
vinculo: number          // 0-100; decae 2-3 pts/semana sin ranura Dialogo
```

### Rasgos de personalidad

```typescript
type TraitId =
  | 'Perfeccionista'        // riesgo de mutación a AutoexigenciaDestructiva
  | 'Resiliente'            // alta resistencia mental base
  | 'ArtistaNato'           // PCS crece más rápido
  | 'FragilBajoPresion'     // caída en competiciones grandes
  | 'PropositoDifuso'       // motivación baja; riesgo de abandono
  | 'LealHastaElLimite'     // depende del vínculo para activarse positivamente
  // mutaciones negativas
  | 'AutoexigenciaDestructiva'
  | 'PanicoCompetitivo'
  | 'Quemado'
  | 'ArteInstrumentalizado'
  // mutaciones positivas
  | 'ExcelenciaTecnica'
  | 'Controlado'
  | 'PropositoEncontrado'
  | 'ArtistaPlena'
```

### Ranuras semanales

```typescript
type WeeklySlotType =
  | 'Tecnico'     // saltos+, giros+, pasos+ / fatiga++, estres+, riesgo lesión+
  | 'Fisico'      // resistencia+, fuerza+ / sin efecto técnico directo
  | 'Mental'      // estres--, confianza+, vínculo+ / imprescindible 3 sem antes de competición grande
  | 'Descanso'    // fatiga--, estres-, riesgo lesión- / obligatorio 1/4 semanas
  | 'Ensayo'      // cohesión+, PCS+ / no mejora elementos técnicos
  | 'Dialogo'     // vínculo+, posible revelación de rasgo, estres- / única vía de revelación
```

### Motor de competición

```typescript
// puntuación ISU
TES: number   // Technical Element Score
PCS: number   // Program Component Score
GOE: number   // Grade of Execution: -5 a +5 por elemento

// componentes del PCS
SK: number    // Skating Skills
TR: number    // Transitions
PE: number    // Performance
CO: number    // Composition
IN: number    // Interpretation
```

### Reputación del entrenador

```typescript
repResultados: number      // la más volátil
repCuidado: number         // la más lenta de construir
repArtistica: number       // la construyen los jueces entre sí
repHonestidad: number      // la más difícil de subir
repInstitucional: number   // relación con estructuras ISU y federaciones
```

### Escalas de tiempo

```typescript
type TimeScale = 'micro' | 'meso' | 'macro'
// micro: semana (5 ranuras) — consecuencias reversibles
// meso: temporada (30 semanas) — consecuencias semipermanentes
// macro: carrera (10-15 temporadas) — consecuencias permanentes e irreversibles
```

---

## Diseño visual

### Paleta estructural (CSS custom properties en `src/index.css`)

```css
/* fondos — de más oscuro a más claro */
--c-bg-deep:    #0c1220;
--c-bg-base:    #121c2e;
--c-bg-surface: #18253a;
--c-bg-raised:  #1e2d46;

/* bordes */
--c-border-subtle: #1e2d46;
--c-border:        #253650;
--c-border-strong: #2e4265;

/* ice blue — acción primaria, links, estados activos */
--c-ice-300: #93c9e8;
--c-ice-400: #6fb4d8;
--c-ice-500: #4e9fc8;
--c-ice-600: #3a7fa0;

/* frost teal — logros, vínculo alto, eventos positivos */
--c-frost-400: #6eddd5;
--c-frost-500: #4ecdc4;

/* texto */
--c-text-primary:   #e2eaf3;
--c-text-secondary: #8ca3be;
--c-text-muted:     #506070;
--c-text-disabled:  #364555;

/* semánticos */
--c-gold:    #c9a84c;   /* medallas, sponsors, advertencias */
--c-danger:  #c95a5a;   /* lesiones, pérdidas, alertas críticas */
--c-success: #5bc97a;   /* récords, victorias, progresión positiva */
```

### Paleta semántica de juego (colores con significado narrativo)

Definir como vars adicionales cuando se implementen las pantallas:

```css
/* azul técnico — datos de rendimiento, atributos técnicos */
--c-semantic-technical: #2a5fa8;

/* dorado cálido — momentos humanos, logros, eventos narrativos importantes */
--c-semantic-human: #c8922a;

/* púrpura de vínculo — uso exclusivo para todo lo relacionado con el vínculo */
--c-semantic-bond: #7b5ea7;
```

### Tipografía

- **DM Sans** — UI del sistema: menús, etiquetas, datos numéricos, elementos de gestión.
- **Cormorant Garamond** — momentos narrativos exclusivamente: título de evento, nombre del patinador en su ficha, puntuación total en competición, títulos de las 5 pantallas principales.

> Pendiente: añadir ambas fuentes al proyecto (Google Fonts o self-hosted) y actualizar `tailwind.config.ts` con `fontFamily.sans` y `fontFamily.display`.

---

## Pantallas principales (GDD cap. 18)

| Pantalla | Componente React | Descripción |
|---|---|---|
| Hub semanal | `HubSemanal` | Pantalla más frecuente. Centro: 5 ranuras. Barra inferior: fatiga, estrés, cohesión, presupuesto. |
| Ficha del patinador | `FichaPatinador` | Atributos desconocidos como rejilla de niebla. Rasgos latentes como siluetas. |
| Evento narrativo | `EventoNarrativo` | Pantalla completamente oscura. Sin rejilla. Cormorant Garamond para escena. |
| Competición | `Competicion` | Vista cenital de pista. Panel lateral con TES/PCS/GOE por elemento. |
| Calendario | `Calendario` | Celdas de color por tipo de semana. Lectura de patrones de un vistazo. |

---

## Sistemas pendientes de implementar (prioridad)

Del GDD cap. 19 — en este orden:

1. **Fórmulas matemáticas exactas** — curvas de progresión de atributos, rangos TES/PCS, coeficientes económicos. Máxima prioridad: sin esto no puede empezar nada.
2. **Tipos TypeScript base** — `src/types/index.ts` y `features/*/types.ts` completos antes de escribir lógica.
3. **Motor de competición** — TES/PCS en `workers/competitionWorker.ts`. Sistema más crítico y más testeable de forma aislada.
4. **Sistema de entrenamiento** — las 6 actividades, 6 tensiones, efectos acumulativos. Núcleo del bucle semanal.
5. **Sistema de vínculo y narrativa** — eventos, capas de revelación de rasgos, mutaciones.
6. **Arquitectura de persistencia** — decidir entre IndexedDB directo o wrapper; guardado incremental por semana.
7. **200-300 eventos narrativos** — con condiciones de activación, opciones y consecuencias.
8. **NPCs del circuito rival** — 50-100 patinadores con progresión simulada por temporada.
9. **Pantallas adicionales** — gestión económica, scouting pipeline, diseñador de programas, panel de jueces, gala, legado.

---

## Flujo de trabajo

1. Empezar siempre por los **tipos TypeScript** (`features/*/types.ts`) antes de escribir lógica.
2. Implementar **un sistema completo** (incluyendo sus tests en `service.test.ts`) antes de pasar al siguiente.
3. La lógica de negocio en `service.ts` debe funcionar **sin UI**: validarla con Vitest y datos simulados primero.
4. El motor de competición va en **Web Worker desde el primer día** — nunca en el hilo principal.
5. Cada nueva función de dominio (GOE, TES, vínculo): **test primero**.
6. Los componentes React no contienen lógica de negocio: solo llaman a funciones de `service.ts` o al store y renderizan el resultado.
7. Toda entidad persistida pasa por su `validateXxxData` **antes** de entrar a un store. Nunca usar `as` para saltarse la validación.
8. Todo acceso a `localStorage` pasa por `@/utils/safeStorage`. Nunca llamar al API nativo directamente.
9. Errores inesperados se capturan en el `ErrorBoundary` raíz — no silenciar con `try/catch` locales que dejan el store en estado inconsistente.
10. Cambios que tocan más de una entidad (skater + season, coach + club) se hacen con `gameStore.applyWeekTransition` u otra acción compuesta, **nunca** encadenando setters individuales.
11. Al terminar cualquier tanda de trabajo solicitada durante una conversación, **preguntar al usuario** si quiere el flujo habitual de publicación: commit en la rama del worktree → push a GitHub → PR + merge a `main` → **borrado solo de la rama remota** (`git push origin --delete <rama>` o `gh pr merge --delete-branch`). **No** borrar nunca la rama local ni el worktree: el usuario los conserva. No ejecutar el flujo sin confirmación explícita.

---

## Patrones establecidos en Fase 0

Estas pautas nacieron del endurecimiento de Fase 0 (abril 2026) y son **obligatorias** para todas las fases siguientes.

### D1. Validación runtime en frontera

Todo dato que entra desde `localStorage`, `fetch('/data/...')` o una llamada a API externa debe pasar por un `validateXxxData` antes de llegar a un store. Los validadores incluyen **rangos de dominio** (0–100 donde aplique, -100 a 100 para `presionCompetitiva`, 1–30 para `semanaActual`, 0–4 para nivel de instalación, suma ≈ 1.0 para `ramasCoach`, etc.), no solo forma estructural. Los casts (`as SkaterData`) están prohibidos fuera de los propios validadores.

Helpers disponibles en `@/utils/validation`: `isFiniteNumber`, `isInRange`, `isIntegerInRange`, `isInteger`, `isNonNegative`, `isPlainObject`, `hasFiniteNumberFields`, `hasUnitScoreFields`, `approximatelyEquals`.

#### D1.1. Validación per-elemento de arrays y records

Reforzado tras la auditoría A2 (mayo 2026). `Array.isArray(x)` y `typeof x === 'object'` **no son validación**: solo confirman la forma del contenedor. La validación real recorre el contenido.

- Para arrays de entidades persistidas, recorrer con `every`: `if (!data['sponsors'].every(validateSponsor)) return false`. Crear el validador per-elemento aunque la entidad solo aparezca anidada (ver `validateSponsor`, `validateRival`, `validateProgramElement`, `validateDialogueLine`).
- Para records `Record<string, T>`, iterar las claves y validar cada valor (ver `validateNarrativeFlags`).
- El patrón prohibido es `Array.isArray(x) ? x as T[] : []` — el cast después del `Array.isArray` es exactamente el atajo que D1 veta.
- Si una entidad ya tiene validador (ej. `validateNarrativeEvent`), **úsalo** dentro del validador del contenedor (`SaveFile.generatedEvents` recorre con `validateNarrativeEvent`). No reinventar.
- Validadores compuestos (un objeto con varios subarrays) deben validar cada subarray, no solo confirmar que el objeto es plain.

#### D1.2. Tipos compartidos entre features

Cuando dos módulos definen interfaces con el mismo nombre pero forma distinta (caso histórico: `NarrativeEvent` en `@/services/dataService` vs `@/features/narrative/types`), **el validador es la fuente de verdad del tipo**. Importa el tipo desde el mismo barrel que exporta su validador para evitar incompatibilidades silenciosas detectadas solo por `exactOptionalPropertyTypes`.

### D2. Acceso a storage

Nunca llamar directamente a `localStorage`. Usar siempre `@/utils/safeStorage`. Cualquier código que asuma que el storage está disponible debe consultar `safeStorage.available` primero. Los fallos de storage (Safari privado, cookies bloqueadas, iframe sin acceso) no deben romper el bootstrap: `safeStorage` devuelve `false`/`null` silenciosamente. La UI consulta `useSaveStore.storageAvailable` para mostrar un banner "Modo sin guardado".

### D3. Atomicidad cross-store

Cuando una acción de dominio toque más de una entidad (skater + season, coach + club, etc.), usar `gameStore.applyWeekTransition({ skater?, coach?, club?, season? })` o crear una acción compuesta equivalente en un solo `set(...)`. Nunca encadenar dos setters individuales para estado que debe verse consistente en un render; un re-render intermedio puede mostrar al jugador un estado imposible.

### D4. Selectores de Zustand

En componentes React, suscribirse **siempre a campos específicos**:

```typescript
// ✅
const semana = useGameStore(s => s.currentSeason?.semanaActual)

// ❌  — cualquier mutación dentro de currentSeason re-renderiza
const season = useGameStore(s => s.currentSeason)
```

Para selecciones compuestas usar `useShallow` de `zustand/shallow`. Esto importa de verdad: `currentSeason.historialSemanas` y `resultadosTemporada` crecen hasta miles de entradas a lo largo de 15 temporadas.

### D5. Tests con Vitest

Todo `service.ts` nuevo se commitea junto con su `service.test.ts`. Los tests cubren: caso feliz, límites del dominio (0, 100, umbrales del GDD), inputs corruptos (NaN, undefined, negativos, strings en campos numéricos). No se abre PR de feature sin tests verdes.

Comandos: `npm run test` (watch), `npm run test:run` (single-shot para CI), `npm run test:ui` (dashboard).

### D6. Claude API en Fase 6 (nota preventiva)

La clave de Claude API **nunca** va en `VITE_*` ni en el bundle del cliente — todas las `VITE_*` son públicas y quedan visibles en DevTools. La Fase 6 debe introducir una Vercel Function (`/api/generate-event`) que actúe de proxy: el cliente llama a la edge function y es ésta la que habla con `api.anthropic.com`.

El tipo `NarrativeEvent` ya trae los campos opcionales que la generación necesitará (`source`, `generatedAt`, `promptSeed`, `model`) y `SaveFile.generatedEvents` persiste el cuerpo completo de los eventos generados. Los helpers `registerGeneratedEvent` / `hydrateGeneratedEvents` en `dataService` conectan la cache runtime con `getRandomEvent`. No hace falta tocar esas interfaces en Fase 6.

El rewrite de `vercel.json` ya exceptúa `/api`, `/data` y `/assets` del SPA fallback.
