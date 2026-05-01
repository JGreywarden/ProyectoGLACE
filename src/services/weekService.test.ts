// integration tests for weekService.runWeek — validate the pipeline composes
// training + athlete + narrative + economy atomically without mutating inputs.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// competition must be mocked before weekService is imported, otherwise the
// Web Worker constructor reaches for a URL that vitest/jsdom cannot resolve.
vi.mock('@/features/competition', () => ({
  runCompetition:       vi.fn(),
  runProgramSimulation: vi.fn(),
}))

import { runCompetition, runProgramSimulation } from '@/features/competition'
import { runWeek, runWeekWithPool } from './weekService'
import type { WeekContext } from './weekService'
import { applyEventEffect } from '@/features/narrative'
import type { NarrativeEvent } from '@/features/narrative'
import type { WeekSchedule } from '@/features/training'
import type { SkaterData, SkaterTrait } from '@/types'
import { DEFAULT_SKATER_DATA } from '@/types'
import type { CoachData } from '@/types'
import { DEFAULT_COACH_DATA } from '@/types'
import type { ClubData } from '@/types'
import { DEFAULT_CLUB_DATA } from '@/types'
import type { SeasonData } from '@/types'
import { DEFAULT_SEASON_DATA } from '@/types'
import type { ProgramData } from '@/types'
import { DEFAULT_PROGRAM_DATA } from '@/types'
import { generateRivalPool, COMPETITION_FIELD_SIZE } from '@/features/rivals'

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
  vi.mocked(runProgramSimulation).mockReset()
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
  it('invoca runProgramSimulation y registra el resultado en la temporada', async () => {
    // mocked free-skate simulation; SP omitted in this scenario
    vi.mocked(runProgramSimulation).mockResolvedValue({
      elements: [],
      score: {
        programType: 'libre',
        elements:    [],
        tes:         60,
        pcs:         45,
        pcsDetalle:  { sk: 9, tr: 9, pe: 9, co: 9, in: 9 },
        caidas:      0,
        deducciones: 0,
        total:       105,
      },
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

    // SP not registered in this test → only one program simulation
    expect(runProgramSimulation).toHaveBeenCalledOnce()
    expect(result.competitionResult).not.toBeNull()
    expect(result.competitionResult?.total).toBe(105)
    // la competición bloquea la selección de eventos semanales
    expect(result.triggeredEvent).toBeNull()
    // resultado registrado en season.resultadosTemporada
    expect(result.season.resultadosTemporada).toHaveLength(1)
    expect(result.season.resultadosTemporada[0]?.id).toBe(
      result.competitionResult?.id,
    )
    // sin pool de rivales, la posición se mantiene en 1 (jugador solo)
    expect(result.competitionResult?.posicion).toBe(1)
    // desglose económico por competición disponible y consistente
    expect(result.competitionResult?.economiaDetalle).not.toBeNull()
    expect(result.competitionResult?.economiaDetalle?.gastoViaje).toBeGreaterThan(0)
    // economyBreakdown contiene una línea por gasto de viaje del evento
    expect(result.economyBreakdown.gastos.some(l => l.label.startsWith('viaje'))).toBe(true)
    // y una línea por premio si el jugador entró en el podio (1º en este caso)
    expect(result.economyBreakdown.ingresos.some(l => l.label.startsWith('premio'))).toBe(true)
  })
})

