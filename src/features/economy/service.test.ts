import { describe, it, expect } from 'vitest'
import {
  computeWeeklyCashFlow,
  computeWeeklyCashFlowBreakdown,
  computeFinancialPressureState,
  applyFinancialPressureSideEffects,
  reviewSponsors,
  applyPrizeMoney,
  computePrizeAmount,
  computeTravelCost,
  computeCompetitionEconomy,
} from './service'
import {
  PRESION_VISIBLE_STRESS_WEEKLY,
  PRESION_CRISIS_STRESS_WEEKLY,
  ISU_PRIZE_MONEY,
  TRAVEL_COST_BY_COMPETITION_TYPE,
  WEEKLY_EXPENSE_BASE,
} from '@/lib/balance'
import { DEFAULT_CLUB_DATA } from '@/types/club'
import type { ClubData, Sponsor } from '@/types/club'
import { DEFAULT_SKATER_DATA } from '@/types/skater'
import type { SkaterData } from '@/types/skater'
import { DEFAULT_SEASON_DATA } from '@/types/season'
import type { SeasonData, CompetitionResult } from '@/types/season'

// ─── fixtures ─────────────────────────────────────────────────────────────────

function makeClub(overrides: Partial<ClubData> = {}): ClubData {
  return {
    ...DEFAULT_CLUB_DATA,
    id: 'test-club',
    nombre: 'Test Club',
    ...overrides,
  }
}

function makeSkater(overrides: Partial<SkaterData> = {}): SkaterData {
  return {
    ...DEFAULT_SKATER_DATA,
    id: 'test-skater',
    name: 'Test Skater',
    ...overrides,
  }
}

function makeSeason(overrides: Partial<SeasonData> = {}): SeasonData {
  return {
    ...DEFAULT_SEASON_DATA,
    ...overrides,
  }
}

function makeResult(posicion: number, overrides: Partial<CompetitionResult> = {}): CompetitionResult {
  return {
    id: `r-${posicion}-${Math.random()}`,
    skaterId: 'test-skater',
    semana: 10,
    nombreCompeticion: 'Test Event',
    tipo: 'grandprix',
    tes: 80,
    pcs: 70,
    pcsDetalle: { sk: 14, tr: 14, pe: 14, co: 14, in: 14 },
    total: 150,
    posicion,
    caidas: 0,
    deducciones: 0,
    ...overrides,
  }
}

function makeSponsor(overrides: Partial<Sponsor> = {}): Sponsor {
  return {
    id: 'sponsor-1',
    nombre: 'Acme Blades',
    tipo: 'equipamiento',
    ingresoSemanal: 500,
    metricasExigidas: {},
    semanasRestantes: 20,
    ...overrides,
  }
}

// ─── computeWeeklyCashFlow ────────────────────────────────────────────────────

describe('computeWeeklyCashFlow', () => {
  it('returns negative for a brand-new club with no income', () => {
    const club = makeClub()
    const cash = computeWeeklyCashFlow(club, makeSeason(), [])
    // federation grant on default institutional=10 is modest; base expense 1500 dominates
    expect(cash).toBeLessThan(0)
  })

  it('adds sponsor ingresoSemanal to the cash flow', () => {
    const clubA = makeClub()
    const clubB = makeClub({ sponsors: [makeSponsor({ ingresoSemanal: 2000 })] })
    const diff =
      computeWeeklyCashFlow(clubB, makeSeason(), []) -
      computeWeeklyCashFlow(clubA, makeSeason(), [])
    expect(diff).toBe(2000)
  })

  it('scales the federation grant with reputacion.institucional', () => {
    const low  = makeClub({ reputacion: { ...DEFAULT_CLUB_DATA.reputacion, institucional:   0 } })
    const high = makeClub({ reputacion: { ...DEFAULT_CLUB_DATA.reputacion, institucional: 100 } })
    const cashLow  = computeWeeklyCashFlow(low,  makeSeason(), [])
    const cashHigh = computeWeeklyCashFlow(high, makeSeason(), [])
    // mult goes 0.5 → 1.5 ⇒ difference is exactly base grant (800 * 1.0)
    expect(cashHigh - cashLow).toBeCloseTo(800, 5)
  })
})

// ─── computeFinancialPressureState ────────────────────────────────────────────

describe('computeFinancialPressureState', () => {
  it('returns estable when reserves cover > 8 weeks', () => {
    const club = makeClub({ presupuestoReservas: 100_000 })
    expect(computeFinancialPressureState(club, 5_000)).toBe('estable')
  })

  it('returns leve when reserves cover between 4 and 8 weeks', () => {
    const club = makeClub({ presupuestoReservas: 30_000 })
    expect(computeFinancialPressureState(club, 5_000)).toBe('leve')
  })

  it('returns visible when reserves cover between 2 and 4 weeks', () => {
    const club = makeClub({ presupuestoReservas: 15_000 })
    expect(computeFinancialPressureState(club, 5_000)).toBe('visible')
  })

  it('returns crisis when reserves cover less than 2 weeks', () => {
    const club = makeClub({ presupuestoReservas: 5_000 })
    expect(computeFinancialPressureState(club, 5_000)).toBe('crisis')
  })
})

