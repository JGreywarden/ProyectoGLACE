// economy service — cash flow, financial pressure, sponsor review, prize money
// pure functions; no React, no Zustand, no effects (GDD cap. 7)

import {
  WEEKLY_EXPENSE_BASE,
  WEEKLY_INSTALLATION_MAINTENANCE_PER_LEVEL,
  FEDERATION_GRANT_BASE_WEEKLY,
  FEDERATION_GRANT_MULT_MIN,
  FEDERATION_GRANT_MULT_MAX,
  FINANCIAL_PRESSURE_THRESHOLDS,
  PRESION_VISIBLE_STRESS_WEEKLY,
  PRESION_CRISIS_STRESS_WEEKLY,
  SPONSOR_REVIEW_WINDOW_WEEKS,
  ISU_PRIZE_MONEY,
  TRAVEL_COST_BY_COMPETITION_TYPE,
} from '@/lib/balance'
import type { ClubData, Sponsor } from '@/types'
import type {
  CompetitionEconomy,
  SeasonData,
  CompetitionResult,
  CompetitionType,
} from '@/types'
import type { SkaterData, WeeklyState } from '@/types'
import type { InstallationData } from '@/services/dataService'

// ─── types ────────────────────────────────────────────────────────────────────

export type FinancialPressureState = 'estable' | 'leve' | 'visible' | 'crisis'

export interface SponsorReview {
  kept: Sponsor[]
  lost: Sponsor[]
}

/** one human-readable line that contributes to the weekly cash flow */
export interface CashFlowLine {
  label:  string
  amount: number
}

export interface CashFlowBreakdown {
  /** sponsors, federation grant, installation income, etc. (sign always positive) */
  ingresos: CashFlowLine[]
  /** base operations, maintenance, etc. (recorded as positive numbers; subtract from total) */
  gastos:   CashFlowLine[]
  /** sum(ingresos) − sum(gastos) */
  total:    number
}

// ─── 1. weekly cash flow ──────────────────────────────────────────────────────

/**
 * fully detailed cash-flow breakdown for the current week. each contributor
 * appears as its own line so the WeeklyPlanning panel can render labels with
 * amounts; the bare net number is in `total`.
 *
 * income lines: per-sponsor (one each), federation grant, installation rents.
 * expense lines: base operations, per-installation maintenance.
 */
export function computeWeeklyCashFlowBreakdown(
  club: ClubData,
  _season: SeasonData,
  installationsCatalog: InstallationData[] = [],
): CashFlowBreakdown {
  const ingresos: CashFlowLine[] = []
  const gastos:   CashFlowLine[] = []

  // sponsors — one line per active sponsor so the player sees what each one pays
  for (const s of club.sponsors) {
    if (s.ingresoSemanal > 0) {
      ingresos.push({ label: `sponsor · ${s.nombre}`, amount: s.ingresoSemanal })
    }
  }

  // subvención federativa: multiplicador 0.5 (reputacion=0) a 1.5 (reputacion=100)
  const institutional = clamp01to100(club.reputacion.institucional)
  const grantMult =
    FEDERATION_GRANT_MULT_MIN +
    (FEDERATION_GRANT_MULT_MAX - FEDERATION_GRANT_MULT_MIN) *
      (institutional / 100)
  const federationGrant = FEDERATION_GRANT_BASE_WEEKLY * grantMult
  if (federationGrant > 0) {
    ingresos.push({ label: 'subvención federativa', amount: federationGrant })
  }

  // operación base
  gastos.push({ label: 'gastos operativos base', amount: WEEKLY_EXPENSE_BASE })

  // ingresos y mantenimiento por instalación construida
  for (const inst of club.instalaciones) {
    if (inst.nivel === 0) continue
    const maintenance = inst.nivel * WEEKLY_INSTALLATION_MAINTENANCE_PER_LEVEL
    gastos.push({ label: `mantenimiento · ${inst.id} (nv ${inst.nivel})`, amount: maintenance })
    const catalogEntry = installationsCatalog.find(c => c.id === inst.id)
    if (!catalogEntry) continue
    const levelData = catalogEntry.niveles[inst.nivel]
    if (levelData?.bonificaciones.ingresoSemanal) {
      ingresos.push({
        label:  `instalación · ${inst.id}`,
        amount: levelData.bonificaciones.ingresoSemanal,
      })
    }
  }

  const totalIngresos = ingresos.reduce((s, l) => s + l.amount, 0)
  const totalGastos   = gastos.reduce((s, l) => s + l.amount, 0)
  return { ingresos, gastos, total: totalIngresos - totalGastos }
}

