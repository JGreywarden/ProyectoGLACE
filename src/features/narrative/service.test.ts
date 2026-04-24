import { describe, expect, it, vi, afterEach } from 'vitest'

import { DEFAULT_SEASON_DATA } from '@/types/season'
import { DEFAULT_SKATER_DATA } from '@/types/skater'
import type { SkaterData } from '@/types'

import {
  applyEventEffect,
  applyMomentEffect,
  evaluateConditions,
  loadEvents,
  selectCompetitionMoment,
  selectWeeklyEvent,
  validateNarrativeEvent,
} from './service'
import type { NarrativeContext, NarrativeEvent } from './types'

// ─── fixtures ─────────────────────────────────────────────────────────────────

function makeSkater(partial: Partial<SkaterData['weeklyState']> = {}): SkaterData {
  return {
    ...DEFAULT_SKATER_DATA,
    weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, ...partial },
  }
}

function makeContext(overrides: Partial<NarrativeContext> = {}): NarrativeContext {
  return {
    skater:         makeSkater({ vinculo: 50, estres: 30 }),
    season:         { ...DEFAULT_SEASON_DATA, semanaActual: 3 },
    narrativeFlags: {},
    emittedEvents:  [],
    ...overrides,
  }
}

function makeEvent(overrides: Partial<NarrativeEvent> = {}): NarrativeEvent {
  return {
    id:          'e1',
    tipo:        'cotidiano',
    titulo:      'Un día cualquiera',
    descripcion: 'descr',
    condiciones: {},
    opciones: [
      {
        id: 'op1',
        texto: 'hacer algo',
        efectos: { vinculoDelta: 5 },
      },
    ],
    ...overrides,
  }
}

function makeMoment(overrides: Partial<NarrativeEvent> = {}): NarrativeEvent {
  return makeEvent({
    id:      'm1',
    tipo:    'momento_competicion',
    trigger: 'early',
    opciones: [
      {
        id: 'mop1',
        texto: 'gesto',
        efectos: {
          goeDeltaCurrent:    0.3,
          goeDeltaRemaining:  0.05,
          varianzaMultiplier: 0.85,
          bondDelta:          2,
        },
      },
    ],
    ...overrides,
  })
}

// ─── validateNarrativeEvent ───────────────────────────────────────────────────

describe('validateNarrativeEvent', () => {
  it('accepts a minimal valid weekly event', () => {
    expect(validateNarrativeEvent(makeEvent())).toBe(true)
  })

  it('requires trigger on Moments', () => {
    const bad = { ...makeMoment() } as unknown as Record<string, unknown>
    delete bad['trigger']
    expect(validateNarrativeEvent(bad)).toBe(false)
  })

  it('accepts a valid Moment with trigger', () => {
    expect(validateNarrativeEvent(makeMoment())).toBe(true)
  })

  it('rejects probabilidadMutacion out of [0, 1]', () => {
    const bad = makeEvent({
      opciones: [{ id: 'a', texto: 't', efectos: { probabilidadMutacion: 1.5 } }],
    })
    expect(validateNarrativeEvent(bad)).toBe(false)
  })

  it('rejects goeDeltaCurrent out of [-1, 1]', () => {
    const bad = makeMoment({
      opciones: [{ id: 'a', texto: 't', efectos: { goeDeltaCurrent: 1.5 } }],
    })
    expect(validateNarrativeEvent(bad)).toBe(false)
  })

  it('rejects goeDeltaRemaining out of [-0.3, 0.3]', () => {
    const bad = makeMoment({
      opciones: [{ id: 'a', texto: 't', efectos: { goeDeltaRemaining: 0.5 } }],
    })
    expect(validateNarrativeEvent(bad)).toBe(false)
  })

  it('rejects varianzaMultiplier out of [0.5, 2.0]', () => {
    const bad = makeMoment({
      opciones: [{ id: 'a', texto: 't', efectos: { varianzaMultiplier: 3.0 } }],
    })
    expect(validateNarrativeEvent(bad)).toBe(false)
  })

  it('rejects unknown tipo', () => {
    const bad = { ...makeEvent(), tipo: 'bogus' } as unknown
    expect(validateNarrativeEvent(bad)).toBe(false)
  })
})

// ─── evaluateConditions ──────────────────────────────────────────────────────

