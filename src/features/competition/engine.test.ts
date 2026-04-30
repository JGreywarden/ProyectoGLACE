import { describe, it, expect } from 'vitest'
import {
  applyMomentToElements,
  applyMomentToResult,
  computeGOE,
  computeTES,
  computeTESElement,
  finalizeProgramScore,
  simulate,
  simulateProgramElements,
  summarizeMomentImpact,
  trimmedMean,
  applyJudgeBias,
  type CompetitionContextFlags,
  type RNG,
} from './engine'
import { DEFAULT_SKATER_DATA } from '@/types/skater'
import { DEFAULT_PROGRAM_DATA } from '@/types/program'
import type { SkaterData, TechnicalAttributes, PsychologicalAttributes, WeeklyState, PhysicalPermanentAttributes } from '@/types/skater'
import type { ProgramData, ProgramElement } from '@/types/program'
import type { CompetitionResult } from '@/types/season'
import type { Judge } from '@/services/dataService'
import type { MomentOutcome } from '@/features/narrative'

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

// ─── applyMomentToResult ──────────────────────────────────────────────────────

describe('applyMomentToResult', () => {
  // every salto element gets factor 0.10 (ELEMENT_GOE_TES_FACTOR['salto'])
  const elements: ProgramElement[] = [
    { tipo: 'salto', tipoSalto: 'toeloop', dificultadBase: 4.2, posicionEnPrograma: 1, esCombinacion: false, rotaciones: 3 },
    { tipo: 'salto', tipoSalto: 'flip',    dificultadBase: 5.3, posicionEnPrograma: 2, esCombinacion: false, rotaciones: 3 },
    { tipo: 'salto', tipoSalto: 'lutz',    dificultadBase: 5.9, posicionEnPrograma: 3, esCombinacion: false, rotaciones: 3 },
  ]
  const baseResult: CompetitionResult = {
    id: 'k-s1w15', skaterId: 'k', semana: 15,
    nombreCompeticion: 'Test', tipo: 'nacional',
    tes: 100, pcs: 80, pcsDetalle: { sk: 8, tr: 8, pe: 8, co: 8, in: 8 },
    total: 180, posicion: 1, caidas: 0, deducciones: 0,
  }

  it('adds goeBonusCurrent only to the element at fromElementIndex', () => {
    const outcome: MomentOutcome = {
      goeBonusCurrent: 1.0, goeBonusRemaining: 0,
      varianzaMultiplier: 1, bondDelta: 0, causesFall: false, flagsPatch: {},
    }
    const next = applyMomentToResult(baseResult, outcome, 0, elements)
    // ΔTES = 4.2 × 0.10 × 1.0 = 0.42
    expect(next.tes).toBeCloseTo(100.42, 5)
    expect(next.total).toBeCloseTo(180.42, 5)
  })

  it('adds goeBonusRemaining to every element after fromElementIndex', () => {
    const outcome: MomentOutcome = {
      goeBonusCurrent: 0, goeBonusRemaining: 0.3,
      varianzaMultiplier: 1, bondDelta: 0, causesFall: false, flagsPatch: {},
    }
    const next = applyMomentToResult(baseResult, outcome, 0, elements)
    // ΔTES = (5.3 + 5.9) × 0.10 × 0.3 = 0.336
    expect(next.tes).toBeCloseTo(100.336, 4)
  })

  it('does not mutate the input result', () => {
    const outcome: MomentOutcome = {
      goeBonusCurrent: 0.5, goeBonusRemaining: 0.1,
      varianzaMultiplier: 1, bondDelta: 0, causesFall: false, flagsPatch: {},
    }
    const before = JSON.stringify(baseResult)
    applyMomentToResult(baseResult, outcome, 1, elements)
    expect(JSON.stringify(baseResult)).toBe(before)
  })

  it('is a no-op when programElements is empty', () => {
    const outcome: MomentOutcome = {
      goeBonusCurrent: 1, goeBonusRemaining: 1,
      varianzaMultiplier: 1, bondDelta: 0, causesFall: false, flagsPatch: {},
    }
    const next = applyMomentToResult(baseResult, outcome, 0, [])
    expect(next.tes).toBe(baseResult.tes)
    expect(next.total).toBe(baseResult.total)
  })

  it('clamps fromElementIndex out of range to a valid position', () => {
    const outcome: MomentOutcome = {
      goeBonusCurrent: 1.0, goeBonusRemaining: 0,
      varianzaMultiplier: 1, bondDelta: 0, causesFall: false, flagsPatch: {},
    }
    // index 99 is treated as last (index 2)
    const next = applyMomentToResult(baseResult, outcome, 99, elements)
    // ΔTES = 5.9 × 0.10 × 1.0 = 0.59
    expect(next.tes).toBeCloseTo(100.59, 5)
  })

  it('preserves pcs and deducciones in the recomputed total', () => {
    const r: CompetitionResult = { ...baseResult, deducciones: 2 }
    const outcome: MomentOutcome = {
      goeBonusCurrent: 0.5, goeBonusRemaining: 0,
      varianzaMultiplier: 1, bondDelta: 0, causesFall: false, flagsPatch: {},
    }
    const next = applyMomentToResult(r, outcome, 1, elements)
    // total = tes' + pcs - deducciones = 100.265 + 80 - 2 = 178.265
    expect(next.total).toBeCloseTo(next.tes + next.pcs - next.deducciones, 5)
  })
})