/**
 * net cash delta for the current week (€). thin wrapper over the detailed
 * breakdown so existing callers that only need the total keep working.
 */
export function computeWeeklyCashFlow(
  club: ClubData,
  season: SeasonData,
  installationsCatalog: InstallationData[] = [],
): number {
  return computeWeeklyCashFlowBreakdown(club, season, installationsCatalog).total
}

// ─── 2. financial pressure state ──────────────────────────────────────────────

/**
 * classify pressure as reservas / weeklyExpenses in weeks of coverage.
 * thresholds from FINANCIAL_PRESSURE_THRESHOLDS. weeklyExpenses <= 0 → estable.
 */
export function computeFinancialPressureState(
  club: ClubData,
  weeklyExpenses: number,
): FinancialPressureState {
  if (!Number.isFinite(weeklyExpenses) || weeklyExpenses <= 0) return 'estable'
  const weeksOfCoverage = club.presupuestoReservas / weeklyExpenses
  const t = FINANCIAL_PRESSURE_THRESHOLDS
  if (weeksOfCoverage > t.stable)  return 'estable'
  if (weeksOfCoverage > t.mild)    return 'leve'
  if (weeksOfCoverage > t.visible) return 'visible'
  return 'crisis'
}

// ─── 3. side effects on the skater ────────────────────────────────────────────

/**
 * skater-side consequences of the current financial pressure.
 * estable/leve: no effect. visible: estres +3. crisis: estres +5 + narrative flag.
 * returns a partial SkaterData ready to merge into the store action.
 */
export function applyFinancialPressureSideEffects(
  skater: SkaterData,
  state: FinancialPressureState,
): Partial<SkaterData> & {
  narrativeFlags?: Record<string, boolean>
} {
  if (state === 'estable' || state === 'leve') return {}

  const stressDelta =
    state === 'crisis'
      ? PRESION_CRISIS_STRESS_WEEKLY
      : PRESION_VISIBLE_STRESS_WEEKLY

  const nextWeekly: WeeklyState = {
    ...skater.weeklyState,
    estres: clamp01to100(skater.weeklyState.estres + stressDelta),
  }
  const patch: Partial<SkaterData> & {
    narrativeFlags?: Record<string, boolean>
  } = { weeklyState: nextWeekly }

  if (state === 'crisis') {
    patch.narrativeFlags = { crisis_financiera_activa: true }
  }
  return patch
}

// ─── 4. sponsor review ────────────────────────────────────────────────────────

/**
 * classify each sponsor as kept or lost based on its metricasExigidas.
 * - vinculoMinimo and reputacionCoachMinima are checked against current state.
 * - clasificacionMinima and pcsMinimo require SPONSOR_REVIEW_WINDOW_WEEKS (3)
 *   consecutive competition failures — matches "últimas 3 semanas consecutivas"
 *   in GDD cap. 7 by using the trailing window of resultadosTemporada.
 */
export function reviewSponsors(
  club: ClubData,
  skater: SkaterData,
  season: SeasonData,
): SponsorReview {
  const kept: Sponsor[] = []
  const lost: Sponsor[] = []

  const recentResults = season.resultadosTemporada.slice(
    -SPONSOR_REVIEW_WINDOW_WEEKS,
  )
  const hasFullWindow = recentResults.length >= SPONSOR_REVIEW_WINDOW_WEEKS

  for (const sponsor of club.sponsors) {
    if (failsCurrentStateChecks(sponsor, skater, club)) {
      lost.push(sponsor)
      continue
    }

    if (
      hasFullWindow &&
      hasCompetitionChecks(sponsor) &&
      recentResults.every(r => competitionFailsSponsor(r, sponsor))
    ) {
      lost.push(sponsor)
      continue
    }

    kept.push(sponsor)
  }

  return { kept, lost }
}

