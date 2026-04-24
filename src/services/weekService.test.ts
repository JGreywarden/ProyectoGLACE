// integration tests for weekService.runWeek — validate the pipeline composes
// training + athlete + narrative + economy atomically without mutating inputs.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// competition must be mocked before weekService is imported, otherwise the
// Web Worker constructor reaches for a URL that vitest/jsdom cannot resolve.
vi.mock('@/features/competition', () => ({
  runCompetition: vi.fn(),
}))

import { runCompetition } from '@/features/competition'
import { runWeek, runWeekWithPool } from './weekService'
import type { WeekContext } from './weekService'
import { applyEventEffect } from '@/features/narrative'
import type { NarrativeEvent } from '@/features/narrative'
import type { WeekSchedule } from '@/features/training'
import type { SkaterData, SkaterTrait } from '@/types/skater'
import { DEFAULT_SKATER_DATA } from '@/types/skater'
import type { CoachData } from '@/types/coach'
import { DEFAULT_COACH_DATA } from '@/types/coach'
import type { ClubData } from '@/types/club'
import { DEFAULT_CLUB_DATA } from '@/types/club'
import type { SeasonData } from '@/types/season'
import { DEFAULT_SEASON_DATA } from '@/types/season'
import type { ProgramData } from '@/types/program'
import { DEFAULT_PROGRAM_DATA } from '@/types/program'

// ─── fixture helpers ──────────────────────────────────────────────────────────

/** deterministic RNG that returns a constant — good enough for shape assertions */
function fixedRng(value = 0.5): () => number {
  return () => value
}

function makeSkater(overrides: Partial<SkaterData> = {}): SkaterData {
  return {
    ...DEFAULT_SKATER_DATA,
    id: 'sk-1',
    name: 'Test Skater',
    ...overrides,
    weeklyState: {
      ...DEFAULT_SKATER_DATA.weeklyState,
      ...(overrides.weeklyState ?? {}),
    },
  }
}

function makeClub(overrides: Partial<ClubData> = {}): ClubData {
  return {
    ...DEFAULT_CLUB_DATA,
    id: 'club-1',
    nombre: 'Club de prueba',
    instalaciones: DEFAULT_CLUB_DATA.instalaciones.map(i => ({ ...i })),
    sponsors:      DEFAULT_CLUB_DATA.sponsors.map(s => ({ ...s })),
    reputacion:    { ...DEFAULT_CLUB_DATA.reputacion },
    ...overrides,
  }
}

function makeSeason(overrides: Partial<SeasonData> = {}): SeasonData {
  return {
    ...DEFAULT_SEASON_DATA,
    temporadaNumero: 1,
    calendario:          [],
    resultadosTemporada: [],
    historialSemanas:    [],
    ...overrides,
  }
}

function makeCoach(): CoachData {
  return { ...DEFAULT_COACH_DATA, id: 'coach-1', name: 'Test Coach' }
}

function makeProgram(): ProgramData {
  return {
    ...DEFAULT_PROGRAM_DATA,
    id: 'prog-1',
    skaterId: 'sk-1',
    tituloProgramatico: 'Prueba',
    musicaGenero: 'clásica',
  }
}

function schedule(activityIds: (string | null)[]): WeekSchedule {
  return {
    skaterId: 'sk-1',
    slots: activityIds.map((id, index) => ({
      index,
      activityId: id as WeekSchedule['slots'][number]['activityId'],
    })),
  }
}

function makeContext(overrides: Partial<WeekContext> = {}): WeekContext {
  return {
    skater:  makeSkater(),
    coach:   makeCoach(),
    club:    makeClub(),
    season:  makeSeason(),
    schedule: schedule(['tecnico', 'tecnico', 'ensayo', 'descanso', 'dialogo']),
    narrativeContext: {
      skater:         makeSkater(),
      season:         makeSeason(),
      narrativeFlags: {},
      emittedEvents:  [],
    },
    allTraits: [],
    allJudges: [],
    program:   null,
    installationsCatalog: [],
    ...overrides,
  }
}

