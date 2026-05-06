// orchestrator for a single game week — composes training, athlete, narrative,
// competition and economy into one atomic transition. pure with respect to the
// store: the caller commits the result via gameStore.applyWeekTransition.

import { resolveWeekEffects } from '@/features/training'
import type { WeekSchedule, TensionId } from '@/features/training'
import {
  applyAttributeGains,
  applyBondDecay,
  applyFatigueRecovery,
  forceOverworkInjury,
  maskInjuredSchedule,
  rollFallInjury,
  rollWeeklyInjury,
  tickInjuryWeek,
} from '@/features/athlete'
import {
  selectWeeklyEvent,
} from '@/features/narrative'
import type {
  NarrativeContext,
  NarrativeEvent,
} from '@/features/narrative'
import { runProgramSimulation } from '@/features/competition'
import {
  sampleField,
  simulateRivalCompetition,
  type RivalsPool,
} from '@/features/rivals'
import {
  applyFinancialPressureSideEffects,
  computeCompetitionEconomy,
  computeFinancialPressureState,
  computeWeeklyCashFlowBreakdown,
  reviewSponsors,
  type CashFlowBreakdown,
} from '@/features/economy'
import {
  FATIGUE_BETWEEN_PROGRAMS,
  FORCED_OVERWORK_THRESHOLD,
  STRESS_AFTER_FALL_INTERPROGRAM,
  WEEKLY_EXPENSE_BASE,
  WEEKLY_INSTALLATION_MAINTENANCE_PER_LEVEL,
} from '@/lib/balance'
import type { ClubData, InstallationId, InstallationLevel } from '@/types'
import type {
  CompetitionResult,
  CompetitionSlot,
  ProgramScore,
  RankingEntry,
  SeasonData,
  WeekSummary,
} from '@/types'
import {
  getFasePorSemana,
  makeCompetitionResultId,
} from '@/types'
import type { InjurySeverity, SkaterData, WeeklyState } from '@/types'
import type { CoachData } from '@/types'
import type { ProgramData } from '@/types'
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
  /** legacy: free-skate program; preferred path is programLibre below */
  program:           ProgramData | null
  /** short program (SP) — required for full SP→FS competition flow */
  programCorto?:     ProgramData | null
  /** free program (FS) — falls back to `program` when not provided */
  programLibre?:     ProgramData | null
  /** persisted rival pool — when null the competition runs solo (legacy) */
  rivalsPool?:       RivalsPool | null
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
  /** severity of an injury that started this week; null when no new injury */
  newInjurySeverity:    InjurySeverity | null
  /** severity of an injury that ended this week; null otherwise */
  recoveredFromSeverity: InjurySeverity | null
  /** true when a 'grave' injury caused the scheduled competition to be skipped */
  competitionSkippedByInjury: boolean
  /** detailed cash-flow breakdown for the week, including any competition lines */
  economyBreakdown:     CashFlowBreakdown
  /** SP program after applying cohesion and vínculo-musical updates from training; null when no SP exists */
  programaCortoActualizado: ProgramData | null
  /** FS program after applying cohesion and vínculo-musical updates from training; null when no FS exists */
  programaLibreActualizado: ProgramData | null
  /** flags emitted during the week (seeds + economic/injury signals); merged into the
   *  narrative store by the caller. previously this was discarded — see auditoría B4 (C1). */
  narrativeFlags:           Record<string, boolean | number | string>
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

/**
 * applies the weekly cohesion and vínculo-musical deltas to a program (both
 * clamped 0–100). the program is otherwise untouched. returns a new object so
 * the caller can persist it without mutating any in-flight state.
 */
