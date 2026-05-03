import { describe, it, expect } from 'vitest'
import {
  activityAllowedDuringInjury,
  maskInjuredSchedule,
  pickRecoveryWeeks,
  pickSeverity,
  rollFallInjury,
  rollWeeklyInjury,
  tickInjuryWeek,
  weeklyInjuryLoad,
  weeklyInjuryProbability,
} from './injury'
import { DEFAULT_SKATER_DATA } from '@/types'
import type { InjuryRecord, SkaterData, SkaterTrait } from '@/types'
import type { WeekSchedule } from '@/features/training'

// ─── fixtures ────────────────────────────────────────────────────────────────

function makeSkater(overrides: Partial<SkaterData> = {}): SkaterData {
  return {
    ...DEFAULT_SKATER_DATA,
    id: 'sk-1', name: 'Test',
    ...overrides,
    technical:     { ...DEFAULT_SKATER_DATA.technical,     ...(overrides.technical ?? {}) },
    psychological: { ...DEFAULT_SKATER_DATA.psychological, ...(overrides.psychological ?? {}) },
    physical:      { ...DEFAULT_SKATER_DATA.physical,      ...(overrides.physical ?? {}) },
    weeklyState:   { ...DEFAULT_SKATER_DATA.weeklyState,   ...(overrides.weeklyState ?? {}) },
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

function withTrait(skater: SkaterData, traitId: string): SkaterData {
  const t: SkaterTrait = { id: traitId as SkaterTrait['id'], active: true, mutated: null }
  return { ...skater, traits: [...skater.traits, t] }
}

// ─── load & probability ──────────────────────────────────────────────────────

describe('weeklyInjuryLoad', () => {
  it('sums injuryRiskDelta across the schedule', () => {
    // tecnico=4, fisico=2, descanso=-2, dialogo=0
    const s = schedule(['tecnico', 'fisico', 'descanso', 'dialogo', null])
    expect(weeklyInjuryLoad(s)).toBe(4 + 2 - 2 + 0)
  })

  it('returns 0 for an entirely empty schedule', () => {
    expect(weeklyInjuryLoad(schedule([null, null, null, null, null]))).toBe(0)
  })
})

describe('weeklyInjuryProbability', () => {
  it('is 0 when the load is non-positive', () => {
    const s = schedule(['descanso', 'descanso', 'mental', null, null])
    expect(weeklyInjuryProbability(makeSkater(), s)).toBe(0)
  })

  it('is higher with two técnicos than with one', () => {
    const skater = makeSkater()
    const oneTec = schedule(['tecnico', 'descanso', 'mental', null, null])
    const twoTec = schedule(['tecnico', 'tecnico', null, null, null])
    expect(weeklyInjuryProbability(skater, twoTec))
      .toBeGreaterThan(weeklyInjuryProbability(skater, oneTec))
  })

  it('"resiliente" reduces probability vs. a baseline skater', () => {
    const baseline = makeSkater()
    const resilient = withTrait(baseline, 'resiliente')
    const s = schedule(['tecnico', 'tecnico', 'fisico', null, null])
    expect(weeklyInjuryProbability(resilient, s))
      .toBeLessThan(weeklyInjuryProbability(baseline, s))
  })

  it('"cuerpo-fragil" increases probability vs. a baseline skater', () => {
    const baseline = makeSkater()
    const fragile = withTrait(baseline, 'cuerpo-fragil')
    const s = schedule(['tecnico', 'tecnico', 'fisico', null, null])
    expect(weeklyInjuryProbability(fragile, s))
      .toBeGreaterThan(weeklyInjuryProbability(baseline, s))
  })

  it('historialLesiones above 70 amplifies probability exponentially', () => {
    const low = makeSkater({ physical: { ...DEFAULT_SKATER_DATA.physical, historialLesiones: 30 } })
    const high = makeSkater({ physical: { ...DEFAULT_SKATER_DATA.physical, historialLesiones: 90 } })
    const s = schedule(['tecnico', 'tecnico', null, null, null])
    expect(weeklyInjuryProbability(high, s))
      .toBeGreaterThan(weeklyInjuryProbability(low, s) * 1.5)
  })

  it('tecnico_vs_descanso tension multiplies probability by OVERWORK_INJURY_MULTIPLIER', () => {
    const skater = makeSkater()
    const s = schedule(['tecnico', 'tecnico', null, null, null])
    const baseline = weeklyInjuryProbability(skater, s)
    const overworked = weeklyInjuryProbability(skater, s, ['tecnico_vs_descanso'])
    // OVERWORK_INJURY_MULTIPLIER = 1.6
    expect(overworked).toBeGreaterThan(baseline)
    expect(overworked).toBeCloseTo(baseline * 1.6, 5)
  })

  it('other tensions do not affect injury probability', () => {
    const skater = makeSkater()
    const s = schedule(['tecnico', 'tecnico', null, null, null])
    const baseline = weeklyInjuryProbability(skater, s)
    const withOther = weeklyInjuryProbability(skater, s, ['carga_vs_pico', 'ensayo_vs_espontaneidad'])
    expect(withOther).toBe(baseline)
  })
})

// ─── severity & recovery ─────────────────────────────────────────────────────

describe('pickSeverity', () => {
  it('biases toward grave when historial > 60', () => {
    const baseline = makeSkater()
    const haunted = makeSkater({ physical: { ...DEFAULT_SKATER_DATA.physical, historialLesiones: 80 } })
    const N = 800
    const counts = (s: SkaterData) => {
      let leve = 0, grave = 0
      let seed = 1
      for (let i = 0; i < N; i++) {
        const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
        const sev = pickSeverity(s, rng)
        if (sev === 'leve') leve += 1
        if (sev === 'grave') grave += 1
      }
      return { leve, grave }
    }
    const a = counts(baseline)
    const b = counts(haunted)
    expect(b.grave).toBeGreaterThan(a.grave)
  })
})

describe('pickRecoveryWeeks', () => {
  it('respects severity ranges', () => {
    const rng = () => 0
    expect(pickRecoveryWeeks('leve',     0, rng)).toBeGreaterThanOrEqual(1)
    expect(pickRecoveryWeeks('moderada', 0, rng)).toBeGreaterThanOrEqual(3)
    expect(pickRecoveryWeeks('grave',    0, rng)).toBeGreaterThanOrEqual(8)
  })

  it('higher fisioterapia level reduces recovery duration', () => {
    const rng = () => 0.999
    const noFisio = pickRecoveryWeeks('moderada', 0, rng)
    const maxFisio = pickRecoveryWeeks('moderada', 4, rng)
    expect(maxFisio).toBeLessThanOrEqual(noFisio)
  })
})

// ─── rollWeeklyInjury ────────────────────────────────────────────────────────

describe('rollWeeklyInjury', () => {
  it('returns null when trigger >= probability', () => {
    const skater = makeSkater()
    const s = schedule(['tecnico', null, null, null, null])
    const out = rollWeeklyInjury(skater, s, { trigger: 0.99, currentWeek: 5 })
    expect(out).toBeNull()
  })

  it('returns an InjuryRecord when trigger < probability', () => {
    const fragile = withTrait(
      makeSkater({ physical: { ...DEFAULT_SKATER_DATA.physical, historialLesiones: 80 } }),
      'cuerpo-fragil',
    )
    const s = schedule(['tecnico', 'tecnico', 'tecnico', null, null])
    const out = rollWeeklyInjury(fragile, s, { trigger: 0, currentWeek: 7 })
    expect(out).not.toBeNull()
    expect(out!.injuredAtWeek).toBe(7)
    expect(out!.recoveryWeeksRemaining).toBe(out!.recoveryWeeksTotal)
    expect(['leve', 'moderada', 'grave']).toContain(out!.severity)
  })

  it('overwork tension makes the roll fire at a probability that would not trigger otherwise', () => {
    // baseline: dos técnicos en patinador sano → ~0.0615 (load 8 / divisor 130).
    // con overwork (× 1.6) → ~0.0985. usamos un trigger en la franja intermedia.
    const skater = makeSkater()
    const s = schedule(['tecnico', 'tecnico', null, null, null])
    const baseline = weeklyInjuryProbability(skater, s)
    const overworked = weeklyInjuryProbability(skater, s, ['tecnico_vs_descanso'])
    const trigger = (baseline + overworked) / 2  // a medio camino
    expect(trigger).toBeGreaterThan(baseline)
    expect(trigger).toBeLessThan(overworked)

    const without = rollWeeklyInjury(skater, s, { trigger, currentWeek: 5 })
    const withTension = rollWeeklyInjury(skater, s, {
      trigger,
      currentWeek: 5,
      tensions: ['tecnico_vs_descanso'],
    })
    expect(without).toBeNull()
    expect(withTension).not.toBeNull()
  })

  it('returns null when the skater is already injured', () => {
    const injured = makeSkater({
      weeklyState: {
        ...DEFAULT_SKATER_DATA.weeklyState,
        currentInjury: {
          injuredAtWeek: 4, recoveryWeeksTotal: 6, recoveryWeeksRemaining: 4, severity: 'moderada',
        },
      },
    })
    const s = schedule(['tecnico', 'tecnico', null, null, null])
    expect(rollWeeklyInjury(injured, s, { trigger: 0, currentWeek: 8 })).toBeNull()
  })
})

// ─── rollFallInjury ──────────────────────────────────────────────────────────

describe('rollFallInjury', () => {
  it('returns null when caidas is 0', () => {
    expect(rollFallInjury(makeSkater(), 0, 0, { currentWeek: 5 })).toBeNull()
  })

  it('returns an injury when caidas + fatigue make probability > trigger', () => {
    const tired = makeSkater({
      weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, fatigaAcumulada: 80 },
    })
    const out = rollFallInjury(tired, 2, 0, { currentWeek: 12 })
    expect(out).not.toBeNull()
    expect(out!.injuredAtWeek).toBe(12)
  })

  it('skips the roll when an injury is already active', () => {
    const injured = makeSkater({
      weeklyState: {
        ...DEFAULT_SKATER_DATA.weeklyState,
        currentInjury: {
          injuredAtWeek: 1, recoveryWeeksTotal: 2, recoveryWeeksRemaining: 1, severity: 'leve',
        },
      },
    })
    expect(rollFallInjury(injured, 3, 0, { currentWeek: 5 })).toBeNull()
  })
})

// ─── tickInjuryWeek ──────────────────────────────────────────────────────────

describe('tickInjuryWeek', () => {
  it('decrements remaining weeks while still injured', () => {
    const injury: InjuryRecord = {
      injuredAtWeek: 5, recoveryWeeksTotal: 4, recoveryWeeksRemaining: 4, severity: 'moderada',
    }
    const skater = makeSkater({
      weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, currentInjury: injury },
    })
    const out = tickInjuryWeek(skater)
    expect(out.justRecovered).toBe(false)
    expect(out.skater.weeklyState.currentInjury?.recoveryWeeksRemaining).toBe(3)
  })

  it('clears the injury and applies historialLesiones increase on recovery', () => {
    const injury: InjuryRecord = {
      injuredAtWeek: 5, recoveryWeeksTotal: 1, recoveryWeeksRemaining: 1, severity: 'leve',
    }
    const skater = makeSkater({
      physical:    { ...DEFAULT_SKATER_DATA.physical, historialLesiones: 10 },
      weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, currentInjury: injury },
    })
    const out = tickInjuryWeek(skater)
    expect(out.justRecovered).toBe(true)
    expect(out.recoveredSeverity).toBe('leve')
    expect(out.skater.weeklyState.currentInjury).toBeNull()
    expect(out.skater.physical.historialLesiones).toBe(15)
  })

  it('a grave recovery reduces techo biológico', () => {
    const injury: InjuryRecord = {
      injuredAtWeek: 5, recoveryWeeksTotal: 1, recoveryWeeksRemaining: 1, severity: 'grave',
    }
    const skater = makeSkater({
      physical:    { ...DEFAULT_SKATER_DATA.physical, techosBiologico: 80, historialLesiones: 20 },
      weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, currentInjury: injury },
    })
    const out = tickInjuryWeek(skater, () => 0)
    expect(out.justRecovered).toBe(true)
    expect(out.skater.physical.techosBiologico).toBeLessThan(80)
    expect(out.skater.physical.historialLesiones).toBe(20 + 22)
  })
})

