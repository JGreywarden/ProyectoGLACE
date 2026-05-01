import { describe, it, expect } from 'vitest'
import { DEFAULT_SKATER_DATA } from '@/types'
import type { SkaterData } from '@/types'
import {
  applyBondDecay,
  applyFatigueRecovery,
  computeTraitVisibilityLayer,
  computeVisibleTraits,
  applyAttributeGains,
  rollMutation,
  computeInjuryRisk,
} from './service'
import { TRAITS, TraitLayer } from '@/types'

// ─── fixtures ─────────────────────────────────────────────────────────────────

function makeSkater(id = 'test'): SkaterData {
  return { ...DEFAULT_SKATER_DATA, id }
}

function withVinculo(skater: SkaterData, vinculo: number): SkaterData {
  return { ...skater, weeklyState: { ...skater.weeklyState, vinculo } }
}

function withFatiga(skater: SkaterData, fatigaAcumulada: number): SkaterData {
  return { ...skater, weeklyState: { ...skater.weeklyState, fatigaAcumulada } }
}

function withHistorial(skater: SkaterData, historialLesiones: number): SkaterData {
  return { ...skater, physical: { ...skater.physical, historialLesiones } }
}

function withTechos(skater: SkaterData, techosBiologico: number): SkaterData {
  return { ...skater, physical: { ...skater.physical, techosBiologico } }
}

function withSaltos(skater: SkaterData, saltos: number): SkaterData {
  return { ...skater, technical: { ...skater.technical, saltos } }
}

// ─── applyBondDecay ───────────────────────────────────────────────────────────

describe('applyBondDecay', () => {
  it('leaves vinculo intact when dialogue happened this week', () => {
    const skater = withVinculo(makeSkater(), 50)
    const result = applyBondDecay(skater, true, () => 0.5)
    expect(result.weeklyState.vinculo).toBe(50)
  })

  it('subtracts exactly 2 when no dialogue and rng returns 0', () => {
    const skater = withVinculo(makeSkater(), 50)
    const result = applyBondDecay(skater, false, () => 0)
    expect(result.weeklyState.vinculo).toBe(48)
  })

  it('subtracts exactly 3 when no dialogue and rng returns 1', () => {
    const skater = withVinculo(makeSkater(), 50)
    const result = applyBondDecay(skater, false, () => 1)
    expect(result.weeklyState.vinculo).toBe(47)
  })

  it('never drops bond below 0', () => {
    const skater = withVinculo(makeSkater(), 1)
    const result = applyBondDecay(skater, false, () => 1)
    expect(result.weeklyState.vinculo).toBeGreaterThanOrEqual(0)
  })

  it('never raises bond above 100', () => {
    const skater = withVinculo(makeSkater(), 100)
    const result = applyBondDecay(skater, false, () => 0)
    expect(result.weeklyState.vinculo).toBeLessThanOrEqual(100)
  })

  it('does not mutate the original skater', () => {
    const skater = withVinculo(makeSkater(), 50)
    const original = skater.weeklyState.vinculo
    applyBondDecay(skater, false, () => 0.5)
    expect(skater.weeklyState.vinculo).toBe(original)
  })
})

// ─── applyFatigueRecovery ─────────────────────────────────────────────────────

describe('applyFatigueRecovery', () => {
  it('reduces fatigue by the installation bonus', () => {
    const skater = withFatiga(makeSkater(), 60)
    const result = applyFatigueRecovery(skater, 15)
    expect(result.weeklyState.fatigaAcumulada).toBe(45)
  })

  it('never drops fatigue below 0', () => {
    const skater = withFatiga(makeSkater(), 5)
    const result = applyFatigueRecovery(skater, 30)
    expect(result.weeklyState.fatigaAcumulada).toBe(0)
  })
})

// ─── computeTraitVisibilityLayer ─────────────────────────────────────────────

describe('computeTraitVisibilityLayer', () => {
  it.each([
    [0,  0],
    [19, 0],
    [20, 1],
    [39, 1],
    [40, 2],
    [54, 2],
    [64, 2],
    [65, 3],
    [100, 3],
  ] as [number, 0 | 1 | 2 | 3][])('bond=%i → layer %i', (bond, expected) => {
    expect(computeTraitVisibilityLayer(bond)).toBe(expected)
  })
})

// ─── computeVisibleTraits ─────────────────────────────────────────────────────

