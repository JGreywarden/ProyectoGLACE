# GLACÉ

> Manager narrativo de patinaje artístico sobre hielo. Nordic Noir sobre hielo.

GLACÉ pone al jugador en la piel de un entrenador a lo largo de una carrera completa. Los resultados deportivos son consecuencia de las relaciones que construye con sus patinadores, no el objetivo. Una intersección entre **Football Manager** (profundidad simulativa), **Hades / Persona** (relaciones con NPCs, historia emergente) y **This War of Mine** (consecuencias morales de decisiones simuladas).

- **Plataforma:** navegador (versión gratuita) + Steam vía Electron/Tauri (versión comercial)
- **Sesión objetivo:** 20-40 minutos
- **Sin instalación. Sin login.**
- **Resolución de referencia:** 1440×900 (adaptable 1280×720 → 1920×1080)

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript 5.x (strict) |
| UI | React 18 + React Router v6 |
| Estilos | Tailwind CSS v3 + CSS custom properties |
| Estado | Zustand v5 (un store por feature) |
| Eventos cross-feature | mitt (bus tipado) |
| Cómputo pesado | Web Workers (motor de competición) |
| Bundler | Vite 6 |
| Tests | Vitest + Testing Library |
| Despliegue | Vercel (SPA) |

---

## Arquitectura

Organización **feature-first**: cada dominio del juego vive en `src/features/<feature>/` con su propio `service.ts` (lógica pura), `store.ts` (Zustand), `types.ts`, tests y barrel export.

```
src/
  components/        # ui/ (átomos del design system) + layout/ (shell persistente)
  features/          # training, athlete, competition, program, club, economy,
                     # scouting, calendar, coach, legacy
  hooks/             # hooks reutilizables cross-feature
  lib/events.ts      # mitt bus singleton tipado
  pages/             # componentes de ruta
  router/            # React Router config
  services/          # lógica cross-feature sin React (dataService, saveService…)
  stores/gameStore.ts# reloj global (week/season/phase)
  types/             # tipos de dominio compartidos
  utils/             # puros, sin dependencias del proyecto (safeStorage, validation…)
  workers/           # competitionWorker.ts
```

**Reglas de dependencia:**

- `pages/` y `components/` importan de `features/`, nunca al revés.
- `features/*/service.ts` no importa React.
- Imports entre features: solo a través de su `index.ts`.
- El motor de competición corre en Web Worker desde el día 1.

Ver [CLAUDE.md](CLAUDE.md) para el detalle completo de normas, vocabulario de dominio y patrones establecidos.

---

## Comenzar

Requisitos: Node.js 20+ y npm.

```bash
npm install
npm run dev          # arranca Vite en modo desarrollo
npm run build        # type-check + build de producción
npm run preview      # sirve el build local
npm run type-check   # solo TypeScript, sin emitir
npm run test         # Vitest en watch
npm run test:run     # single-shot (CI)
npm run test:ui      # dashboard de Vitest
```

Alias configurado: `@` → `src/`.

---

## Estado del proyecto

Fase 0 (cimientos) completada en abril 2026. Patrones obligatorios desde ahora:

- **Validación runtime en frontera** — todo dato externo (`localStorage`, `fetch('/data/...')`, API) pasa por un `validateXxxData` con rangos de dominio antes de entrar a un store. Nada de `as`.
- **Storage seguro** — nunca `localStorage` directo; siempre `@/utils/safeStorage`. Un fallo de storage no rompe el bootstrap.
- **Atomicidad cross-store** — mutaciones que tocan varias entidades pasan por `gameStore.applyWeekTransition` u otra acción compuesta.
- **Selectores específicos en Zustand** — `useStore(s => s.campo)`, nunca el objeto entero. `useShallow` para selecciones compuestas.
- **Tests junto al código** — cada `service.ts` se commitea con su `service.test.ts`. Casos feliz + límites + inputs corruptos.

### Roadmap

1. Fórmulas matemáticas exactas (curvas de progresión, TES/PCS, economía).
2. Tipos TypeScript base.
3. Motor de competición en Web Worker.
4. Sistema de entrenamiento (5 ranuras × 6 actividades × 6 tensiones).
5. Vínculo y narrativa (eventos, revelación de rasgos, mutaciones).
6. Persistencia incremental.
7. 200-300 eventos narrativos.
8. NPCs del circuito rival (50-100).
9. Pantallas adicionales (economía, scouting, diseñador de programas, panel de jueces, gala, legado).

---

## Paleta y tipografía

Tema Nordic Noir definido como CSS custom properties en `src/index.css`. Fondos entre `#0c1220` y `#1e2d46`, acentos **ice blue** (`--c-ice-*`) para acción primaria y **frost teal** (`--c-frost-*`) para logros. Colores semánticos de juego: **technical** (azul), **human** (dorado cálido), **bond** (púrpura).

Dos familias tipográficas:

- **DM Sans** — UI, datos, menús.
- **Cormorant Garamond** — exclusivamente momentos narrativos (título de evento, ficha del patinador, puntuación final, títulos de las 5 pantallas principales).

---

## Licencia

Propietario — todos los derechos reservados.
