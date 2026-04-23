import { describe, it, expect } from 'vitest'
import {
  computeGOE,
  computeTES,
  computeTESElement,
  simulate,
  trimmedMean,
  applyJudgeBias,
  type CompetitionContextFlags,
  type RNG,
} from './engine'
import { DEFAULT_SKATER_DATA } from '@/types/skater'
import { DEFAULT_PROGRAM_DATA } from '@/types/program'
import type { SkaterData, TechnicalAttributes, PsychologicalAttributes, WeeklyState, PhysicalPermanentAttributes } from '@/types/skater'
import type { ProgramData, ProgramElement } from '@/types/program'
import type { Judge } from '@/services/dataService'

// ─── fixtures ─────────────────────────────────────────────────────────────────

// with u=v=0.25, gaussian = sigma * sqrt(-2 ln 0.25) * cos(π/2) = 0
const noiseless: RNG = () => 0.25

// standalone mulberry32 (mirrors the worker's PRNG) for deterministic tests
function mulberry32(seed: number): RNG {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface SkaterOverrides {
  technical?:     Partial<TechnicalAttributes>
  psychological?: Partial<PsychologicalAttributes>
  physical?:      Partial<PhysicalPermanentAttributes>
  weeklyState?:   Partial<WeeklyState>
}

function makeSkater(overrides: SkaterOverrides = {}): SkaterData {
  return {
    ...DEFAULT_SKATER_DATA,
    technical:     { ...DEFAULT_SKATER_DATA.technical,     ...overrides.technical },
    psychological: { ...DEFAULT_SKATER_DATA.psychological, ...overrides.psychological },
    physical:      { ...DEFAULT_SKATER_DATA.physical,      ...overrides.physical },
    weeklyState:   { ...DEFAULT_SKATER_DATA.weeklyState,   ...overrides.weeklyState },
  }
}

function makeJumpElement(posicion = 1): ProgramElement {
  return {
    tipo:               'salto',
    tipoSalto:          'toeloop',
    dificultadBase:     4.2,
    posicionEnPrograma: posicion,
    esCombinacion:      false,
    rotaciones:         3,
  }
}

function makeNeutralJudges(n: number): Judge[] {
  return Array.from({ length: n }, (_, i) => ({
    id:          `j${i}`,
    nombre:      `Judge ${i}`,
    pais:        'NEU',
    experiencia: 10,
    sesgos:      {},
  }))
}

function stddev(xs: readonly number[]): number {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length
  return Math.sqrt(variance)
}

// ─── computeGOE ──────────────────────────────────────────────────────────────

describe('computeGOE', () => {
  it('grows when technical attributes are higher (ceteris paribus)', () => {
    const lowTech = makeSkater({
      technical: { saltos: 30, giros: 30, secuenciaDePasos: 30 },
    })
    const highTech = makeSkater({
      technical: { saltos: 90, giros: 90, secuenciaDePasos: 90 },
    })
    const elem = makeJumpElement()
    const flags: CompetitionContextFlags = {}
    expect(computeGOE(highTech, elem, flags, noiseless))
      .toBeGreaterThan(computeGOE(lowTech, elem, flags, noiseless))
  })

  it('drops once fatigaAcumulada crosses the block threshold', () => {
    const rested = makeSkater({ weeklyState: { fatigaAcumulada: 40 } })
    const tired  = makeSkater({ weeklyState: { fatigaAcumulada: 95 } })
    const elem = makeJumpElement()
    expect(computeGOE(tired, elem, {}, noiseless))
      .toBeLessThan(computeGOE(rested, elem, {}, noiseless))
  })

  it('rises with positive presionCompetitiva, falls with negative', () => {
    const pos = makeSkater({ psychological: { presionCompetitiva:  80 } })
    const neg = makeSkater({ psychological: { presionCompetitiva: -80 } })
    const elem = makeJumpElement()
    expect(computeGOE(pos, elem, {}, noiseless))
      .toBeGreaterThan(computeGOE(neg, elem, {}, noiseless))
  })

  it('has larger empirical stddev when resistenciaMental is low', () => {
    // balanced baseline so baseGOE ≈ 0 and noise is the dominant term
    const common: SkaterOverrides = {
      technical:   { saltos: 50, giros: 50, secuenciaDePasos: 50 },
      weeklyState: { fatigaAcumulada: 30 },
      psychological: { presionCompetitiva: 0 },
    }
    const lowMental  = makeSkater({ ...common, psychological: { ...common.psychological, resistenciaMental: 20 } })
    const highMental = makeSkater({ ...common, psychological: { ...common.psychological, resistenciaMental: 80 } })
    const elem = makeJumpElement()

    const N = 1000
    const rngLow  = mulberry32(1)
    const rngHigh = mulberry32(2)
    const samplesLow:  number[] = []
    const samplesHigh: number[] = []
    for (let i = 0; i < N; i++) {
      samplesLow.push(computeGOE(lowMental,  elem, {}, rngLow))
      samplesHigh.push(computeGOE(highMental, elem, {}, rngHigh))
    }
    expect(stddev(samplesLow)).toBeGreaterThan(stddev(samplesHigh))
  })
})

// ─── trimmedMean ──────────────────────────────────────────────────────────────

describe('trimmedMean (ISU trimming)', () => {
  it('drops single min and single max with 7 samples', () => {
    expect(trimmedMean([1, 3, 5, 5, 5, 7, 9])).toBe(5)
  })

  it('returns 0 for an empty array', () => {
    expect(trimmedMean([])).toBe(0)
  })

  it('falls back to plain mean with 2 samples', () => {
    expect(trimmedMean([2, 4])).toBe(3)
  })
})

// ─── computeTES / computeTESElement ───────────────────────────────────────────

describe('computeTES', () => {
  it('returns TES = 0 for a program with no elements', () => {
    const skater = makeSkater()
    const emptyProgram: ProgramData = { ...DEFAULT_PROGRAM_DATA, elementos: [] }
    const result = computeTES(emptyProgram, skater, {}, noiseless)
    expect(result.tes).toBe(0)
    expect(result.caidas).toBe(0)
    expect(result.deducciones).toBe(0)
  })
})

describe('computeTESElement', () => {
  it('applies the GOE factor to the base value', () => {
    const elem = makeJumpElement()
    expect(computeTESElement(elem, 0)).toBeCloseTo(elem.dificultadBase, 5)
    expect(computeTESElement(elem, 5)).toBeCloseTo(elem.dificultadBase * 1.5, 5)
    expect(computeTESElement(elem, -5)).toBeCloseTo(elem.dificultadBase * 0.5, 5)
  })
})

// ─── applyJudgeBias ───────────────────────────────────────────────────────────

describe('applyJudgeBias', () => {
  it('applies TES bias when no component is passed', () => {
    const judge: Judge = { id: 'j', nombre: 'J', pais: 'X', experiencia: 1, sesgos: { tes: 0.5 } }
    expect(applyJudgeBias(10, judge)).toBeCloseTo(10.5, 5)
  })

  it('applies per-component PCS bias', () => {
    const judge: Judge = {
      id: 'j', nombre: 'J', pais: 'X', experiencia: 1,
      sesgos: { pcs: { sk: 0.3, tr: -0.2 } },
    }
    expect(applyJudgeBias(7, judge, 'sk')).toBeCloseTo(7.3, 5)
    expect(applyJudgeBias(7, judge, 'tr')).toBeCloseTo(6.8, 5)
    expect(applyJudgeBias(7, judge, 'pe')).toBeCloseTo(7.0, 5)
  })
})

// ─── simulate sanity check ───────────────────────────────────────────────────

describe('simulate', () => {
  it('produces a total in [150, 220] for attrs≈70, 8 elements base 5.0, 7 neutral judges', () => {
    const skater = makeSkater({
      technical: { saltos: 70, giros: 70, secuenciaDePasos: 70, amplitudLinea: 70 },
      psychological: {
        confianza:            70,
        resistenciaMental:    70,
        presionCompetitiva:   0,
        motivacionIntrinseca: 70,
        autoexigencia:        70,
      },
      physical: {
        techosBiologico:       85,
        historialLesiones:     10,
        velocidadRecuperacion: 80,
      },
      weeklyState: {
        vinculo:           70,
        fatigaAcumulada:   30,
        estres:            30,
        semanasEntrenadas: 10,
        currentInjury:     null,
      },
    })
    const elementos: ProgramElement[] = Array.from({ length: 8 }, (_, i) => ({
      tipo:               'salto',
      tipoSalto:          'toeloop',
      dificultadBase:     5.0,
      posicionEnPrograma: i + 1,
      esCombinacion:      false,
      rotaciones:         3,
    }))
    const program: ProgramData = { ...DEFAULT_PROGRAM_DATA, tipo: 'libre', elementos }
    const judges = makeNeutralJudges(7)
    const rng = mulberry32(12345)

    const result = simulate(skater, program, judges, {}, rng)
    expect(result.total).toBeGreaterThanOrEqual(150)
    expect(result.total).toBeLessThanOrEqual(220)
  })
})