function failsCurrentStateChecks(
  sponsor: Sponsor,
  skater: SkaterData,
  club: ClubData,
): boolean {
  const m = sponsor.metricasExigidas
  if (
    m.vinculoMinimo !== undefined &&
    skater.weeklyState.vinculo < m.vinculoMinimo
  ) {
    return true
  }
  if (m.reputacionCoachMinima !== undefined) {
    const avg = averageClubReputation(club)
    if (avg < m.reputacionCoachMinima) return true
  }
  return false
}

function hasCompetitionChecks(sponsor: Sponsor): boolean {
  const m = sponsor.metricasExigidas
  return m.clasificacionMinima !== undefined || m.pcsMinimo !== undefined
}

function competitionFailsSponsor(
  result: CompetitionResult,
  sponsor: Sponsor,
): boolean {
  const m = sponsor.metricasExigidas
  if (
    m.clasificacionMinima !== undefined &&
    result.posicion > m.clasificacionMinima
  ) {
    return true
  }
  if (m.pcsMinimo !== undefined && result.pcs < m.pcsMinimo) {
    return true
  }
  return false
}

// ─── 5. prize money ───────────────────────────────────────────────────────────

/**
 * transfers ISU prize money to the club reserves for any qualifying position
 * (some events pay down to 6th place). returns a new ClubData — original is
 * not mutated. non-paying positions leave the club untouched.
 */
export function applyPrizeMoney(
  club: ClubData,
  competitionResult: CompetitionResult,
  competitionType: CompetitionType,
): ClubData {
  const amount = computePrizeAmount(competitionResult, competitionType)
  if (amount <= 0) return club
  return {
    ...club,
    presupuestoReservas: club.presupuestoReservas + amount,
  }
}

/** prize money for a player's position; 0 when off-podium or table missing */
export function computePrizeAmount(
  result: CompetitionResult,
  type: CompetitionType = result.tipo,
): number {
  if (result.posicion < 1) return 0
  return getPrizeAmount(type, result.posicion)
}

/** travel cost for attending one competition: hotel, flights, per diem staff */
export function computeTravelCost(type: CompetitionType): number {
  return TRAVEL_COST_BY_COMPETITION_TYPE[type] ?? 0
}

/**
 * full economic outcome for one competition. premio + bonoExtra − gastoViaje.
 * the orchestrator surfaces this on `CompetitionResult.economiaDetalle` so the
 * UI can render a "Premio: X · Viaje: Y · Neto: Z" breakdown.
 */
export function computeCompetitionEconomy(
  result: CompetitionResult,
): CompetitionEconomy {
  const premio     = computePrizeAmount(result)
  const gastoViaje = computeTravelCost(result.tipo)
  // bonoExtra reservado para Fase 2 (sponsors con bonos por podio); 0 por ahora
  const bonoExtra  = 0
  return {
    premio,
    gastoViaje,
    bonoExtra,
    neto: premio + bonoExtra - gastoViaje,
  }
}

function getPrizeAmount(type: CompetitionType, posicion: number): number {
  // tables in @/lib/balance go up to position 6 for some events (GP, Worlds);
  // narrow generically and let the optional chain return 0 for unknown rows
  const table = TABLE_BY_TYPE[type]
  if (!table) return 0
  const row = (table as Record<number, number>)[posicion]
  return typeof row === 'number' ? row : 0
}

const TABLE_BY_TYPE: Readonly<Partial<Record<CompetitionType, Readonly<Record<number, number>>>>> = {
  nacional:       ISU_PRIZE_MONEY.NATIONAL,
  internacional:  ISU_PRIZE_MONEY.INTERNATIONAL,
  grandprix:      ISU_PRIZE_MONEY.GP,
  finalGrandprix: ISU_PRIZE_MONEY.GP_FINAL,
  europeo:        ISU_PRIZE_MONEY.EUROPEAN,
  mundial:        ISU_PRIZE_MONEY.WORLDS,
  olimpico:       ISU_PRIZE_MONEY.OLYMPIC,
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0)   return 0
  if (n > 100) return 100
  return n
}

function averageClubReputation(club: ClubData): number {
  const r = club.reputacion
  return (r.tecnica + r.artistica + r.pedagogica + r.institucional + r.mediatica) / 5
}