// ─── slot eligibility ────────────────────────────────────────────────────────

describe('activityAllowedDuringInjury', () => {
  it('blocks tecnico/fisico in every severity', () => {
    for (const sev of ['leve', 'moderada', 'grave'] as const) {
      expect(activityAllowedDuringInjury('tecnico', sev)).toBe(false)
      expect(activityAllowedDuringInjury('fisico',  sev)).toBe(false)
    }
  })

  it('allows ensayo only in leve', () => {
    expect(activityAllowedDuringInjury('ensayo', 'leve')).toBe(true)
    expect(activityAllowedDuringInjury('ensayo', 'moderada')).toBe(false)
    expect(activityAllowedDuringInjury('ensayo', 'grave')).toBe(false)
  })

  it('always allows mental, descanso and dialogo', () => {
    for (const sev of ['leve', 'moderada', 'grave'] as const) {
      expect(activityAllowedDuringInjury('mental',   sev)).toBe(true)
      expect(activityAllowedDuringInjury('descanso', sev)).toBe(true)
      expect(activityAllowedDuringInjury('dialogo',  sev)).toBe(true)
    }
  })
})

describe('maskInjuredSchedule', () => {
  it('nulls out blocked activities while preserving allowed ones', () => {
    const s = schedule(['tecnico', 'fisico', 'mental', 'ensayo', 'dialogo'])
    const masked = maskInjuredSchedule(s, 'moderada')
    expect(masked.slots[0].activityId).toBeNull()  // tecnico → blocked
    expect(masked.slots[1].activityId).toBeNull()  // fisico → blocked
    expect(masked.slots[2].activityId).toBe('mental')
    expect(masked.slots[3].activityId).toBeNull()  // ensayo blocked in moderada
    expect(masked.slots[4].activityId).toBe('dialogo')
  })

  it('keeps ensayo in leve', () => {
    const s = schedule(['ensayo', 'tecnico', null, null, null])
    const masked = maskInjuredSchedule(s, 'leve')
    expect(masked.slots[0].activityId).toBe('ensayo')
    expect(masked.slots[1].activityId).toBeNull()
  })
})
