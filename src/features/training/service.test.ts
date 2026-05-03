import { describe, it, expect } from 'vitest'
import { calcGain, detectTensions, resolveWeekEffects } from './service'
import type { ActivityId, WeekSchedule } from './types'
import type { SkaterData } from '@/types'
import type { SeasonData, WeekSummary, CompetitionSlot } from '@/types'
import { DEFAULT_SKATER_DATA } from '@/types'
import { DEFAULT_SEASON_DATA } from '@/types'

// ─── fixtures ─────────────────────────────────────────────────────────────────

function makeSchedule(activities: Array<ActivityId | null>): WeekSchedule {
  return {
    skaterId: 'test',
    slots: activities.map((a, i) => ({ index: i, activityId: a })),
  }
}

function makeWeek(semana: number, ranuras: string[], vinculoDelta = 0): WeekSummary {
  return {
    semana,
    fase: 'Construccion',
    ranuraEjecutadas: ranuras,
    vinculoDelta,
    fatigueDelta: 0,
    stresDelta: 0,
    eventoNarrativoId: null,
    competicionResultadoId: null,
  }
}

function makeComp(semana: number): CompetitionSlot {
  return { semana, nombreCompeticion: 'Test GP', tipo: 'grandprix', clasificado: true }
}

const emptySchedule = makeSchedule([null, null, null, null, null])
const deterministicRng = () => 0  // always picks minimum of any range

// ─── calcGain ─────────────────────────────────────────────────────────────────

describe('calcGain', () => {
  it('returns 0 when at potential ceiling', () => {
    expect(calcGain(80, 80)).toBe(0)
  })

  it('returns positive gain when headroom exists', () => {
    expect(calcGain(40, 80)).toBeGreaterThan(0)
  })

  it('never returns a negative value', () => {
    expect(calcGain(100, 50)).toBe(0)
  })
})

// ─── detectTensions ───────────────────────────────────────────────────────────