describe('computeVisibleTraits', () => {
  it('returns only Visible-layer traits when bond < 20', () => {
    const skater = withVinculo(makeSkater(), 10)
    const visible = computeVisibleTraits(skater, TRAITS)
    expect(visible.every(t => t.layer === TraitLayer.Visible)).toBe(true)
  })

  it('includes Bond20 traits when bond >= 20', () => {
    const skater = withVinculo(makeSkater(), 20)
    const visible = computeVisibleTraits(skater, TRAITS)
    expect(visible.some(t => t.layer === TraitLayer.Bond20)).toBe(true)
  })

  it('does not include Bond40 traits when bond is 20', () => {
    const skater = withVinculo(makeSkater(), 20)
    const visible = computeVisibleTraits(skater, TRAITS)
    expect(visible.every(t => t.layer !== TraitLayer.Bond40)).toBe(true)
  })
})

// ─── applyAttributeGains ─────────────────────────────────────────────────────

describe('applyAttributeGains', () => {
  it('respects techosBiologico when it is lower than potential', () => {
    // techos=60, potential=80 → effective ceiling=60
    const skater = withSaltos(withTechos(makeSkater(), 60), 50)
    const result = applyAttributeGains(skater, { saltos: 50 }, 80)
    expect(result.technical.saltos).toBe(60)
  })

  it('respects potential when it is lower than techosBiologico', () => {
    // techos=90, potential=70 → effective ceiling=70
    const skater = withSaltos(withTechos(makeSkater(), 90), 50)
    const result = applyAttributeGains(skater, { saltos: 30 }, 70)
    expect(result.technical.saltos).toBe(70)
  })

  it('applies gain normally when below both ceilings', () => {
    const skater = withSaltos(withTechos(makeSkater(), 100), 40)
    const result = applyAttributeGains(skater, { saltos: 5 }, 100)
    expect(result.technical.saltos).toBe(45)
  })

  it('does not modify unmentioned attributes', () => {
    const skater = makeSkater()
    const originalGiros = skater.technical.giros
    const result = applyAttributeGains(skater, { saltos: 5 }, 100)
    expect(result.technical.giros).toBe(originalGiros)
  })

  it('does not mutate the original skater', () => {
    const skater = makeSkater()
    const originalSaltos = skater.technical.saltos
    applyAttributeGains(skater, { saltos: 10 }, 100)
    expect(skater.technical.saltos).toBe(originalSaltos)
  })
})

// ─── rollMutation ─────────────────────────────────────────────────────────────

describe('rollMutation', () => {
  const skater = makeSkater()

  it('never mutates when probabilidad=0', () => {
    const result = rollMutation(skater, 'perfeccionista', 0, () => 0.5)
    expect(result.mutated).toBe(false)
    expect(result.newTraitId).toBeNull()
  })

  it('always mutates when probabilidad=1 and rng=0.5', () => {
    const result = rollMutation(skater, 'perfeccionista', 1, () => 0.5)
    expect(result.mutated).toBe(true)
    if (result.mutated) {
      expect(result.newTraitId).toBe('auto-exigencia-destructiva')
    }
  })

  it('returns mutated:false for a trait with no mutation destination', () => {
    // ritmo-natural has no mutacion in traits.json
    const result = rollMutation(skater, 'ritmo-natural', 1, () => 0)
    expect(result.mutated).toBe(false)
    expect(result.newTraitId).toBeNull()
  })

  it('does not mutate when rng() equals probabilidad (boundary: < not <=)', () => {
    // rng returns exactly 0.5, prob is 0.5: 0.5 < 0.5 is false → no mutation
    const result = rollMutation(skater, 'perfeccionista', 0.5, () => 0.5)
    expect(result.mutated).toBe(false)
  })
})

// ─── computeInjuryRisk ───────────────────────────────────────────────────────

describe('computeInjuryRisk', () => {
  const load = 10

  it('is higher with historial=80 than with historial=50', () => {
    const low  = computeInjuryRisk(withHistorial(makeSkater(), 50), load)
    const high = computeInjuryRisk(withHistorial(makeSkater(), 80), load)
    expect(high).toBeGreaterThan(low)
  })

  it('applies exponential multiplier above threshold 70', () => {
    const risk = computeInjuryRisk(withHistorial(makeSkater(), 80), load)
    expect(risk).toBeCloseTo(load * Math.exp((80 - 70) / 30))
  })

  it('returns base load when historial is at or below 70', () => {
    expect(computeInjuryRisk(withHistorial(makeSkater(), 50), load)).toBe(load)
    expect(computeInjuryRisk(withHistorial(makeSkater(), 70), load)).toBe(load)
  })

  it('risk is strictly greater above threshold than exactly at 70', () => {
    const atThreshold = computeInjuryRisk(withHistorial(makeSkater(), 70), load)
    const aboveThreshold = computeInjuryRisk(withHistorial(makeSkater(), 71), load)
    expect(aboveThreshold).toBeGreaterThan(atThreshold)
  })
})