// ─── applyFinancialPressureSideEffects ────────────────────────────────────────

describe('applyFinancialPressureSideEffects', () => {
  it('returns an empty patch when state is estable', () => {
    const skater = makeSkater()
    expect(applyFinancialPressureSideEffects(skater, 'estable')).toEqual({})
  })

  it('returns an empty patch when state is leve', () => {
    const skater = makeSkater()
    expect(applyFinancialPressureSideEffects(skater, 'leve')).toEqual({})
  })

  it('adds exactly 3 to estres when state is visible', () => {
    const skater = makeSkater()
    const baseline = skater.weeklyState.estres
    const patch = applyFinancialPressureSideEffects(skater, 'visible')
    expect(patch.weeklyState?.estres).toBe(baseline + PRESION_VISIBLE_STRESS_WEEKLY)
    expect(patch.weeklyState?.estres).toBe(baseline + 3)
    expect(patch.narrativeFlags).toBeUndefined()
  })

  it('adds 5 estres and sets crisis flag when state is crisis', () => {
    const skater = makeSkater()
    const baseline = skater.weeklyState.estres
    const patch = applyFinancialPressureSideEffects(skater, 'crisis')
    expect(patch.weeklyState?.estres).toBe(baseline + PRESION_CRISIS_STRESS_WEEKLY)
    expect(patch.narrativeFlags).toEqual({ crisis_financiera_activa: true })
  })

  it('caps estres at 100', () => {
    const skater = makeSkater({
      weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, estres: 98 },
    })
    const patch = applyFinancialPressureSideEffects(skater, 'crisis')
    expect(patch.weeklyState?.estres).toBe(100)
  })
})

// ─── reviewSponsors ───────────────────────────────────────────────────────────

describe('reviewSponsors', () => {
  it('drops a sponsor when last 3 results all fail clasificacionMinima', () => {
    const sponsor = makeSponsor({ metricasExigidas: { clasificacionMinima: 3 } })
    const club = makeClub({ sponsors: [sponsor] })
    const season = makeSeason({
      resultadosTemporada: [
        makeResult(5),
        makeResult(4),
        makeResult(6),
      ],
    })
    const { kept, lost } = reviewSponsors(club, makeSkater(), season)
    expect(lost).toHaveLength(1)
    expect(lost[0].id).toBe(sponsor.id)
    expect(kept).toHaveLength(0)
  })

  it('keeps a sponsor when failures are not 3 consecutive', () => {
    const sponsor = makeSponsor({ metricasExigidas: { clasificacionMinima: 3 } })
    const club = makeClub({ sponsors: [sponsor] })
    const season = makeSeason({
      resultadosTemporada: [
        makeResult(5),
        makeResult(2), // passes — breaks the streak
        makeResult(5),
      ],
    })
    const { kept, lost } = reviewSponsors(club, makeSkater(), season)
    expect(kept).toHaveLength(1)
    expect(lost).toHaveLength(0)
  })

  it('keeps a sponsor when history has fewer than 3 results', () => {
    const sponsor = makeSponsor({ metricasExigidas: { clasificacionMinima: 3 } })
    const club = makeClub({ sponsors: [sponsor] })
    const season = makeSeason({
      resultadosTemporada: [makeResult(8), makeResult(9)],
    })
    const { kept } = reviewSponsors(club, makeSkater(), season)
    expect(kept).toHaveLength(1)
  })

  it('drops a sponsor when the current vinculoMinimo is not met', () => {
    const sponsor = makeSponsor({ metricasExigidas: { vinculoMinimo: 50 } })
    const club = makeClub({ sponsors: [sponsor] })
    const skater = makeSkater({
      weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState, vinculo: 20 },
    })
    const { lost } = reviewSponsors(club, skater, makeSeason())
    expect(lost).toHaveLength(1)
  })
})

// ─── applyPrizeMoney ──────────────────────────────────────────────────────────