describe('runWeek — C2: clasificación con pool de rivales', () => {
  it('produce una clasificación que incluye al jugador y a los rivales del cuadro', async () => {
    // SP + FP devuelven la misma puntuación moderada — el jugador no estará 1º
    vi.mocked(runProgramSimulation).mockResolvedValue({
      elements: [],
      score: {
        programType: 'libre',
        elements:    [],
        tes:         50,
        pcs:         40,
        pcsDetalle:  { sk: 8, tr: 8, pe: 8, co: 8, in: 8 },
        caidas:      0,
        deducciones: 0,
        total:       90,
      },
    })

    const season = makeSeason({
      semanaActual: 8,
      faseActual:   'Construccion',
      calendario: [{
        semana:            8,
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
      programLibre: makeProgram(),
      rivalsPool:   generateRivalPool(season.temporadaNumero, () => 0.5),
    })

    const result = await runWeek(ctx, () => 0.5)

    expect(result.competitionResult).not.toBeNull()
    const cls = result.competitionResult!.clasificacion
    expect(cls).toBeDefined()
    expect(cls!.length).toBe(COMPETITION_FIELD_SIZE.nacional)
    // posiciones consecutivas comenzando en 1
    expect(cls!.map(c => c.posicion)).toEqual(
      Array.from({ length: cls!.length }, (_, i) => i + 1),
    )
    // el jugador aparece exactamente una vez
    expect(cls!.filter(c => c.esJugador).length).toBe(1)
    const playerPos = cls!.find(c => c.esJugador)!.posicion
    expect(result.competitionResult!.posicion).toBe(playerPos)
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

describe('runWeek — E2: lesiones', () => {
  it('inyecta una nueva lesión cuando el roll cae bajo la probabilidad', async () => {
    // patinador frágil + carga alta + injuryRoll = 0 garantiza que
    // resolveWeekEffects produzca un disparador por debajo de cualquier umbral.
    const fragile: SkaterTrait = { id: 'cuerpo-fragil', active: true, mutated: null }
    const skater = makeSkater({
      physical: {
        techosBiologico: 80,
        historialLesiones: 90,  // amplificación exponencial
        velocidadRecuperacion: 60,
      },
      traits: [fragile],
    })
    const ctx = makeContext({
      skater,
      schedule: schedule(['tecnico', 'tecnico', 'fisico', 'ensayo', null]),
    })

    // rng constante a 0 → effects.injuryRoll === 0 → siempre dispara la lesión
    const result = await runWeek(ctx, fixedRng(0))
    expect(result.newInjurySeverity).not.toBeNull()
    expect(result.skater.weeklyState.currentInjury).not.toBeNull()
  })

  it('una lesión grave activa salta la competición programada', async () => {
    const skater = makeSkater({
      weeklyState: {
        ...DEFAULT_SKATER_DATA.weeklyState,
        currentInjury: {
          injuredAtWeek: 5,
          recoveryWeeksTotal: 12,
          recoveryWeeksRemaining: 12,
          severity: 'grave',
        },
      },
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
      skater, season,
      narrativeContext: {
        skater, season,
        narrativeFlags: {},
        emittedEvents:  [],
      },
      programLibre: makeProgram(),
    })

    const result = await runWeek(ctx, fixedRng(0.5))
    expect(result.competitionSkippedByInjury).toBe(true)
    expect(result.competitionResult).toBeNull()
    // la lesión sigue activa con una semana menos
    expect(result.skater.weeklyState.currentInjury?.recoveryWeeksRemaining).toBe(11)
  })

  it('al finalizar la última semana de recuperación, historialLesiones aumenta', async () => {
    const skater = makeSkater({
      physical: {
        techosBiologico: 80,
        historialLesiones: 20,
        velocidadRecuperacion: 60,
      },
      weeklyState: {
        ...DEFAULT_SKATER_DATA.weeklyState,
        currentInjury: {
          injuredAtWeek: 4,
          recoveryWeeksTotal: 1,
          recoveryWeeksRemaining: 1,
          severity: 'moderada',
        },
      },
    })
    const ctx = makeContext({
      skater,
      schedule: schedule(['mental', 'descanso', 'dialogo', null, null]),
    })
    const result = await runWeek(ctx, fixedRng(0.5))
    expect(result.recoveredFromSeverity).toBe('moderada')
    expect(result.skater.weeklyState.currentInjury).toBeNull()
    expect(result.skater.physical.historialLesiones).toBe(20 + 12)
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