describe('evaluateConditions', () => {
  it('excludes when minVinculo=40 and skater vinculo=30', () => {
    const ctx = makeContext({ skater: makeSkater({ vinculo: 30 }) })
    const ev = makeEvent({ condiciones: { minVinculo: 40 } })
    expect(evaluateConditions(ev, ctx)).toBe(false)
  })

  it('passes when minVinculo is met', () => {
    const ctx = makeContext({ skater: makeSkater({ vinculo: 50 }) })
    const ev = makeEvent({ condiciones: { minVinculo: 40 } })
    expect(evaluateConditions(ev, ctx)).toBe(true)
  })

  it('excludes when flagsBloqueantes is present in context', () => {
    const ctx = makeContext({ narrativeFlags: { veto_flag: true } })
    const ev = makeEvent({ condiciones: { flagsBloqueantes: ['veto_flag'] } })
    expect(evaluateConditions(ev, ctx)).toBe(false)
  })

  it('passes when flagsBloqueantes is absent', () => {
    const ctx = makeContext({ narrativeFlags: {} })
    const ev = makeEvent({ condiciones: { flagsBloqueantes: ['veto_flag'] } })
    expect(evaluateConditions(ev, ctx)).toBe(true)
  })

  it('excludes when flagsRequeridos is missing', () => {
    const ctx = makeContext({ narrativeFlags: {} })
    const ev = makeEvent({ condiciones: { flagsRequeridos: ['needed'] } })
    expect(evaluateConditions(ev, ctx)).toBe(false)
  })

  it('filters by faseTemporada via semanaActual', () => {
    const ctx = makeContext({
      season: { ...DEFAULT_SEASON_DATA, semanaActual: 29 },
    })
    const ev = makeEvent({ condiciones: { faseTemporada: ['Construccion'] } })
    expect(evaluateConditions(ev, ctx)).toBe(false)
    const ok = makeEvent({ condiciones: { faseTemporada: ['Cierre'] } })
    expect(evaluateConditions(ok, ctx)).toBe(true)
  })

  it('filters by temporadaMinima', () => {
    const ctx = makeContext()
    const ev = makeEvent({ condiciones: { temporadaMinima: 3 } })
    expect(evaluateConditions(ev, ctx)).toBe(false)
  })
})

// ─── selectWeeklyEvent ───────────────────────────────────────────────────────

describe('selectWeeklyEvent', () => {
  it('never returns a Moment even when one is in the pool', () => {
    const pool = [makeMoment({ id: 'm' })]
    const ctx = makeContext()
    const picked = selectWeeklyEvent(pool, ctx, () => 0.5)
    expect(picked).toBeNull()
  })

  it('does not return events already in emittedEvents', () => {
    const a = makeEvent({ id: 'a' })
    const b = makeEvent({ id: 'b' })
    const ctx = makeContext({ emittedEvents: ['a'] })
    const picked = selectWeeklyEvent([a, b], ctx, () => 0)
    expect(picked?.id).toBe('b')
  })

  it('returns null on empty pool', () => {
    expect(selectWeeklyEvent([], makeContext(), () => 0)).toBeNull()
  })

  it('respects minVinculo condition', () => {
    const ctx = makeContext({ skater: makeSkater({ vinculo: 10 }) })
    const ev = makeEvent({ condiciones: { minVinculo: 50 } })
    expect(selectWeeklyEvent([ev], ctx, () => 0)).toBeNull()
  })

  it('applies crisis cooldown of 3 weeks', () => {
    const c = makeEvent({ id: 'c', tipo: 'crisis' })
    const ctx = makeContext({
      season: { ...DEFAULT_SEASON_DATA, semanaActual: 5 },
    })
    // last emitted week 3, current week 5 → gap 2 < 3, blocked
    expect(selectWeeklyEvent([c], ctx, () => 0, {
      currentWeek: 5,
      lastEmittedBySubtype: { crisis: 3 },
    })).toBeNull()
    // gap 3, allowed
    expect(selectWeeklyEvent([c], ctx, () => 0, {
      currentWeek: 5,
      lastEmittedBySubtype: { crisis: 2 },
    })?.id).toBe('c')
  })
})

// ─── selectCompetitionMoment ────────────────────────────────────────────────