describe('detectTensions — tecnico_vs_descanso', () => {
  it('fires after 5 consecutive weeks without descanso', () => {
    const historial = [1, 2, 3, 4].map(n => makeWeek(n, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico']))
    const schedule = makeSchedule(['tecnico', null, null, null, null])
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 5, historialSemanas: historial }

    expect(detectTensions(schedule, historial, season)).toContain('tecnico_vs_descanso')
  })

  it('does not fire when current schedule contains descanso', () => {
    const historial = [1, 2, 3, 4, 5].map(n => makeWeek(n, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico']))
    const schedule = makeSchedule(['descanso', null, null, null, null])
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 6, historialSemanas: historial }

    expect(detectTensions(schedule, historial, season)).not.toContain('tecnico_vs_descanso')
  })

  it('does not fire with only 4 consecutive weeks without descanso', () => {
    const historial = [1, 2, 3].map(n => makeWeek(n, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico']))
    const schedule = makeSchedule(['tecnico', null, null, null, null])
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 4, historialSemanas: historial }

    expect(detectTensions(schedule, historial, season)).not.toContain('tecnico_vs_descanso')
  })
})

describe('detectTensions — ensayo_vs_pre_competicion', () => {
  it('fires when <2 ensayo slots in 3-week pre-competition window', () => {
    const historial = [makeWeek(1, ['fisico', 'fisico', 'fisico', 'fisico', 'fisico'])]
    const season: SeasonData = {
      ...DEFAULT_SEASON_DATA,
      semanaActual: 2,
      historialSemanas: historial,
      calendario: [makeComp(4)],  // competition in 2 weeks
    }
    const schedule = makeSchedule(['fisico', null, null, null, null])  // no ensayo

    expect(detectTensions(schedule, historial, season)).toContain('ensayo_vs_pre_competicion')
  })

  it('does not fire when no upcoming competition within 3 weeks', () => {
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 1, calendario: [makeComp(10)] }

    expect(detectTensions(emptySchedule, [], season)).not.toContain('ensayo_vs_pre_competicion')
  })

  it('does not fire when ≥2 ensayo slots are already planned', () => {
    const season: SeasonData = {
      ...DEFAULT_SEASON_DATA,
      semanaActual: 1,
      historialSemanas: [],
      calendario: [makeComp(3)],
    }
    const schedule = makeSchedule(['ensayo', 'ensayo', null, null, null])

    expect(detectTensions(schedule, [], season)).not.toContain('ensayo_vs_pre_competicion')
  })
})

describe('detectTensions — dialogo_vs_hielo', () => {
  it('fires after ≥3 consecutive weeks without dialogo and vinculo declining', () => {
    const historial = [
      makeWeek(1, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'], -2),
      makeWeek(2, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'], -3),
    ]
    const schedule = makeSchedule(['fisico', null, null, null, null])
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 3, historialSemanas: historial }

    expect(detectTensions(schedule, historial, season)).toContain('dialogo_vs_hielo')
  })

  it('does not fire when current schedule has dialogo', () => {
    const historial = [
      makeWeek(1, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'], -2),
      makeWeek(2, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'], -3),
    ]
    const schedule = makeSchedule(['dialogo', null, null, null, null])
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 3, historialSemanas: historial }

    expect(detectTensions(schedule, historial, season)).not.toContain('dialogo_vs_hielo')
  })

  it('does not fire when vinculo is not declining', () => {
    const historial = [
      makeWeek(1, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'], 0),
      makeWeek(2, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'], 1),
    ]
    const schedule = makeSchedule(['fisico', null, null, null, null])
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 3, historialSemanas: historial }

    expect(detectTensions(schedule, historial, season)).not.toContain('dialogo_vs_hielo')
  })

  it('does not fire when one negative week is offset by a positive trend', () => {
    // tendencia agregada positiva: una semana de -2 seguida de +5 +5 → trend = +8
    const historial = [
      makeWeek(1, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'], -2),
      makeWeek(2, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'],  5),
      makeWeek(3, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'],  5),
    ]
    const schedule = makeSchedule(['fisico', null, null, null, null])
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 4, historialSemanas: historial }

    expect(detectTensions(schedule, historial, season)).not.toContain('dialogo_vs_hielo')
  })

  it('still fires when an isolated positive week sits inside a declining trend', () => {
    // un evento positivo aislado no debe ocultar la tendencia general -3 +1 -3 = -5
    const historial = [
      makeWeek(1, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'], -3),
      makeWeek(2, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'],  1),
      makeWeek(3, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'], -3),
    ]
    const schedule = makeSchedule(['fisico', null, null, null, null])
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 4, historialSemanas: historial }

    expect(detectTensions(schedule, historial, season)).toContain('dialogo_vs_hielo')
  })
})

describe('detectTensions — carga_vs_pico', () => {
  it('fires when total energyCost >75 and competition is next week', () => {
    const season: SeasonData = {
      ...DEFAULT_SEASON_DATA,
      semanaActual: 4,
      calendario: [makeComp(5)],
    }
    // 2 tecnico slots = 2×60 = 120 > 75
    const schedule = makeSchedule(['tecnico', 'tecnico', null, null, null])

    expect(detectTensions(schedule, [], season)).toContain('carga_vs_pico')
  })

  it('does not fire when competition is not immediately next week', () => {
    const season: SeasonData = {
      ...DEFAULT_SEASON_DATA,
      semanaActual: 4,
      calendario: [makeComp(7)],  // 3 weeks ahead
    }
    const schedule = makeSchedule(['tecnico', 'tecnico', null, null, null])

    expect(detectTensions(schedule, [], season)).not.toContain('carga_vs_pico')
  })

  it('does not fire when load is ≤75', () => {
    const season: SeasonData = {
      ...DEFAULT_SEASON_DATA,
      semanaActual: 4,
      calendario: [makeComp(5)],
    }
    // 1 fisico (40) + 1 descanso (10) = 50 ≤ 75
    const schedule = makeSchedule(['fisico', 'descanso', null, null, null])

    expect(detectTensions(schedule, [], season)).not.toContain('carga_vs_pico')
  })
})

describe('detectTensions — ensayo_vs_espontaneidad', () => {
  it('fires after >4 consecutive ensayo slots without tecnico or dialogo', () => {
    const historial = [makeWeek(1, ['ensayo', 'ensayo', 'ensayo', 'ensayo'])]
    const schedule = makeSchedule(['ensayo', null, null, null, null])
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 2, historialSemanas: historial }

    expect(detectTensions(schedule, historial, season)).toContain('ensayo_vs_espontaneidad')
  })

  it('does not fire when tecnico appears in recent slots', () => {
    // tecnico in the middle of the recent slots breaks the ensayo streak
    const historial = [makeWeek(1, ['ensayo', 'ensayo', 'tecnico', 'ensayo', 'ensayo'])]
    const schedule = makeSchedule(['ensayo', null, null, null, null])

    // From end: ensayo (schedule) + ensayo×2 (history) → tecnico breaks = count 3, not >4
    expect(detectTensions(schedule, historial, DEFAULT_SEASON_DATA)).not.toContain('ensayo_vs_espontaneidad')
  })

  it('does not fire with only 4 ensayo slots in sequence', () => {
    const historial = [makeWeek(1, ['ensayo', 'ensayo', 'ensayo'])]
    const schedule = makeSchedule(['ensayo', null, null, null, null])

    expect(detectTensions(schedule, historial, DEFAULT_SEASON_DATA)).not.toContain('ensayo_vs_espontaneidad')
  })
})

describe('detectTensions — paradoja_descanso_emocional', () => {
  it('fires when descanso is present and skater estres ≥ 70', () => {
    const schedule = makeSchedule(['descanso', 'tecnico', null, null, null])

    expect(detectTensions(schedule, [], DEFAULT_SEASON_DATA, 75)).toContain('paradoja_descanso_emocional')
  })

  it('does not fire when estres < 70', () => {
    const schedule = makeSchedule(['descanso', null, null, null, null])

    expect(detectTensions(schedule, [], DEFAULT_SEASON_DATA, 69)).not.toContain('paradoja_descanso_emocional')
  })

  it('does not fire when descanso is absent even with high estres', () => {
    const schedule = makeSchedule(['tecnico', null, null, null, null])

    expect(detectTensions(schedule, [], DEFAULT_SEASON_DATA, 90)).not.toContain('paradoja_descanso_emocional')
  })
})

// ─── resolveWeekEffects ───────────────────────────────────────────────────────

describe('resolveWeekEffects', () => {
  it('returns neutral effects for empty schedule', () => {
    const effects = resolveWeekEffects(emptySchedule, DEFAULT_SKATER_DATA, DEFAULT_SEASON_DATA, {}, deterministicRng)

    expect(effects.fatigueDelta).toBe(0)
    expect(effects.stressDelta).toBe(0)
    expect(effects.bondDelta).toBe(0)
    expect(effects.cohesionDelta).toBe(0)
    expect(Object.keys(effects.attributeGains)).toHaveLength(0)
    expect(effects.tensionsTriggered).toHaveLength(0)
    expect(effects.eventSeeds).toHaveLength(0)
  })

  it('applies bondDelta from dialogo but not from tecnico', () => {
    const scheduleDialogo = makeSchedule(['dialogo', null, null, null, null])
    const effectsDialogo = resolveWeekEffects(scheduleDialogo, DEFAULT_SKATER_DATA, DEFAULT_SEASON_DATA, {}, deterministicRng)
    expect(effectsDialogo.bondDelta).toBeGreaterThan(0)

    const scheduleTecnico = makeSchedule(['tecnico', null, null, null, null])
    const effectsTecnico = resolveWeekEffects(scheduleTecnico, DEFAULT_SKATER_DATA, DEFAULT_SEASON_DATA, {}, deterministicRng)
    expect(effectsTecnico.bondDelta).toBe(0)
  })

  it('adds pistaPrincipal nivel 3 bonus to saltos per tecnico slot', () => {
    const schedule = makeSchedule(['tecnico', null, null, null, null])

    const withBonus    = resolveWeekEffects(schedule, DEFAULT_SKATER_DATA, DEFAULT_SEASON_DATA, { pistaPrincipal: 3 }, deterministicRng)
    const withoutBonus = resolveWeekEffects(schedule, DEFAULT_SKATER_DATA, DEFAULT_SEASON_DATA, {}, deterministicRng)

    expect(withBonus.attributeGains.saltos).toBe((withoutBonus.attributeGains.saltos ?? 0) + 1)
  })

  it('blocks attribute gains when fatigaAcumulada exceeds threshold', () => {
    const tiredSkater: SkaterData = {
      ...DEFAULT_SKATER_DATA,
      weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, fatigaAcumulada: 80 },
    }
    const schedule = makeSchedule(['tecnico', null, null, null, null])
    const effects = resolveWeekEffects(schedule, tiredSkater, DEFAULT_SEASON_DATA, {}, deterministicRng)

    expect(Object.keys(effects.attributeGains)).toHaveLength(0)
  })

  it('seeds hielo_de_noche when paradoja_descanso_emocional fires', () => {
    const stressedSkater: SkaterData = {
      ...DEFAULT_SKATER_DATA,
      weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, estres: 75 },
    }
    const schedule = makeSchedule(['descanso', null, null, null, null])
    const effects = resolveWeekEffects(schedule, stressedSkater, DEFAULT_SEASON_DATA, {}, deterministicRng)

    expect(effects.eventSeeds).toContain('hielo_de_noche')
    expect(effects.tensionsTriggered).toContain('paradoja_descanso_emocional')
  })

  it('seeds cuerpo_al_limite when tecnico_vs_descanso fires', () => {
    const historial = [1, 2, 3, 4].map(n => makeWeek(n, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico']))
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 5, historialSemanas: historial }
    const schedule = makeSchedule(['tecnico', null, null, null, null])

    const effects = resolveWeekEffects(schedule, DEFAULT_SKATER_DATA, season, {}, deterministicRng)

    expect(effects.tensionsTriggered).toContain('tecnico_vs_descanso')
    expect(effects.eventSeeds).toContain('cuerpo_al_limite')
  })

  it('seeds piernas_pesadas when carga_vs_pico fires', () => {
    const season: SeasonData = {
      ...DEFAULT_SEASON_DATA,
      semanaActual: 4,
      calendario: [makeComp(5)],
    }
    // 2 técnicos = 120 energy > 75 y competición la próxima semana
    const schedule = makeSchedule(['tecnico', 'tecnico', null, null, null])

    const effects = resolveWeekEffects(schedule, DEFAULT_SKATER_DATA, season, {}, deterministicRng)

    expect(effects.tensionsTriggered).toContain('carga_vs_pico')
    expect(effects.eventSeeds).toContain('piernas_pesadas')
  })

  it('emits one seed per triggered tension', () => {
    // historial montado para activar dos tensiones simultáneas:
    // tecnico_vs_descanso (5 sem sin descanso) y ensayo_vs_espontaneidad (>4 ensayos)
    const historial = [
      makeWeek(1, ['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico']),
      makeWeek(2, ['ensayo', 'ensayo', 'ensayo', 'ensayo', 'ensayo']),
      makeWeek(3, ['ensayo']),
      makeWeek(4, ['ensayo']),
    ]
    const season = { ...DEFAULT_SEASON_DATA, semanaActual: 5, historialSemanas: historial }
    const schedule = makeSchedule(['ensayo', null, null, null, null])

    const effects = resolveWeekEffects(schedule, DEFAULT_SKATER_DATA, season, {}, deterministicRng)

    expect(effects.tensionsTriggered).toContain('tecnico_vs_descanso')
    expect(effects.tensionsTriggered).toContain('ensayo_vs_espontaneidad')
    expect(effects.eventSeeds).toContain('cuerpo_al_limite')
    expect(effects.eventSeeds).toContain('rutina_estancada')
    expect(effects.eventSeeds).toHaveLength(effects.tensionsTriggered.length)
  })

  it('accumulates fatigue across multiple slots', () => {
    // 5 tecnico slots → fatigue = 5 × 8 = 40 (minimum with rng=0)
    const schedule = makeSchedule(['tecnico', 'tecnico', 'tecnico', 'tecnico', 'tecnico'])
    const effects = resolveWeekEffects(schedule, DEFAULT_SKATER_DATA, DEFAULT_SEASON_DATA, {}, deterministicRng)

    expect(effects.fatigueDelta).toBe(40)
  })
})
