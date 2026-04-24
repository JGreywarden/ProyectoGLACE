// orchestrator for a single game week — composes training, athlete, narrative,
// competition and economy into one atomic transition. pure with respect to the
// store: the caller commits the result via gameStore.applyWeekTransition.

import { resolveWeekEffects } from '@/features/training'
import type { WeekSchedule, TensionId } from '@/features/training'
import {
  applyAttributeGains,
  applyBondDecay,
  applyFatigueRecovery,
} from '@/features/athlete'
import {
  selectWeeklyEvent,
} from '@/features/narrative'
import type {
  NarrativeContext,
  NarrativeEvent,
} from '@/features/narrative'
import { runCompetition } from '@/features/competition'
import {
  applyFinancialPressureSideEffects,
  applyPrizeMoney,
  computeFinancialPressureState,
  computeWeeklyCashFlow,
  reviewSponsors,
} from '@/features/economy'
import {
  WEEKLY_EXPENSE_BASE,
  WEEKLY_INSTALLATION_MAINTENANCE_PER_LEVEL,
} from '@/lib/balance'
import type { ClubData, InstallationId, InstallationLevel } from '@/types/club'
import type {
  CompetitionResult,
  CompetitionSlot,
  SeasonData,
  WeekSummary,
} from '@/types/season'
import {
  getFasePorSemana,
  makeCompetitionResultId,
} from '@/types/season'
import type { SkaterData, WeeklyState } from '@/types/skater'
import type { CoachData } from '@/types/coach'
import type { ProgramData } from '@/types/program'
import type {
  Judge,
  TraitData,
  InstallationData,
} from '@/services/dataService'

// ─── types ────────────────────────────────────────────────────────────────────

export interface WeekContext {
  skater:            SkaterData
  coach:             CoachData
  club:              ClubData
  season:            SeasonData
  schedule:          WeekSchedule
  narrativeContext:  NarrativeContext
  allTraits:         TraitData[]
  allJudges:         Judge[]
  /** current program for competitions; null when the week has no competition */
  program:           ProgramData | null
  /** optional installations catalog; needed for accurate cash-flow income calc */
  installationsCatalog?: InstallationData[]
  /** subset of judges used for the competition panel; defaults to allJudges */
  competitionJudges?: Judge[]
}

export interface WeekResult {
  skater:             SkaterData
  club:               ClubData
  season:             SeasonData
  triggeredEvent:     NarrativeEvent | null
  competitionResult:  CompetitionResult | null
  weekSummary:        WeekSummary
  tensionsTriggered:  TensionId[]
  /** true when the advanced semanaActual now points past the final week (31) */
  seasonEndReached:   boolean
  /** net cash delta applied this week (positive = surplus) */
  cashDelta:          number
  /** financial pressure bucket after applying this week's cash flow */
  pressureState:      'estable' | 'leve' | 'visible' | 'crisis'
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v))

function installationLevelRecord(
  club: ClubData,
): Partial<Record<InstallationId, InstallationLevel>> {
  const out: Partial<Record<InstallationId, InstallationLevel>> = {}
  for (const inst of club.instalaciones) out[inst.id] = inst.nivel
  return out
}

/** recovery bonus in fatigue points: fisioterapia tier × 2 + pistaPrincipal tier × 1 */
function computeRecoveryBonus(club: ClubData): number {
  const fisio   = club.instalaciones.find(i => i.id === 'fisioterapia')?.nivel   ?? 0
  const pista   = club.instalaciones.find(i => i.id === 'pistaPrincipal')?.nivel ?? 0
  return fisio * 2 + pista
}

/** real weekly outflow: base + per-level maintenance of every built installation */
function computeWeeklyExpenses(club: ClubData): number {
  const maintenance = club.instalaciones.reduce(
    (sum, i) => sum + i.nivel * WEEKLY_INSTALLATION_MAINTENANCE_PER_LEVEL,
    0,
  )
  return WEEKLY_EXPENSE_BASE + maintenance
}

function findCompetitionSlot(season: SeasonData): CompetitionSlot | undefined {
  return season.calendario.find(
    c => c.semana === season.semanaActual && c.clasificado,
  )
}

/** shallow-deep clone of a skater so we never mutate the input */
function cloneSkater(s: SkaterData): SkaterData {
  return {
    ...s,
    technical:     { ...s.technical },
    psychological: { ...s.psychological },
    physical:      { ...s.physical },
    weeklyState:   {
      ...s.weeklyState,
      currentInjury: s.weeklyState.currentInjury
        ? { ...s.weeklyState.currentInjury }
        : null,
    },
    traits: s.traits.map(t => ({ ...t })),
  }
}