describe('selectCompetitionMoment', () => {
  const early = makeMoment({ id: 'e', trigger: 'early' })
  const mid   = makeMoment({ id: 'm', trigger: 'mid' })
  const late  = makeMoment({ id: 'l', trigger: 'late' })

  it('returns only Moments with the requested trigger', () => {
    const pool = [early, mid, late]
    const picked = selectCompetitionMoment(pool, 'early', makeContext(), () => 0)
    expect(picked?.trigger).toBe('early')
    expect(picked?.id).toBe('e')
  })

  it('returns null when no Moment matches trigger', () => {
    const pool = [early]
    expect(selectCompetitionMoment(pool, 'late', makeContext(), () => 0)).toBeNull()
  })

  it('returns null when conditions filter out every candidate', () => {
    const gated = makeMoment({ id: 'g', trigger: 'early', condiciones: { minVinculo: 99 } })
    const ctx = makeContext({ skater: makeSkater({ vinculo: 10 }) })
    expect(selectCompetitionMoment([gated], 'early', ctx, () => 0)).toBeNull()
  })

  it('does NOT exclude Moments already in emittedEvents', () => {
    const pool = [early]
    const ctx = makeContext({ emittedEvents: ['e'] })
    const picked = selectCompetitionMoment(pool, 'early', ctx, () => 0)
    expect(picked?.id).toBe('e')
  })

  it('ignores non-Moment events even if the id appears to match trigger', () => {
    const weekly = makeEvent({ id: 'w' })
    expect(selectCompetitionMoment([weekly], 'early', makeContext(), () => 0)).toBeNull()
  })
})

// ─── applyEventEffect ────────────────────────────────────────────────────────

describe('applyEventEffect', () => {
  it('clamps vinculoDelta at 100', () => {
    const ctx = makeContext({ skater: makeSkater({ vinculo: 95 }) })
    const ev = makeEvent({ opciones: [{ id: 'o', texto: 't', efectos: { vinculoDelta: 10 } }] })
    const outcome = applyEventEffect(ctx, ev, 'o')
    expect(outcome.skaterPatch.weeklyState?.vinculo).toBe(100)
  })

  it('clamps vinculoDelta at 0', () => {
    const ctx = makeContext({ skater: makeSkater({ vinculo: 3 }) })
    const ev = makeEvent({ opciones: [{ id: 'o', texto: 't', efectos: { vinculoDelta: -20 } }] })
    const outcome = applyEventEffect(ctx, ev, 'o')
    expect(outcome.skaterPatch.weeklyState?.vinculo).toBe(0)
  })

  it('mutates when rasgoRiesgo + prob=1 and rng=0.5', () => {
    const ctx = makeContext({
      skater: {
        ...makeSkater(),
        traits: [{ id: 'perfeccionista', active: true, mutated: null }],
      },
    })
    const ev = makeEvent({
      opciones: [{
        id: 'o',
        texto: 't',
        efectos: { rasgoRiesgo: 'perfeccionista', probabilidadMutacion: 1 },
      }],
    })
    const outcome = applyEventEffect(ctx, ev, 'o', () => 0.5)
    expect(outcome.mutatedTrait).toBeDefined()
    expect(outcome.mutatedTrait?.from).toBe('perfeccionista')
  })

  it('does not mutate when probability=0', () => {
    const ctx = makeContext()
    const ev = makeEvent({
      opciones: [{
        id: 'o',
        texto: 't',
        efectos: { rasgoRiesgo: 'perfeccionista', probabilidadMutacion: 0 },
      }],
    })
    const outcome = applyEventEffect(ctx, ev, 'o', () => 0.5)
    expect(outcome.mutatedTrait).toBeUndefined()
  })

  it('collects narrativeFlags into flagsPatch', () => {
    const ctx = makeContext()
    const ev = makeEvent({
      opciones: [{
        id: 'o',
        texto: 't',
        efectos: { narrativeFlags: { hablaron_de_la_musica: true, intensidad: 3 } },
      }],
    })
    const outcome = applyEventEffect(ctx, ev, 'o')
    expect(outcome.flagsPatch['hablaron_de_la_musica']).toBe(true)
    expect(outcome.flagsPatch['intensidad']).toBe(3)
  })

  it('ignores Moment-specific fields (no goe, no varianza in weekly outcome)', () => {
    const ctx = makeContext()
    const ev = makeEvent({
      opciones: [{
        id: 'o',
        texto: 't',
        efectos: { goeDeltaCurrent: 0.5, varianzaMultiplier: 1.5 },
      }],
    })
    const outcome = applyEventEffect(ctx, ev, 'o')
    // no skater changes, no flags
    expect(outcome.skaterPatch.weeklyState).toBeUndefined()
    expect(Object.keys(outcome.flagsPatch)).toHaveLength(0)
  })

  it('returns empty patches for an unknown optionId', () => {
    const outcome = applyEventEffect(makeContext(), makeEvent(), 'no_such_opt')
    expect(outcome.skaterPatch).toEqual({})
    expect(outcome.flagsPatch).toEqual({})
  })
})

// ─── applyMomentEffect ───────────────────────────────────────────────────────