function applyProgramWeeklyDeltas(
  program: ProgramData,
  cohesionDelta: number,
  vinculoMusicalDelta: number,
): ProgramData {
  return {
    ...program,
    cohesion:       clamp(program.cohesion       + cohesionDelta),
    vinculoMusical: clamp(program.vinculoMusical + vinculoMusicalDelta),
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

// ─── classification helpers ──────────────────────────────────────────────────

interface PlayerProgramScores {
  corto: ProgramScore | null
  libre: ProgramScore | null
}

/**
 * builds the full classification table by combining the player's score with
 * the simulated rival field. ranks descending by totalCombinado; player's
 * `posicion` is read off this list.
 */
function buildClassification(
  player: { id: string; nombre: string; nacionalidad: string; scoreCorto: number; scoreLibre: number },
  rivals: ReadonlyArray<{ rivalId: string; nombre: string; nacionalidad: string; scoreCorto: number; scoreLibre: number }>,
): RankingEntry[] {
  const all: Array<Omit<RankingEntry, 'posicion'>> = [
    {
      participantId: player.id,
      nombre:        player.nombre,
      nacionalidad:  player.nacionalidad,
      totalCombinado: player.scoreCorto + player.scoreLibre,
      scoreCorto:     player.scoreCorto,
      scoreLibre:     player.scoreLibre,
      esJugador:      true,
    },
    ...rivals.map(r => ({
      participantId: r.rivalId,
      nombre:        r.nombre,
      nacionalidad:  r.nacionalidad,
      totalCombinado: r.scoreCorto + r.scoreLibre,
      scoreCorto:     r.scoreCorto,
      scoreLibre:     r.scoreLibre,
      esJugador:      false,
    })),
  ]
  all.sort((a, b) => b.totalCombinado - a.totalCombinado)
  return all.map((entry, i) => ({ ...entry, posicion: i + 1 }))
}

// ─── competition pipeline ────────────────────────────────────────────────────

interface CompetitionOutcome {
  result: CompetitionResult
  /** updated skater after mid-event and post-event physiology */
  skaterAfter: SkaterData
}

/**
 * runs the SP + FS simulation for the player and (when a pool is available)
 * the rivals attending this competition. produces the full CompetitionResult
 * with combined totals, per-program detail, and the standings.
 */
async function runCompetitionPipeline(
  skater: SkaterData,
  programCorto: ProgramData | null,
  programLibre: ProgramData,
  judges: Judge[],
  competitionSlot: CompetitionSlot,
  season: SeasonData,
  rivalsPool: RivalsPool | null,
  rng: () => number,
): Promise<CompetitionOutcome> {
  let live = skater

  // ── short program (when registered) ────────────────────────────────────────
  let scoreCorto: ProgramScore | null = null
  if (programCorto) {
    const sp = await runProgramSimulation(live, programCorto, judges)
    scoreCorto = sp.score
    // mid-event physiology: rest is short, fatigue accumulates and falls add stress
    const interWeekly: WeeklyState = {
      ...live.weeklyState,
      fatigaAcumulada: clamp(live.weeklyState.fatigaAcumulada + FATIGUE_BETWEEN_PROGRAMS),
      estres:          clamp(
        live.weeklyState.estres + (sp.score.caidas > 0 ? STRESS_AFTER_FALL_INTERPROGRAM : 0),
      ),
    }
    live = { ...live, weeklyState: interWeekly }
  }

  // ── free skate ─────────────────────────────────────────────────────────────
  const fs = await runProgramSimulation(live, programLibre, judges)
  const scoreLibre = fs.score

  // ── rivals (when a pool is available) ─────────────────────────────────────
  const playerScores: PlayerProgramScores = { corto: scoreCorto, libre: scoreLibre }
  const rivals = rivalsPool
    ? sampleField(rivalsPool.skaters, competitionSlot.tipo, rng)
    : []
  const rivalScores = rivals.map(r => {
    const sim = simulateRivalCompetition(r, rng)
    return {
      rivalId:      r.id,
      nombre:       r.nombre,
      nacionalidad: r.nacionalidad,
      scoreCorto:   playerScores.corto ? sim.scoreCorto : 0,
      scoreLibre:   sim.scoreLibre,
    }
  })

  // ── classification ─────────────────────────────────────────────────────────
  const playerCortoTotal = scoreCorto?.total ?? 0
  const playerLibreTotal = scoreLibre.total
  const clasificacion = buildClassification(
    {
      id:           skater.id,
      nombre:       skater.name,
      nacionalidad: skater.nationality,
      scoreCorto:   playerCortoTotal,
      scoreLibre:   playerLibreTotal,
    },
    rivalScores,
  )
  const playerEntry = clasificacion.find(c => c.esJugador)
  const posicion = playerEntry?.posicion ?? 1

  // ── combined totals (kept at top level so prize money & legacy code works) ─
  const tesCombinado = (scoreCorto?.tes ?? 0) + scoreLibre.tes
  const pcsCombinado = (scoreCorto?.pcs ?? 0) + scoreLibre.pcs
  const caidasCombinadas = (scoreCorto?.caidas ?? 0) + scoreLibre.caidas
  const deduccionesCombinadas = (scoreCorto?.deducciones ?? 0) + scoreLibre.deducciones
  const totalCombinado = tesCombinado + pcsCombinado - deduccionesCombinadas

  // weighted-average pcsDetalle so the legacy field reflects the combined panel
  const pcsDetalleCombinado = scoreCorto
    ? {
        sk: (scoreCorto.pcsDetalle.sk + scoreLibre.pcsDetalle.sk) / 2,
        tr: (scoreCorto.pcsDetalle.tr + scoreLibre.pcsDetalle.tr) / 2,
        pe: (scoreCorto.pcsDetalle.pe + scoreLibre.pcsDetalle.pe) / 2,
        co: (scoreCorto.pcsDetalle.co + scoreLibre.pcsDetalle.co) / 2,
        in: (scoreCorto.pcsDetalle.in + scoreLibre.pcsDetalle.in) / 2,
      }
    : { ...scoreLibre.pcsDetalle }

  const result: CompetitionResult = {
    id: makeCompetitionResultId(skater.id, season.temporadaNumero, season.semanaActual),
    skaterId:          skater.id,
    semana:            season.semanaActual,
    nombreCompeticion: competitionSlot.nombreCompeticion,
    tipo:              competitionSlot.tipo,
    tes:               tesCombinado,
    pcs:               pcsCombinado,
    pcsDetalle:        pcsDetalleCombinado,
    total:             totalCombinado,
    posicion,
    caidas:            caidasCombinadas,
    deducciones:       deduccionesCombinadas,
    programaCorto:     scoreCorto,
    programaLibre:     scoreLibre,
    clasificacion,
    momentImpacts:     [],
  }

  // ── post-event physiology ─────────────────────────────────────────────────
  const postWeekly: WeeklyState = {
    ...live.weeklyState,
    fatigaAcumulada: clamp(live.weeklyState.fatigaAcumulada + 6),
    estres:          clamp(
      live.weeklyState.estres + (caidasCombinadas > 0 ? 8 : -4),
    ),
  }
  const skaterAfter: SkaterData = { ...live, weeklyState: postWeekly }

  return { result, skaterAfter }
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

  // 0b. tick existing injury — recovery happens BEFORE training so the skater
  // returns to the ice with the historialLesiones increment already in place
  const tick = tickInjuryWeek(skater, rng)
  skater = tick.skater
  const recoveredFromSeverity = tick.recoveredSeverity

  // 1. detect competition week
  const competitionSlot = findCompetitionSlot(season)

  // 1b. while injured, mask the schedule: tecnico/fisico are blocked, ensayo
  // only allowed in 'leve'. resolveWeekEffects will receive the masked plan
  // and only apply the activities the skater can actually do this week.
  const activeInjury = skater.weeklyState.currentInjury
  const effectiveSchedule = activeInjury
    ? maskInjuredSchedule(ctx.schedule, activeInjury.severity)
    : ctx.schedule

  // 2. training effects (includes tensionsTriggered + eventSeeds + cohesionDelta)
  const installationLevels = installationLevelRecord(club)
  const effects = resolveWeekEffects(
    effectiveSchedule,
    skater,
    season,
    installationLevels,
    rng,
  )

  // 2b. derive vinculoMusical bump: cada ranura ensayo aporta más; dialogo poco.
  // tope semanal moderado para que la curva sea progresiva (semanas, no semanas y media)
  const ensayoCount  = effectiveSchedule.slots.filter(s => s.activityId === 'ensayo').length
  const dialogoCount = effectiveSchedule.slots.filter(s => s.activityId === 'dialogo').length
  const vinculoMusicalDelta = Math.min(6, ensayoCount * 2 + dialogoCount)

  // apply program deltas; both SP and FS share the same training week input
  const programaCortoActualizado = ctx.programCorto
    ? applyProgramWeeklyDeltas(ctx.programCorto, effects.cohesionDelta, vinculoMusicalDelta)
    : null
  const programaLibreActualizado = (ctx.programLibre ?? ctx.program)
    ? applyProgramWeeklyDeltas(ctx.programLibre ?? ctx.program!, effects.cohesionDelta, vinculoMusicalDelta)
    : null

  // 3. apply training effects to skater (clamp before commit)
  skater = applyAttributeGains(skater, effects.attributeGains, 100)
  // overwork counter: reset on any `descanso` slot, else +1. consumed by
  // forceOverworkInjury below when reaches FORCED_OVERWORK_THRESHOLD.
  const restedThisWeek = effectiveSchedule.slots.some(s => s.activityId === 'descanso')
  const nextConsecutivasSinDescanso = restedThisWeek
    ? 0
    : skater.weeklyState.consecutivasSinDescanso + 1
  const nextWeekly: WeeklyState = {
    ...skater.weeklyState,
    fatigaAcumulada: clamp(skater.weeklyState.fatigaAcumulada + effects.fatigueDelta),
    estres:          clamp(skater.weeklyState.estres          + effects.stressDelta),
    vinculo:         clamp(skater.weeklyState.vinculo         + effects.bondDelta),
    semanasEntrenadas:       skater.weeklyState.semanasEntrenadas + 1,
    consecutivasSinDescanso: nextConsecutivasSinDescanso,
  }
  skater = { ...skater, weeklyState: nextWeekly }

  // 4. bond decay when no dialogo this week
  const didDialogue = effectiveSchedule.slots.some(s => s.activityId === 'dialogo')
  skater = applyBondDecay(skater, didDialogue, rng)

  // 5. fatigue recovery from installations
  skater = applyFatigueRecovery(skater, computeRecoveryBonus(club))

  // 5b. injury phase — first the GDD hard rule (5+ semanas sin descanso forces a
  // guaranteed injury), then the probabilistic roll if still healthy. training
  // has already been applied so fatigue is current; the probabilistic roll uses
  // effects.injuryRoll so re-running runWeek with the same seed is reproducible.
  let newInjurySeverity: InjurySeverity | null = null
  let forcedByOverwork = false
  if (!skater.weeklyState.currentInjury) {
    const fisioterapiaLevel = club.instalaciones.find(i => i.id === 'fisioterapia')?.nivel ?? 0
    if (skater.weeklyState.consecutivasSinDescanso >= FORCED_OVERWORK_THRESHOLD) {
      const forced = forceOverworkInjury(skater, {
        currentWeek: season.semanaActual,
        fisioterapiaLevel,
        rng,
      })
      if (forced) {
        skater = {
          ...skater,
          weeklyState: {
            ...skater.weeklyState,
            currentInjury:           forced,
            // reset the counter so the rule does not retrigger every week
            consecutivasSinDescanso: 0,
          },
        }
        newInjurySeverity = forced.severity
        forcedByOverwork = true
      }
    }
    if (!skater.weeklyState.currentInjury) {
      const newInjury = rollWeeklyInjury(skater, effectiveSchedule, {
        trigger:           effects.injuryRoll,
        rng,
        currentWeek:       season.semanaActual,
        fisioterapiaLevel,
        tensions:          effects.tensionsTriggered,
      })
      if (newInjury) {
        skater = {
          ...skater,
          weeklyState: { ...skater.weeklyState, currentInjury: newInjury },
        }
        newInjurySeverity = newInjury.severity
      }
    }
  }

  // 6. inject training seeds into narrative flags (consumed by evaluateConditions)
  const seededFlags: Record<string, boolean | number | string> = {
    ...ctx.narrativeContext.narrativeFlags,
  }
  for (const seed of effects.eventSeeds) seededFlags[`seed:${seed}`] = true

  // 6b. championship-eve flag — emitted the week BEFORE a Mundial / Europeo /
  // Final del Grand Prix / Olímpico, so events can gate on the buildup week
  // without parsing the calendar themselves.
  const nextChampionshipSlot = season.calendario.find(
    c =>
      c.semana === season.semanaActual + 1 &&
      (c.tipo === 'mundial' ||
        c.tipo === 'europeo' ||
        c.tipo === 'finalGrandprix' ||
        c.tipo === 'olimpico'),
  )
  if (nextChampionshipSlot) {
    seededFlags['dia_antes_campeonato'] = true
    if (nextChampionshipSlot.tipo === 'mundial') seededFlags['dia_antes_mundial'] = true
  }
  if (forcedByOverwork) seededFlags['lesion_por_sobrecarga'] = true

  const weeklyCtx: NarrativeContext = {
    ...ctx.narrativeContext,
    skater,
    season,
    narrativeFlags: seededFlags,
  }

  // 7. event selection placeholder. runWeek itself never selects an event;
  // runWeekWithPool below consumes seededFlags via the WeekResult.narrativeFlags
  // field to evaluate event conditions with the up-to-date context.
  void weeklyCtx
  const triggeredEvent = null as NarrativeEvent | null

  // 8. competition (only when IS a competition week) — usar programas
  // ya actualizados con la cohesión y vínculo musical de esta semana
  let competitionResult: CompetitionResult | null = null
  let competitionSkippedByInjury = false
  const programLibre = programaLibreActualizado
  const programCortoForComp = programaCortoActualizado
  const skaterCurrentInjury = skater.weeklyState.currentInjury
  const cantCompete = skaterCurrentInjury?.severity === 'grave'
  if (competitionSlot && programLibre && cantCompete) {
    competitionSkippedByInjury = true
    seededFlags['competicion_perdida_por_lesion'] = true
  } else if (competitionSlot && programLibre) {
    const pipelineRes = await runCompetitionPipeline(
      skater,
      programCortoForComp,
      programLibre,
      ctx.competitionJudges ?? ctx.allJudges,
      competitionSlot,
      season,
      ctx.rivalsPool ?? null,
      rng,
    )
    competitionResult = pipelineRes.result
    skater = pipelineRes.skaterAfter
    season = {
      ...season,
      resultadosTemporada: [...season.resultadosTemporada, competitionResult],
    }
    // 8b. fall-induced injury roll — only when no injury already active
    if (!skater.weeklyState.currentInjury && competitionResult.caidas > 0) {
      const fisioterapiaLevel = club.instalaciones.find(i => i.id === 'fisioterapia')?.nivel ?? 0
      const fallInjury = rollFallInjury(skater, competitionResult.caidas, rng(), {
        currentWeek:       season.semanaActual,
        fisioterapiaLevel,
        rng,
      })
      if (fallInjury) {
        skater = {
          ...skater,
          weeklyState: { ...skater.weeklyState, currentInjury: fallInjury },
        }
        newInjurySeverity = fallInjury.severity
      }
    }
  }

  // 9. economy — base weekly cash flow + per-competition detail; pressure & sponsor review
  const economyBreakdown = computeWeeklyCashFlowBreakdown(
    club,
    season,
    ctx.installationsCatalog ?? [],
  )
  // attach competition-specific lines and update the running total in one
  // pass so the panel UI sees both the recurring weekly cash flow and the
  // event's prize money / travel cost
  if (competitionResult) {
    const eco = computeCompetitionEconomy(competitionResult)
    competitionResult.economiaDetalle = eco
    if (eco.premio > 0)     economyBreakdown.ingresos.push({ label: `premio · ${competitionResult.nombreCompeticion}`, amount: eco.premio })
    if (eco.bonoExtra > 0)  economyBreakdown.ingresos.push({ label: 'bono sponsor por podio',                          amount: eco.bonoExtra })
    if (eco.gastoViaje > 0) economyBreakdown.gastos.push  ({ label: `viaje · ${competitionResult.nombreCompeticion}`, amount: eco.gastoViaje })
    economyBreakdown.total += eco.neto
    // mirror the new economiaDetalle into the persisted result
    const list = season.resultadosTemporada.slice(0, -1)
    season = {
      ...season,
      resultadosTemporada: [...list, competitionResult],
    }
  }
  const cashDelta = economyBreakdown.total
  club = {
    ...club,
    presupuestoReservas: club.presupuestoReservas + cashDelta,
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

  // 10. build WeekSummary and append — record what was actually executed
  // after injury masking, not the original plan, so history reflects reality
  const weekSummary: WeekSummary = {
    semana:    season.semanaActual,
    fase:      getFasePorSemana(season.semanaActual),
    ranuraEjecutadas: effectiveSchedule.slots
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
    newInjurySeverity,
    recoveredFromSeverity,
    competitionSkippedByInjury,
    economyBreakdown,
    programaCortoActualizado,
    programaLibreActualizado,
    narrativeFlags: seededFlags,
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
  // narrativeFlags must come from the result (they include this week's seeds
  // and economic/injury signals); ctx.narrativeContext.narrativeFlags is stale.
  const picked = selectWeeklyEvent(
    eventPool,
    {
      ...ctx.narrativeContext,
      skater:         result.skater,
      season:         result.season,
      narrativeFlags: result.narrativeFlags,
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
