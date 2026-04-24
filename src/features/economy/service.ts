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
} from '@/lib/balance'
import type { ClubData, Sponsor } from '@/types/club'
import type {
  SeasonData,
  CompetitionResult,
  CompetitionType,
} from '@/types/season'
import type { SkaterData, WeeklyState } from '@/types/skater'
import type { InstallationData } from '@/services/dataService'

// ─── types ────────────────────────────────────────────────────────────────────

export type FinancialPressureState = 'estable' | 'leve' | 'visible' | 'crisis'

export interface SponsorReview {
  kept: Sponsor[]
  lost: Sponsor[]
}

// ─── 1. weekly cash flow ──────────────────────────────────────────────────────

/**
 * net cash delta for the current week (€).
 * income: active sponsors + federation grant + installation-derived income.
 * outflow: base operating cost + level-weighted installation maintenance.
 * installations catalog is passed explicitly so the service remains pure.
 */
export function computeWeeklyCashFlow(
  club: ClubData,
  _season: SeasonData,
  installationsCatalog: InstallationData[] = [],
): number {
  // sponsors
  const sponsorIncome = club.sponsors.reduce(
    (sum, s) => sum + s.ingresoSemanal,
    0,
  )

  // subvención federativa: multiplicador 0.5 (reputacion=0) a 1.5 (reputacion=100)
  const institutional = clamp01to100(club.reputacion.institucional)
  const grantMult =
    FEDERATION_GRANT_MULT_MIN +
    (FEDERATION_GRANT_MULT_MAX - FEDERATION_GRANT_MULT_MIN) *
      (institutional / 100)
  const federationGrant = FEDERATION_GRANT_BASE_WEEKLY * grantMult

  // ingresos de instalaciones según nivel actual y mantenimiento acumulativo
  let installationIncome = 0
  let installationMaintenance = 0
  for (const inst of club.instalaciones) {
    if (inst.nivel === 0) continue
    installationMaintenance +=
      inst.nivel * WEEKLY_INSTALLATION_MAINTENANCE_PER_LEVEL
    const catalogEntry = installationsCatalog.find(c => c.id === inst.id)
    if (!catalogEntry) continue
    const levelData = catalogEntry.niveles[inst.nivel]
    if (levelData?.bonificaciones.ingresoSemanal) {
      installationIncome += levelData.bonificaciones.ingresoSemanal
    }
  }

  const income = sponsorIncome + federationGrant + installationIncome
  const expenses = WEEKLY_EXPENSE_BASE + installationMaintenance

  return income - expenses
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
 * transfers ISU prize money to the club reserves when the skater is on the
 * podium (posicion <= 3). returns a new ClubData — original is not mutated.
 * unknown or non-podium results leave the club untouched.
 */
export function applyPrizeMoney(
  club: ClubData,
  competitionResult: CompetitionResult,
  competitionType: CompetitionType,
): ClubData {
  if (competitionResult.posicion < 1 || competitionResult.posicion > 3) {
    return club
  }
  const amount = getPrizeAmount(competitionType, competitionResult.posicion)
  if (amount <= 0) return club
  return {
    ...club,
    presupuestoReservas: club.presupuestoReservas + amount,
  }
}

function getPrizeAmount(type: CompetitionType, posicion: number): number {
  const pos = posicion as 1 | 2 | 3
  switch (type) {
    case 'nacional':       return ISU_PRIZE_MONEY.NATIONAL[pos]      ?? 0
    case 'internacional':  return ISU_PRIZE_MONEY.INTERNATIONAL[pos] ?? 0
    case 'grandprix':      return ISU_PRIZE_MONEY.GP[pos]            ?? 0
    case 'finalGrandprix': return ISU_PRIZE_MONEY.GP_FINAL[pos]      ?? 0
    case 'europeo':        return ISU_PRIZE_MONEY.EUROPEAN[pos]      ?? 0
    case 'mundial':        return ISU_PRIZE_MONEY.WORLDS[pos]        ?? 0
    case 'olimpico':       return ISU_PRIZE_MONEY.OLYMPIC[pos]       ?? 0
    default:               return 0
  }
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
