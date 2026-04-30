// economy: budget, sponsors, salaries, prize money, facility costs

export {
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

export type {
  CashFlowBreakdown,
  CashFlowLine,
  FinancialPressureState,
  SponsorReview,
} from './service'