// ─── simulateProgramElements + finalizeProgramScore ──────────────────────────

describe('simulateProgramElements', () => {
  function tinyProgram(): ProgramData {
    const elementos: ProgramElement[] = [
      { tipo: 'salto', tipoSalto: 'toeloop', dificultadBase: 4.2, posicionEnPrograma: 1, esCombinacion: false, rotaciones: 3 },
      { tipo: 'giro',  tipoSalto: null,     dificultadBase: 3.0, posicionEnPrograma: 2, esCombinacion: false, rotaciones: null },
      { tipo: 'salto', tipoSalto: 'flip',   dificultadBase: 5.3, posicionEnPrograma: 3, esCombinacion: false, rotaciones: 3 },
    ]
    return { ...DEFAULT_PROGRAM_DATA, tipo: 'libre', elementos }
  }

  it('returns one ElementOutcome per program element with goe in [-5, +5]', () => {
    const skater = makeSkater()
    const elements = simulateProgramElements(tinyProgram(), skater, {}, mulberry32(7))
    expect(elements).toHaveLength(3)
    for (const e of elements) {
      expect(e.goe).toBeGreaterThanOrEqual(-5)
      expect(e.goe).toBeLessThanOrEqual(5)
      expect(e.tesBruto).toBeGreaterThanOrEqual(0)
    }
  })

  it('is reproducible for a given seeded rng', () => {
    const skater = makeSkater()
    const a = simulateProgramElements(tinyProgram(), skater, {}, mulberry32(123))
    const b = simulateProgramElements(tinyProgram(), skater, {}, mulberry32(123))
    expect(a.map(e => e.goe)).toEqual(b.map(e => e.goe))
  })

  it('falls register caída with the standard ISU deduction across many trials', () => {
    // very weak, very tired skater → some trials must trigger a fall
    const skater = makeSkater({
      technical: { saltos: 5, giros: 5, secuenciaDePasos: 5, amplitudLinea: 5 },
      psychological: { resistenciaMental: 0, presionCompetitiva: -100 },
      weeklyState: { fatigaAcumulada: 100, estres: 100 },
    })
    let totalFalls = 0
    for (let seed = 1; seed <= 80; seed++) {
      const elements = simulateProgramElements(tinyProgram(), skater, {}, mulberry32(seed))
      for (const e of elements) {
        if (e.element.tipo === 'salto' && e.caida) {
          totalFalls += 1
          expect(e.deduccion).toBeCloseTo(1.0, 5)
        }
      }
    }
    expect(totalFalls).toBeGreaterThan(0)
  })
})

describe('finalizeProgramScore', () => {
  it('sums TES and deductions across the elements and reflects the total', () => {
    const skater = makeSkater({
      technical: { saltos: 70, giros: 70, secuenciaDePasos: 70, amplitudLinea: 70 },
    })
    const program: ProgramData = {
      ...DEFAULT_PROGRAM_DATA,
      tipo: 'libre',
      elementos: Array.from({ length: 6 }, (_, i) => ({
        tipo: 'salto' as const,
        tipoSalto: 'toeloop' as const,
        dificultadBase: 4.2,
        posicionEnPrograma: i + 1,
        esCombinacion: false,
        rotaciones: 3 as const,
      })),
    }
    const judges = makeNeutralJudges(7)
    const elements = simulateProgramElements(program, skater, {}, mulberry32(42))
    const score = finalizeProgramScore(elements, skater, program, judges)
    const expectedTes = elements.reduce((s, e) => s + e.tesBruto, 0)
    const expectedDed = elements.reduce((s, e) => s + e.deduccion, 0)
    expect(score.tes).toBeCloseTo(expectedTes, 5)
    expect(score.deducciones).toBeCloseTo(expectedDed, 5)
    expect(score.total).toBeCloseTo(score.tes + score.pcs - score.deducciones, 5)
    expect(score.programType).toBe('libre')
  })
})

