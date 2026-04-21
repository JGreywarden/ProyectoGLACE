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
- Imports entre features: solo a través del `index.ts` del otro feature (nunca imports internos cruzados).
- El motor de competición corre en `workers/` — `features/competition/` solo le envía mensajes.

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