describe('applyMomentEffect', () => {
  it('extracts goeDeltaCurrent and varianzaMultiplier', () => {
    const m = makeMoment()
    const outcome = applyMomentEffect(m, 'mop1')
    expect(outcome.goeBonusCurrent).toBe(0.3)
    expect(outcome.varianzaMultiplier).toBe(0.85)
    expect(outcome.goeBonusRemaining).toBe(0.05)
    expect(outcome.bondDelta).toBe(2)
  })

  it('returns neutral defaults when option has no mechanical fields', () => {
    const m = makeMoment({
      opciones: [{ id: 'plain', texto: 't', efectos: {} }],
    })
    const outcome = applyMomentEffect(m, 'plain')
    expect(outcome.goeBonusCurrent).toBe(0)
    expect(outcome.goeBonusRemaining).toBe(0)
    expect(outcome.varianzaMultiplier).toBe(1.0)
    expect(outcome.bondDelta).toBe(0)
  })

  it('propagates narrativeFlags to flagsPatch', () => {
    const m = makeMoment({
      opciones: [{ id: 'o', texto: 't', efectos: { narrativeFlags: { foo: true } } }],
    })
    expect(applyMomentEffect(m, 'o').flagsPatch['foo']).toBe(true)
  })

  it('returns neutral defaults for unknown optionId', () => {
    const m = makeMoment()
    const outcome = applyMomentEffect(m, 'no_such')
    expect(outcome.goeBonusCurrent).toBe(0)
    expect(outcome.varianzaMultiplier).toBe(1.0)
  })
})

// ─── loadEvents (integration with fetch mock) ────────────────────────────────

describe('loadEvents integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads, validates, and concatenates all 7 type files', async () => {
    const mock = vi.fn(async (url: string): Promise<Response> => {
      if (url.endsWith('/data/events/crisis.json')) {
        return new Response(JSON.stringify([makeEvent({ id: 'c1', tipo: 'crisis' })]))
      }
      if (url.endsWith('/data/events/momento_competicion.json')) {
        return new Response(JSON.stringify([makeMoment({ id: 'mm1' })]))
      }
      if (url.endsWith('/data/events/cotidiano.json')) {
        return new Response(JSON.stringify([makeEvent({ id: 'co1' })]))
      }
      // other files: empty array
      return new Response('[]')
    })
    vi.stubGlobal('fetch', mock)

    const events = await loadEvents()
    expect(events.find(e => e.id === 'c1')?.tipo).toBe('crisis')
    expect(events.find(e => e.id === 'mm1')?.tipo).toBe('momento_competicion')
    expect(events.find(e => e.id === 'co1')?.tipo).toBe('cotidiano')
  })

  it('selectWeeklyEvent on loaded pool never picks a Moment', async () => {
    const mock = vi.fn(async (url: string): Promise<Response> => {
      if (url.endsWith('/data/events/momento_competicion.json')) {
        return new Response(JSON.stringify([makeMoment({ id: 'mm' })]))
      }
      if (url.endsWith('/data/events/cotidiano.json')) {
        return new Response(JSON.stringify([makeEvent({ id: 'co' })]))
      }
      return new Response('[]')
    })
    vi.stubGlobal('fetch', mock)

    const pool = await loadEvents()
    const picked = selectWeeklyEvent(pool, makeContext(), () => 0.1)
    expect(picked?.tipo).not.toBe('momento_competicion')
  })

  it('selectCompetitionMoment on loaded pool returns Moments only', async () => {
    const mock = vi.fn(async (url: string): Promise<Response> => {
      if (url.endsWith('/data/events/momento_competicion.json')) {
        return new Response(JSON.stringify([
          makeMoment({ id: 'mm1', trigger: 'early' }),
          makeMoment({ id: 'mm2', trigger: 'late' }),
        ]))
      }
      if (url.endsWith('/data/events/cotidiano.json')) {
        return new Response(JSON.stringify([makeEvent({ id: 'co' })]))
      }
      return new Response('[]')
    })
    vi.stubGlobal('fetch', mock)

    const pool = await loadEvents()
    const picked = selectCompetitionMoment(pool, 'early', makeContext(), () => 0)
    expect(picked?.id).toBe('mm1')
    expect(picked?.trigger).toBe('early')
  })

  it('skips invalid entries with a warning but keeps valid siblings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mock = vi.fn(async (url: string): Promise<Response> => {
      if (url.endsWith('/data/events/crisis.json')) {
        return new Response(JSON.stringify([
          makeEvent({ id: 'good', tipo: 'crisis' }),
          { id: 'bad' }, // missing fields
        ]))
      }
      return new Response('[]')
    })
    vi.stubGlobal('fetch', mock)

    const events = await loadEvents()
    expect(events.find(e => e.id === 'good')).toBeDefined()
    expect(events.find(e => e.id === 'bad')).toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('throws when every file fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    await expect(loadEvents()).rejects.toThrow()
  })
})