describe('applyMomentToElements', () => {
  function jumpyProgram(): ProgramElement[] {
    return [
      { tipo: 'salto', tipoSalto: 'toeloop', dificultadBase: 4.2, posicionEnPrograma: 1, esCombinacion: false, rotaciones: 3 },
      { tipo: 'salto', tipoSalto: 'flip',    dificultadBase: 5.3, posicionEnPrograma: 2, esCombinacion: false, rotaciones: 3 },
      { tipo: 'salto', tipoSalto: 'lutz',    dificultadBase: 5.9, posicionEnPrograma: 3, esCombinacion: false, rotaciones: 3 },
    ]
  }

  it('mutating elements at index 0 with goeBonusCurrent updates only that element', () => {
    // moderate skater so the bonus does not bump us against the [-5, +5] clamp
    const skater = makeSkater({
      technical: { saltos: 50, giros: 50, secuenciaDePasos: 50, amplitudLinea: 50 },
      psychological: { resistenciaMental: 80, presionCompetitiva: 0 },
    })
    const program: ProgramData = { ...DEFAULT_PROGRAM_DATA, tipo: 'libre', elementos: jumpyProgram() }
    const elements = simulateProgramElements(program, skater, {}, mulberry32(7))
    const outcome: MomentOutcome = {
      goeBonusCurrent: 1.0, goeBonusRemaining: 0,
      varianzaMultiplier: 1, bondDelta: 0, causesFall: false, flagsPatch: {},
    }
    const after = applyMomentToElements(elements, outcome, 0, false)
    expect(after[0].goe).toBeCloseTo(elements[0].goe + 1.0, 5)
    expect(after[1].goe).toBeCloseTo(elements[1].goe, 5)
  })

  it('causesFall forces the current jump into a fall and registers the deduction', () => {
    const skater = makeSkater({
      technical: { saltos: 80, giros: 80, secuenciaDePasos: 80 },
    })
    const program: ProgramData = { ...DEFAULT_PROGRAM_DATA, tipo: 'libre', elementos: jumpyProgram() }
    const elements = simulateProgramElements(program, skater, {}, mulberry32(11))
    const outcome: MomentOutcome = {
      goeBonusCurrent: 0, goeBonusRemaining: 0,
      varianzaMultiplier: 1, bondDelta: 0, causesFall: true, flagsPatch: {},
    }
    const after = applyMomentToElements(elements, outcome, 1, true)
    expect(after[1].caida).toBe(true)
    expect(after[1].deduccion).toBeCloseTo(1.0, 5)
    // first-fall propagation (Anna Müller) bites the next element when no prior fall
    expect(after[2].goe).toBeLessThan(elements[2].goe)
  })

  it('does not mutate the input array', () => {
    const elements = [
      { element: jumpyProgram()[0], goe: 1.0, caida: false, invalid: false, tesBruto: 4.62, deduccion: 0 },
      { element: jumpyProgram()[1], goe: 0.5, caida: false, invalid: false, tesBruto: 5.565, deduccion: 0 },
    ]
    const before = JSON.stringify(elements)
    applyMomentToElements(elements, {
      goeBonusCurrent: 1, goeBonusRemaining: 1,
      varianzaMultiplier: 1, bondDelta: 0, causesFall: false, flagsPatch: {},
    }, 0, false)
    expect(JSON.stringify(elements)).toBe(before)
  })
})

describe('summarizeMomentImpact', () => {
  it('reports a positive deltaTes when the moment improves execution', () => {
    const program: ProgramElement[] = [
      { tipo: 'salto', tipoSalto: 'toeloop', dificultadBase: 4.2, posicionEnPrograma: 1, esCombinacion: false, rotaciones: 3 },
      { tipo: 'salto', tipoSalto: 'flip',    dificultadBase: 5.3, posicionEnPrograma: 2, esCombinacion: false, rotaciones: 3 },
    ]
    const before = [
      { element: program[0], goe: 0.0, caida: false, invalid: false, tesBruto: 4.2, deduccion: 0 },
      { element: program[1], goe: 0.0, caida: false, invalid: false, tesBruto: 5.3, deduccion: 0 },
    ]
    const after = [
      { element: program[0], goe: 1.0, caida: false, invalid: false, tesBruto: 4.62, deduccion: 0 },
      { element: program[1], goe: 0.0, caida: false, invalid: false, tesBruto: 5.3, deduccion: 0 },
    ]
    const impact = summarizeMomentImpact(before, after, 'libre', 'mom-1', 'opt-a', false)
    expect(impact.deltaTes).toBeCloseTo(0.42, 5)
    expect(impact.causesFall).toBe(false)
    expect(impact.descripcion).toContain('+0.4')
  })
})
