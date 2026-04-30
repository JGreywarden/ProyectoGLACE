import { describe, it, expect } from 'vitest'
import {
  applyRivalSeasonProgression,
  eligibleRivals,
  generateRivalPool,
  sampleField,
  simulateRivalCompetition,
  simulateRivalProgram,
} from './service'
import { validateRivalsPool } from './validation'
import { COMPETITION_FIELD_SIZE, type RivalsPool, type RivalTier } from './types'

// deterministic mulberry32 — same as worker/engine tests
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('generateRivalPool', () => {
  it('produces a 50-rival pool with the expected tier distribution', () => {
    const pool = generateRivalPool(1, mulberry32(42))
    expect(pool.skaters).toHaveLength(50)
    const byTier: Record<RivalTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const r of pool.skaters) byTier[r.tier]++
    expect(byTier[5]).toBe(5)
    expect(byTier[4]).toBe(10)
    expect(byTier[3]).toBe(14)
    expect(byTier[2]).toBe(13)
    expect(byTier[1]).toBe(8)
  })

  it('is deterministic for a given seed', () => {
    const a = generateRivalPool(1, mulberry32(99))
    const b = generateRivalPool(1, mulberry32(99))
    expect(a.skaters.map(r => r.id)).toEqual(b.skaters.map(r => r.id))
    expect(a.skaters[0].technical).toEqual(b.skaters[0].technical)
  })

  it('attribute means rise with tier', () => {
    const pool = generateRivalPool(1, mulberry32(7))
    const mean = (tier: RivalTier) => {
      const xs = pool.skaters.filter(r => r.tier === tier)
      const sum = xs.reduce((s, r) => s + (r.technical.saltos + r.technical.giros) / 2, 0)
      return sum / xs.length
    }
    expect(mean(5)).toBeGreaterThan(mean(3))
    expect(mean(3)).toBeGreaterThan(mean(1))
  })

  it('generated pool passes its own validator', () => {
    const pool = generateRivalPool(1, mulberry32(1))
    expect(validateRivalsPool(pool)).toBe(true)
  })
})

describe('simulateRivalProgram', () => {
  it('produces non-negative TES and PCS for a typical rival', () => {
    const pool = generateRivalPool(1, mulberry32(3))
    const rival = pool.skaters.find(r => r.tier === 4)!
    const sp = simulateRivalProgram(rival, 'corto', mulberry32(5))
    const fp = simulateRivalProgram(rival, 'libre', mulberry32(5))
    expect(sp.tes).toBeGreaterThanOrEqual(0)
    expect(sp.pcs).toBeGreaterThanOrEqual(0)
    expect(fp.total).toBeGreaterThanOrEqual(0)
  })

  it('FP totals beat SP totals on average for top-tier rivals', () => {
    const pool = generateRivalPool(1, mulberry32(11))
    const elite = pool.skaters.filter(r => r.tier === 5)
    let spSum = 0
    let fpSum = 0
    for (const r of elite) {
      const rng = mulberry32(r.id.length)
      spSum += simulateRivalProgram(r, 'corto', rng).total
      fpSum += simulateRivalProgram(r, 'libre',  rng).total
    }
    expect(fpSum).toBeGreaterThan(spSum)
  })
})

describe('simulateRivalCompetition', () => {
  it('produces a combined total that equals SP + FP', () => {
    const pool = generateRivalPool(1, mulberry32(3))
    const rival = pool.skaters[0]
    const sim = simulateRivalCompetition(rival, mulberry32(15))
    expect(sim.totalCombinado).toBeCloseTo(sim.scoreCorto + sim.scoreLibre, 5)
  })
})

describe('eligibleRivals & sampleField', () => {
  it('only tier ≥ minimum participates in the higher events', () => {
    const pool = generateRivalPool(1, mulberry32(2))
    const worldsField = eligibleRivals(pool.skaters, 'mundial')
    expect(worldsField.every(r => r.tier >= 4)).toBe(true)
  })

  it('field size never exceeds (cap − player) and only includes eligible rivals', () => {
    const pool = generateRivalPool(1, mulberry32(2))
    const sampled = sampleField(pool.skaters, 'mundial', mulberry32(8))
    expect(sampled.length).toBeLessThanOrEqual(COMPETITION_FIELD_SIZE.mundial - 1)
    expect(sampled.length).toBeGreaterThan(0)
    expect(sampled.every(r => r.tier >= 4)).toBe(true)
  })

  it('national event fits the configured cap when the eligible pool is plentiful', () => {
    const pool = generateRivalPool(1, mulberry32(3))
    const sampled = sampleField(pool.skaters, 'nacional', mulberry32(3))
    expect(sampled.length).toBe(COMPETITION_FIELD_SIZE.nacional - 1)
  })

  it('grand prix final fits 5 rivals so the cap of 6 holds with the player', () => {
    const pool = generateRivalPool(1, mulberry32(4))
    const sampled = sampleField(pool.skaters, 'finalGrandprix', mulberry32(4))
    expect(sampled.length).toBe(5)
    expect(sampled.every(r => r.tier >= 4)).toBe(true)
  })
})

describe('applyRivalSeasonProgression', () => {
  it('keeps the pool size and seasonNumber unchanged', () => {
    const pool: RivalsPool = generateRivalPool(2, mulberry32(7))
    const next = applyRivalSeasonProgression(pool, mulberry32(7))
    expect(next.skaters).toHaveLength(pool.skaters.length)
    expect(next.seasonNumber).toBe(pool.seasonNumber)
  })
})