// ─── scenarios ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(runCompetition).mockReset()
})

describe('runWeek — A: semana normal sin competición ni evento', () => {
  it('suma ganancias técnicas y no decae vínculo cuando hay diálogo', async () => {
    const skater = makeSkater({
      weeklyState: {
        ...DEFAULT_SKATER_DATA.weeklyState,
        vinculo: 50,
      },
    })
    const ctx = makeContext({
      skater,
      narrativeContext: {
        skater,
        season:         makeSeason(),
        narrativeFlags: {},
        emittedEvents:  [],
      },
    })

    const result = await runWeek(ctx, fixedRng(0.5))

    // saltos/giros/pasos debe haberse movido al alza tras 2 Técnicos
    const totalTechDelta =
      result.skater.technical.saltos           - skater.technical.saltos +
      result.skater.technical.giros            - skater.technical.giros +
      result.skater.technical.secuenciaDePasos - skater.technical.secuenciaDePasos
    expect(totalTechDelta).toBeGreaterThan(0)

    // Diálogo presente → applyBondDecay no decae
    expect(result.skater.weeklyState.vinculo).toBeGreaterThanOrEqual(50)

    // sin competición ni evento
    expect(result.competitionResult).toBeNull()
    expect(result.triggeredEvent).toBeNull()

    // semana avanzada y summary registrado
    expect(result.season.semanaActual).toBe(2)
    expect(result.season.historialSemanas).toHaveLength(1)
  })
})

describe('runWeek — B: evento narrativo disparado', () => {
  it('selecciona un evento del pool cuando las condiciones se satisfacen', async () => {
    const event: NarrativeEvent = {
      id:     'ev-test',
      tipo:   'cotidiano',
      titulo: 'Un momento',
      descripcion: 'descripción',
      condiciones: {}, // sin condiciones → siempre aplicable
      opciones: [
        { id: 'a', texto: 'ok', efectos: { vinculoDelta: 1 } },
      ],
    }

    const ctx = makeContext()
    const result = await runWeekWithPool(ctx, [event], fixedRng(0.1))

    expect(result.triggeredEvent).not.toBeNull()
    expect(result.triggeredEvent?.id).toBe('ev-test')
    expect(result.weekSummary.eventoNarrativoId).toBe('ev-test')
  })
})

describe('runWeek — C: semana de competición', () => {
  it('invoca runCompetition y registra el resultado en la temporada', async () => {
    vi.mocked(runCompetition).mockResolvedValue({
      tes:         60,
      pcs:         45,
      pcsDetalle:  { sk: 9, tr: 9, pe: 9, co: 9, in: 9 },
      total:       105,
      caidas:      0,
      deducciones: 0,
    })

    const season = makeSeason({
      semanaActual: 10,
      faseActual:   'Activacion',
      calendario: [{
        semana:            10,
        nombreCompeticion: 'Nacional Test',
        tipo:              'nacional',
        clasificado:       true,
      }],
    })
    const ctx = makeContext({
      season,
      narrativeContext: {
        skater:         makeSkater(),
        season,
        narrativeFlags: {},
        emittedEvents:  [],
      },
      program: makeProgram(),
    })

    const result = await runWeek(ctx, fixedRng(0.5))

    expect(runCompetition).toHaveBeenCalledOnce()
    expect(result.competitionResult).not.toBeNull()
    expect(result.competitionResult?.total).toBe(105)
    // la competición bloquea la selección de eventos semanales
    expect(result.triggeredEvent).toBeNull()
    // resultado registrado en season.resultadosTemporada
    expect(result.season.resultadosTemporada).toHaveLength(1)
    expect(result.season.resultadosTemporada[0]?.id).toBe(
      result.competitionResult?.id,
    )
  })
})

