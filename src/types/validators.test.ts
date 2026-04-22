import { describe, it, expect } from 'vitest'
import { validateSkaterData, DEFAULT_SKATER_DATA } from './skater'
import { validateSeasonData, DEFAULT_SEASON_DATA, validateCompetitionResult } from './season'
import { validateCoachData, DEFAULT_COACH_DATA } from './coach'
import { validateClubData, DEFAULT_CLUB_DATA } from './club'

describe('validateSkaterData', () => {
  it('accepts the DEFAULT_SKATER_DATA baseline', () => {
    expect(validateSkaterData(DEFAULT_SKATER_DATA)).toBe(true)
  })

  it('rejects saltos out of [0, 100]', () => {
    const bad = structuredClone(DEFAULT_SKATER_DATA)
    bad.technical.saltos = -5
    expect(validateSkaterData(bad)).toBe(false)
  })

  it('rejects non-numeric attributes', () => {
    const bad = structuredClone(DEFAULT_SKATER_DATA) as unknown as Record<string, unknown>
    ;(bad['technical'] as Record<string, unknown>)['saltos'] = 'high'
    expect(validateSkaterData(bad)).toBe(false)
  })

  it('rejects NaN or Infinity in fatigue', () => {
    const bad = structuredClone(DEFAULT_SKATER_DATA)
    bad.weeklyState.fatigaAcumulada = NaN
    expect(validateSkaterData(bad)).toBe(false)
    bad.weeklyState.fatigaAcumulada = Infinity
    expect(validateSkaterData(bad)).toBe(false)
  })

  it('accepts signed presionCompetitiva within [-100, 100]', () => {
    const ok = structuredClone(DEFAULT_SKATER_DATA)
    ok.psychological.presionCompetitiva = -40
    expect(validateSkaterData(ok)).toBe(true)
  })

  it('rejects presionCompetitiva outside [-100, 100]', () => {
    const bad = structuredClone(DEFAULT_SKATER_DATA)
    bad.psychological.presionCompetitiva = -150
    expect(validateSkaterData(bad)).toBe(false)
  })

  it('rejects negative semanasEntrenadas', () => {
    const bad = structuredClone(DEFAULT_SKATER_DATA)
    bad.weeklyState.semanasEntrenadas = -1
    expect(validateSkaterData(bad)).toBe(false)
  })

  it('rejects malformed currentInjury', () => {
    const bad = structuredClone(DEFAULT_SKATER_DATA) as unknown as Record<string, unknown>
    ;(bad['weeklyState'] as Record<string, unknown>)['currentInjury'] = { injuredAtWeek: -1 }
    expect(validateSkaterData(bad)).toBe(false)
  })
})

describe('validateSeasonData', () => {
  it('accepts the DEFAULT_SEASON_DATA baseline', () => {
    expect(validateSeasonData(DEFAULT_SEASON_DATA)).toBe(true)
  })

  it('rejects semanaActual outside [1, 30]', () => {
    const bad = { ...DEFAULT_SEASON_DATA, semanaActual: 0 }
    expect(validateSeasonData(bad)).toBe(false)
    const bad2 = { ...DEFAULT_SEASON_DATA, semanaActual: 31 }
    expect(validateSeasonData(bad2)).toBe(false)
  })

  it('rejects temporadaNumero < 1', () => {
    const bad = { ...DEFAULT_SEASON_DATA, temporadaNumero: 0 }
    expect(validateSeasonData(bad)).toBe(false)
  })
})

describe('validateCompetitionResult', () => {
  const baseline = {
    id:                '1-s1w15',
    skaterId:          'sk1',
    semana:            15,
    nombreCompeticion: 'GP España',
    tipo:              'grandprix',
    tes:               80.5,
    pcs:               70.2,
    pcsDetalle: { sk: 14, tr: 13, pe: 14, co: 14, in: 15 },
    total:             149.7,
    posicion:          3,
    caidas:            1,
    deducciones:       1.0,
  }

  it('accepts a well-formed result', () => {
    expect(validateCompetitionResult(baseline)).toBe(true)
  })

  it('rejects empty id', () => {
    expect(validateCompetitionResult({ ...baseline, id: '' })).toBe(false)
  })

  it('rejects NaN in tes', () => {
    expect(validateCompetitionResult({ ...baseline, tes: NaN })).toBe(false)
  })
})

describe('validateCoachData', () => {
  it('accepts the DEFAULT_COACH_DATA baseline', () => {
    expect(validateCoachData(DEFAULT_COACH_DATA)).toBe(true)
  })

  it('rejects branch profile not summing to ~1.0', () => {
    const bad = structuredClone(DEFAULT_COACH_DATA)
    bad.perfilInferido.ramaTecnica = 0.9
    bad.perfilInferido.ramaPsicologica = 0.9
    bad.perfilInferido.ramaDirectiva = 0.9
    expect(validateCoachData(bad)).toBe(false)
  })

  it('rejects reputation > 100', () => {
    const bad = structuredClone(DEFAULT_COACH_DATA)
    bad.reputacion.repResultados = 120
    expect(validateCoachData(bad)).toBe(false)
  })
})

describe('validateClubData', () => {
  it('accepts the DEFAULT_CLUB_DATA baseline', () => {
    expect(validateClubData(DEFAULT_CLUB_DATA)).toBe(true)
  })

  it('rejects installation nivel > 4', () => {
    const bad = structuredClone(DEFAULT_CLUB_DATA)
    bad.instalaciones[0].nivel = 5 as 0
    expect(validateClubData(bad)).toBe(false)
  })

  it('rejects non-finite presupuesto', () => {
    const bad = structuredClone(DEFAULT_CLUB_DATA)
    bad.presupuestoReservas = NaN
    expect(validateClubData(bad)).toBe(false)
  })

  it('accepts negative presupuesto (deuda)', () => {
    const ok = structuredClone(DEFAULT_CLUB_DATA)
    ok.presupuestoReservas = -5000
    expect(validateClubData(ok)).toBe(true)
  })
})