function cloneClub(c: ClubData): ClubData {
  return {
    ...c,
    instalaciones: c.instalaciones.map(i => ({ ...i })),
    sponsors:      c.sponsors.map(sp => ({ ...sp, metricasExigidas: { ...sp.metricasExigidas } })),
    reputacion:    { ...c.reputacion },
  }
}

function cloneSeason(s: SeasonData): SeasonData {
  return {
    ...s,
    calendario:          s.calendario.map(c => ({ ...c })),
    resultadosTemporada: s.resultadosTemporada.map(r => ({
      ...r,
      pcsDetalle: { ...r.pcsDetalle },
    })),
    historialSemanas: s.historialSemanas.map(w => ({
      ...w,
      ranuraEjecutadas: [...w.ranuraEjecutadas],
    })),
  }
}

// ─── main pipeline ────────────────────────────────────────────────────────────

/**
 * runs one full week. pure with respect to the inputs — callers commit the
 * returned patches via gameStore.applyWeekTransition. narrative events are
 * only *selected*; the UI layer resolves the player's choice afterwards.
 */
export async function runWeek(
  ctx: WeekContext,
  rng: () => number = Math.random,
): Promise<WeekResult> {
  // 0. clone inputs so downstream services never see our intermediate state
  let skater  = cloneSkater(ctx.skater)
  let club    = cloneClub(ctx.club)
  let season  = cloneSeason(ctx.season)
  const startingEstres = skater.weeklyState.estres
  const startingVinculo = skater.weeklyState.vinculo
  const startingFatigue = skater.weeklyState.fatigaAcumulada

  // 1. detect competition week
  const competitionSlot = findCompetitionSlot(season)

  // 2. training effects (includes tensionsTriggered + eventSeeds)
  const installationLevels = installationLevelRecord(club)
  const effects = resolveWeekEffects(
    ctx.schedule,
    skater,
    season,
    installationLevels,
    rng,
  )

  // 3. apply training effects to skater (clamp before commit)
  skater = applyAttributeGains(skater, effects.attributeGains, 100)
  const nextWeekly: WeeklyState = {
    ...skater.weeklyState,
    fatigaAcumulada: clamp(skater.weeklyState.fatigaAcumulada + effects.fatigueDelta),
    estres:          clamp(skater.weeklyState.estres          + effects.stressDelta),
    vinculo:         clamp(skater.weeklyState.vinculo         + effects.bondDelta),
    semanasEntrenadas: skater.weeklyState.semanasEntrenadas + 1,
  }
  skater = { ...skater, weeklyState: nextWeekly }

  // 4. bond decay when no dialogo this week
  const didDialogue = ctx.schedule.slots.some(s => s.activityId === 'dialogo')
  skater = applyBondDecay(skater, didDialogue, rng)

  // 5. fatigue recovery from installations
  skater = applyFatigueRecovery(skater, computeRecoveryBonus(club))

  // 6. inject training seeds into narrative flags (consumed by evaluateConditions)
  const seededFlags: Record<string, boolean | number | string> = {
    ...ctx.narrativeContext.narrativeFlags,
  }
  for (const seed of effects.eventSeeds) seededFlags[`seed:${seed}`] = true

  const weeklyCtx: NarrativeContext = {
    ...ctx.narrativeContext,
    skater,
    season,
    narrativeFlags: seededFlags,
  }

  // 7. event selection placeholder. NarrativeContext does not carry the pool,
  // so runWeek itself never selects an event — callers that need selection
  // use runWeekWithPool below. we still build weeklyCtx so the wrapper has
  // the exact post-training context to evaluate conditions against.
  void weeklyCtx
  const triggeredEvent = null as NarrativeEvent | null

  // 8. competition (only when IS a competition week)
  let competitionResult: CompetitionResult | null = null
  if (competitionSlot && ctx.program) {
    const sim = await runCompetition(
      skater,
      ctx.program,
      ctx.competitionJudges ?? ctx.allJudges,
      {},
    )
    competitionResult = {
      id:                makeCompetitionResultId(
        skater.id,
        season.temporadaNumero,
        season.semanaActual,
      ),
      skaterId:          skater.id,
      semana:            season.semanaActual,
      nombreCompeticion: competitionSlot.nombreCompeticion,
      tipo:              competitionSlot.tipo,
      tes:               sim.tes,
      pcs:               sim.pcs,
      pcsDetalle:        { ...sim.pcsDetalle },
      total:             sim.total,
      // placeholder: rival simulation lives in a later task; solo appearance ⇒ 1
      posicion:          1,
      caidas:            sim.caidas,
      deducciones:       sim.deducciones,
    }
    // register provisional result — Competition UI may overwrite after Momentos
    season = {
      ...season,
      resultadosTemporada: [...season.resultadosTemporada, competitionResult],
    }
    // post-competition deltas: fatigue + stress recover slightly over the event
    const postWeekly: WeeklyState = {
      ...skater.weeklyState,
      fatigaAcumulada: clamp(skater.weeklyState.fatigaAcumulada + 6),
      estres: clamp(
        skater.weeklyState.estres + (competitionResult.caidas > 0 ? 8 : -4),
      ),
    }
    skater = { ...skater, weeklyState: postWeekly }
  }

  // 9. economy — cash flow, prize money, pressure, sponsor review
  const cashDelta = computeWeeklyCashFlow(
    club,
    season,
    ctx.installationsCatalog ?? [],
  )
  club = {
    ...club,
    presupuestoReservas: club.presupuestoReservas + cashDelta,
  }
  if (competitionResult) {
    club = applyPrizeMoney(club, competitionResult, competitionResult.tipo)
  }
  // weekly expenses = actual outflow (base + installation maintenance)
  const weeklyExpenses = computeWeeklyExpenses(club)
  const pressureState = computeFinancialPressureState(club, weeklyExpenses)
  const pressurePatch = applyFinancialPressureSideEffects(skater, pressureState)
  if (pressurePatch.weeklyState) {
    skater = { ...skater, weeklyState: pressurePatch.weeklyState }
  }
  if (pressurePatch.narrativeFlags) {
    for (const [k, v] of Object.entries(pressurePatch.narrativeFlags)) {
      seededFlags[k] = v
    }
  }
  const review = reviewSponsors(club, skater, season)
  if (review.lost.length > 0) {
    club = { ...club, sponsors: review.kept }
    seededFlags['sponsor_perdido'] = true
  }

  // 10. build WeekSummary and append
  const weekSummary: WeekSummary = {
    semana:    season.semanaActual,
    fase:      getFasePorSemana(season.semanaActual),
    ranuraEjecutadas: ctx.schedule.slots
      .map(s => s.activityId)
      .filter((a): a is NonNullable<typeof a> => a !== null),
    vinculoDelta:     skater.weeklyState.vinculo         - startingVinculo,
    fatigueDelta:     skater.weeklyState.fatigaAcumulada - startingFatigue,
    stresDelta:       skater.weeklyState.estres          - startingEstres,
    eventoNarrativoId:      triggeredEvent?.id ?? null,
    competicionResultadoId: competitionResult?.id ?? null,
  }
  season = {
    ...season,
    historialSemanas: [...season.historialSemanas, weekSummary],
  }

  // 11. advance week; flag end-of-season but don't transition here
  const nextSemana = season.semanaActual + 1
  const seasonEndReached = nextSemana > 30
  season = {
    ...season,
    semanaActual: seasonEndReached ? season.semanaActual : nextSemana,
    faseActual:   getFasePorSemana(seasonEndReached ? season.semanaActual : nextSemana),
  }

  return {
    skater,
    club,
    season,
    triggeredEvent,
    competitionResult,
    weekSummary,
    tensionsTriggered: effects.tensionsTriggered,
    seasonEndReached,
    cashDelta,
    pressureState,
  }
}