describe('applyPrizeMoney', () => {
  it('adds GP 1st place prize (12 000) to club reserves', () => {
    const club = makeClub({ presupuestoReservas: 10_000 })
    const result = makeResult(1, { tipo: 'grandprix' })
    const updated = applyPrizeMoney(club, result, 'grandprix')
    expect(updated.presupuestoReservas).toBe(10_000 + ISU_PRIZE_MONEY.GP[1])
    expect(updated.presupuestoReservas).toBe(22_000)
  })

  it('adds GP Final 2nd place prize (18 000)', () => {
    const club = makeClub({ presupuestoReservas: 0 })
    const result = makeResult(2, { tipo: 'finalGrandprix' })
    const updated = applyPrizeMoney(club, result, 'finalGrandprix')
    expect(updated.presupuestoReservas).toBe(18_000)
  })

  it('grand prix now pays positions 4–6 per ISU 2024 schedule', () => {
    const club = makeClub({ presupuestoReservas: 10_000 })
    const result = makeResult(4)
    const updated = applyPrizeMoney(club, result, 'grandprix')
    expect(updated.presupuestoReservas).toBe(13_000)  // 10000 + GP[4]=3000
  })

  it('does not pay when posicion is beyond the table (e.g. 7th in nationals)', () => {
    const club = makeClub({ presupuestoReservas: 10_000 })
    const result = makeResult(7)
    const updated = applyPrizeMoney(club, result, 'nacional')
    expect(updated.presupuestoReservas).toBe(10_000)
  })

  it('does not mutate the original club', () => {
    const club = makeClub({ presupuestoReservas: 10_000 })
    const result = makeResult(1)
    applyPrizeMoney(club, result, 'grandprix')
    expect(club.presupuestoReservas).toBe(10_000)
  })
})

// ─── Fase D — desglose económico ────────────────────────────────────────────

describe('computeWeeklyCashFlowBreakdown', () => {
  it('totals match computeWeeklyCashFlow', () => {
    const sponsor: Sponsor = makeSponsor({ ingresoSemanal: 200 })
    const club = makeClub({ sponsors: [sponsor] })
    const breakdown = computeWeeklyCashFlowBreakdown(club, makeSeason(), [])
    const flat     = computeWeeklyCashFlow(club, makeSeason(), [])
    expect(breakdown.total).toBeCloseTo(flat, 5)
  })

  it('produces one income line per active sponsor', () => {
    const a: Sponsor = makeSponsor({ id: 'a', nombre: 'Acme', ingresoSemanal: 300 })
    const b: Sponsor = makeSponsor({ id: 'b', nombre: 'Beta', ingresoSemanal: 150 })
    const club = makeClub({ sponsors: [a, b] })
    const out = computeWeeklyCashFlowBreakdown(club, makeSeason(), [])
    expect(out.ingresos.filter(l => l.label.startsWith('sponsor')).length).toBe(2)
    expect(out.ingresos.find(l => l.label.includes('Acme'))?.amount).toBe(300)
    expect(out.ingresos.find(l => l.label.includes('Beta'))?.amount).toBe(150)
  })

  it('always includes an operations base expense', () => {
    const out = computeWeeklyCashFlowBreakdown(makeClub(), makeSeason(), [])
    expect(out.gastos.some(l => l.label.includes('operativos'))).toBe(true)
    expect(out.gastos.find(l => l.label.includes('operativos'))?.amount).toBe(WEEKLY_EXPENSE_BASE)
  })
})

describe('computePrizeAmount', () => {
  it('returns 0 for unranked players', () => {
    const r = makeResult(0)
    expect(computePrizeAmount(r)).toBe(0)
  })

  it('reads the prize for podium positions in nationals', () => {
    const r = makeResult(2, { tipo: 'nacional' })
    expect(computePrizeAmount(r)).toBe(ISU_PRIZE_MONEY.NATIONAL[2])
  })

  it('reads the prize for 4th in GP per the extended ISU table', () => {
    const r = makeResult(4, { tipo: 'grandprix' })
    expect(computePrizeAmount(r)).toBe(ISU_PRIZE_MONEY.GP[4])
  })

  it('returns 0 for positions beyond the table (8th in nationals)', () => {
    const r = makeResult(8, { tipo: 'nacional' })
    expect(computePrizeAmount(r)).toBe(0)
  })
})

describe('computeTravelCost', () => {
  it('returns the configured cost for each competition type', () => {
    expect(computeTravelCost('nacional')).toBe(TRAVEL_COST_BY_COMPETITION_TYPE.nacional)
    expect(computeTravelCost('mundial')).toBe(TRAVEL_COST_BY_COMPETITION_TYPE.mundial)
    expect(computeTravelCost('olimpico')).toBe(TRAVEL_COST_BY_COMPETITION_TYPE.olimpico)
  })
})

describe('computeCompetitionEconomy', () => {
  it('combines premio − gastoViaje into neto', () => {
    const r = makeResult(1, { tipo: 'mundial' })
    const eco = computeCompetitionEconomy(r)
    expect(eco.premio).toBe(ISU_PRIZE_MONEY.WORLDS[1])
    expect(eco.gastoViaje).toBe(TRAVEL_COST_BY_COMPETITION_TYPE.mundial)
    expect(eco.bonoExtra).toBe(0)
    expect(eco.neto).toBe(eco.premio + eco.bonoExtra - eco.gastoViaje)
  })

  it('a non-podium result still nets a negative number from the travel cost', () => {
    const r = makeResult(15, { tipo: 'mundial' })
    const eco = computeCompetitionEconomy(r)
    expect(eco.premio).toBe(0)
    expect(eco.neto).toBeLessThan(0)
    expect(eco.neto).toBe(-TRAVEL_COST_BY_COMPETITION_TYPE.mundial)
  })
})