describe('runWeek — D: crisis financiera', () => {
  it('detecta pressureState=crisis y añade el castigo de estrés', async () => {
    // reservas bajas y sin instalaciones: weeklyExpenses = WEEKLY_EXPENSE_BASE = 1500
    // 2000 / 1500 ≈ 1.33 semanas de cobertura → crisis (< 2)
    const startingEstres = 20
    const buildCtx = (reservas: number) => {
      const club = makeClub({ presupuestoReservas: reservas })
      const skater = makeSkater({
        weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, estres: startingEstres },
      })
      return makeContext({ skater, club })
    }

    const crisis   = await runWeek(buildCtx(2_000),  fixedRng(0.5))
    const estable  = await runWeek(buildCtx(500_000), fixedRng(0.5))

    expect(crisis.pressureState).toBe('crisis')
    expect(estable.pressureState).toBe('estable')
    // la diferencia de estrés entre ambos corresponde al castigo de crisis
    // (PRESION_CRISIS_STRESS_WEEKLY = 5), siendo idénticos los demás factores
    expect(
      crisis.skater.weeklyState.estres - estable.skater.weeklyState.estres,
    ).toBeGreaterThanOrEqual(5)
  })
})

describe('runWeek — E: no muta los inputs', () => {
  it('mantiene intactos los objetos originales de ctx tras ejecutar', async () => {
    const skater = makeSkater({
      weeklyState: {
        ...DEFAULT_SKATER_DATA.weeklyState,
        vinculo: 40,
        estres:  30,
      },
    })
    const club = makeClub({ presupuestoReservas: 40_000 })
    const season = makeSeason()
    const ctx = makeContext({ skater, club, season })

    // snapshots profundos de los campos mutables relevantes
    const skaterSnap  = structuredClone(ctx.skater)
    const clubSnap    = structuredClone(ctx.club)
    const seasonSnap  = structuredClone(ctx.season)

    await runWeek(ctx, fixedRng(0.5))

    expect(ctx.skater).toEqual(skaterSnap)
    expect(ctx.club).toEqual(clubSnap)
    expect(ctx.season).toEqual(seasonSnap)
    // identidad del input preservada (el servicio clona, no sustituye)
    expect(ctx.skater).toBe(skater)
    expect(ctx.club).toBe(club)
    expect(ctx.season).toBe(season)
  })
})

describe('runWeek — F: mutación de rasgo', () => {
  it('applyEventEffect resuelve la mutación cuando el rng favorece y rasgoRiesgo existe', async () => {
    const perfeccionista: SkaterTrait = {
      id: 'perfeccionista', active: true, mutated: null,
    }
    const skater = makeSkater({ traits: [perfeccionista] })
    const event: NarrativeEvent = {
      id:     'ev-mut',
      tipo:   'crisis',
      titulo: 'Bajo presión',
      descripcion: 'descripción',
      condiciones: {},
      opciones: [{
        id: 'a',
        texto: 'asumo',
        efectos: {
          estresDelta: 10,
          rasgoRiesgo: 'perfeccionista',
          probabilidadMutacion: 1.0,
        },
      }],
    }

    const ctx = makeContext({
      skater,
      narrativeContext: {
        skater,
        season:         makeSeason(),
        narrativeFlags: {},
        emittedEvents:  [],
      },
    })

    const weekResult = await runWeekWithPool(ctx, [event], fixedRng(0.1))
    expect(weekResult.triggeredEvent?.id).toBe('ev-mut')

    // la resolución de la opción la hace la UI; simulamos ese paso con rng=0
    const outcome = applyEventEffect(
      {
        skater:         weekResult.skater,
        season:         weekResult.season,
        narrativeFlags: {},
        emittedEvents:  [],
      },
      weekResult.triggeredEvent!,
      'a',
      () => 0, // rng<probabilidad ⇒ mutación garantizada
    )

    expect(outcome.mutatedTrait).toBeDefined()
    expect(outcome.mutatedTrait?.from).toBe('perfeccionista')
    expect(outcome.mutatedTrait?.to).toBe('auto-exigencia-destructiva')
  })
})