// ─── pool-aware wrapper ───────────────────────────────────────────────────────

/**
 * same as runWeek but consults an event pool for weekly event selection.
 * split to keep runWeek storage-agnostic: stores can inject the pool they
 * already hold, tests can pass a handcrafted pool deterministically.
 */
export async function runWeekWithPool(
  ctx: WeekContext,
  eventPool: readonly NarrativeEvent[],
  rng: () => number = Math.random,
): Promise<WeekResult> {
  const result = await runWeek(ctx, rng)
  if (result.competitionResult || result.triggeredEvent) return result

  // re-evaluate only the event-selection step with the provided pool. this is
  // safe because weekService does not apply event effects — just picks one.
  const picked = selectWeeklyEvent(
    eventPool,
    {
      ...ctx.narrativeContext,
      skater: result.skater,
      season: result.season,
    },
    rng,
  )
  if (!picked) return result

  const summary: WeekSummary = {
    ...result.weekSummary,
    eventoNarrativoId: picked.id,
  }
  // overwrite the last history entry so the summary matches the selected event
  const history = result.season.historialSemanas.slice()
  history[history.length - 1] = summary
  return {
    ...result,
    triggeredEvent: picked,
    season: { ...result.season, historialSemanas: history },
    weekSummary: summary,
  }
}
