import { describe, it, expect } from 'vitest'
import {
  computeGainCurve,
  MENTAL_VARIANCE_SIGMA,
  BOND_LAYERS,
  POTENTIAL_DAMPENING_K,
  ISU_PRIZE_MONEY,
} from './balance'

describe('computeGainCurve', () => {
  it('returns 0 when value equals potential', () => {
    expect(computeGainCurve(80, 80)).toBe(0)
    expect(computeGainCurve(0, 0)).toBe(0)
    expect(computeGainCurve(100, 100)).toBe(0)
  })

  it('returns 0 when value exceeds potential', () => {
    expect(computeGainCurve(90, 80)).toBe(0)
  })

  it('is monotonically non-decreasing as headroom increases', () => {
    // sample headroom values from 1 to 100 and check each step is >= previous
    const headrooms = Array.from({ length: 100 }, (_, i) => i + 1)
    const gains = headrooms.map(h => computeGainCurve(100 - h, 100))
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i]).toBeGreaterThanOrEqual(gains[i - 1])
    }
  })

  it('scales proportionally with the factors multiplier', () => {
    const base = computeGainCurve(40, 80, 1)
    const boosted = computeGainCurve(40, 80, 1.25)
    expect(boosted).toBeCloseTo(base * 1.25, 10)
  })

  it('uses POTENTIAL_DAMPENING_K in the exponent', () => {
    const headroom = 50
    const expected = 2 * (1 - Math.exp(-POTENTIAL_DAMPENING_K * headroom))
    expect(computeGainCurve(50, 100)).toBeCloseTo(expected, 10)
  })
})

describe('MENTAL_VARIANCE_SIGMA', () => {
  it('is strictly decreasing over resistenciaMental ∈ [0, 100]', () => {
    const samples = Array.from({ length: 101 }, (_, i) => i)
    const sigmas = samples.map(r => MENTAL_VARIANCE_SIGMA(r))
    for (let i = 1; i < sigmas.length; i++) {
      expect(sigmas[i]).toBeLessThan(sigmas[i - 1])
    }
  })

  it('returns a positive value for all inputs in [0, 100]', () => {
    expect(MENTAL_VARIANCE_SIGMA(0)).toBeGreaterThan(0)
    expect(MENTAL_VARIANCE_SIGMA(50)).toBeGreaterThan(0)
    expect(MENTAL_VARIANCE_SIGMA(100)).toBeGreaterThan(0)
  })

  it('has higher sigma at resistenciaMental=0 than at 100', () => {
    expect(MENTAL_VARIANCE_SIGMA(0)).toBeGreaterThan(MENTAL_VARIANCE_SIGMA(100))
  })
})

describe('BOND_LAYERS', () => {
  it('has exactly the four thresholds from GDD cap. 3', () => {
    expect(BOND_LAYERS).toEqual([20, 40, 55, 65])
  })

  it('has length 4', () => {
    expect(BOND_LAYERS).toHaveLength(4)
  })

  it('thresholds are in ascending order', () => {
    for (let i = 1; i < BOND_LAYERS.length; i++) {
      expect(BOND_LAYERS[i]).toBeGreaterThan(BOND_LAYERS[i - 1])
    }
  })
})

describe('ISU prize money', () => {
  it('GP 1st place is 12000', () => {
    expect(ISU_PRIZE_MONEY.GP[1]).toBe(12_000)
  })

  it('GP Final 1st place is 25000', () => {
    expect(ISU_PRIZE_MONEY.GP_FINAL[1]).toBe(25_000)
  })

  it('Worlds 1st place is 60000', () => {
    expect(ISU_PRIZE_MONEY.WORLDS[1]).toBe(60_000)
  })

  it('prize money descends with position in all events', () => {
    const positions = [1, 2, 3, 4, 5, 6] as const
    for (const event of [ISU_PRIZE_MONEY.GP, ISU_PRIZE_MONEY.GP_FINAL, ISU_PRIZE_MONEY.WORLDS]) {
      for (let i = 0; i < positions.length - 1; i++) {
        expect(event[positions[i]]).toBeGreaterThan(event[positions[i + 1]])
      }
    }
  })
})
