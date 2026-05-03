// injury system — Fase B.
// pure functions: probability rolls, recovery tick, severity selection, secuelae.
// no React, no Zustand. consumes balance constants.

import {
  FALL_INJURY_BASE_PROB,
  FISIO_RECOVERY_BONUS_PER_LEVEL,
  HISTORIAL_INCREASE_BY_SEVERITY,
  INJURY_LOAD_DIVISOR,
  INJURY_SEVERITY_WEIGHTS,
  OVERWORK_INJURY_MULTIPLIER,
  SEVERITY_RECOVERY_WEEKS,
  TECHO_LOSS_RANGE_GRAVE,
  TRAIT_INJURY_MULTIPLIERS,
} from '@/lib/balance'
import type { InjuryRecord, InjurySeverity, SkaterData } from '@/types'
import type { ActivityId, TensionId, WeekSchedule } from '@/features/training'
import { ACTIVITY_DEFINITIONS } from '@/features/training'

import { computeInjuryRisk } from './service'

// ─── helpers ──────────────────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v))

/** sum of injuryRiskDelta from all activities scheduled this week (negative
 *  contributions from descanso are kept; the load can dip below zero, which
 *  rollWeeklyInjury treats as "no injury risk") */
export function weeklyInjuryLoad(schedule: WeekSchedule): number {
  let load = 0
  for (const slot of schedule.slots) {
    if (!slot.activityId) continue
    load += ACTIVITY_DEFINITIONS[slot.activityId].injuryRiskDelta
  }
  return load
}

/** product of injury multipliers for every active trait the skater has */
function traitMultiplier(skater: SkaterData): number {
  let factor = 1
  for (const t of skater.traits) {
    if (!t.active) continue
    const m = TRAIT_INJURY_MULTIPLIERS[t.id]
    if (m !== undefined) factor *= m
  }
  return factor
}

/** raw probability (0–1) that this week's load triggers an injury.
 *  `tensions` viene del detector de training/service: si incluye
 *  `tecnico_vs_descanso` (5+ semanas sin descanso) la probabilidad se amplifica
 *  por OVERWORK_INJURY_MULTIPLIER. esto cobra mecánicamente la promesa GDD
 *  "sin descanso 5+ semanas: evento lesión forzado" sin perder el roll
 *  probabilístico ni la inyección de rng. */
export function weeklyInjuryProbability(
  skater: SkaterData,
  schedule: WeekSchedule,
  tensions: readonly TensionId[] = [],
): number {
  const load = weeklyInjuryLoad(schedule)
  if (load <= 0) return 0
  // amplify by historialLesiones over 70 (existing helper)
  const amplified = computeInjuryRisk(skater, load)
  // fatigue contributes linearly above 60
  const fatigueBoost = Math.max(0, skater.weeklyState.fatigaAcumulada - 60) / 100
  // overwork: prolonged absence of descanso slot multiplies risk
  const overworkBoost = tensions.includes('tecnico_vs_descanso') ? OVERWORK_INJURY_MULTIPLIER : 1
  // map to 0–1; calibrated so two técnicos (load 8) ≈ 6 % at baseline
  const base = amplified / INJURY_LOAD_DIVISOR
  const probability = base * (1 + fatigueBoost) * traitMultiplier(skater) * overworkBoost
  return Math.max(0, Math.min(1, probability))
}

// ─── severity & recovery ─────────────────────────────────────────────────────

/** picks one of the three severity buckets weighted by INJURY_SEVERITY_WEIGHTS */
export function pickSeverity(
  skater: SkaterData,
  rng: () => number,
): InjurySeverity {
  // reweight: cuerpo-frágil and high historialLesiones bias toward worse outcomes
  const w = { ...INJURY_SEVERITY_WEIGHTS }
  const fragile = skater.traits.some(t => t.active && t.id === 'cuerpo-fragil')
  const repeatedHistory = skater.physical.historialLesiones > 60
  if (fragile || repeatedHistory) {
    return rollSeverityWeighted(rng, {
      leve:     w.leve     * 0.7,
      moderada: w.moderada * 1.2,
      grave:    w.grave    * 1.6,
    })
  }
  return rollSeverityWeighted(rng, w)
}

function rollSeverityWeighted(
  rng: () => number,
  weights: Record<InjurySeverity, number>,
): InjurySeverity {
  const total = weights.leve + weights.moderada + weights.grave
  let r = rng() * total
  if ((r -= weights.leve) < 0) return 'leve'
  if ((r -= weights.moderada) < 0) return 'moderada'
  return 'grave'
}

/** recovery duration in weeks; reduced by fisioterapia level */
export function pickRecoveryWeeks(
  severity: InjurySeverity,
  fisioterapiaLevel: number,
  rng: () => number,
): number {
  const range = SEVERITY_RECOVERY_WEEKS[severity]
  const span = range.max - range.min
  const raw = range.min + Math.floor(rng() * (span + 1))
  const reduction = 1 - Math.min(0.4, fisioterapiaLevel * FISIO_RECOVERY_BONUS_PER_LEVEL)
  return Math.max(1, Math.round(raw * reduction))
}

// ─── public rolls ────────────────────────────────────────────────────────────

export interface InjuryRollOptions {
  /** roll value 0–1 (or rng); the caller usually provides effects.injuryRoll */
  trigger: number
  /** rng used for severity + recovery duration (independent of `trigger`) */
  rng?: () => number
  /** current week, recorded on the InjuryRecord */
  currentWeek: number
  /** fisioterapia installation level 0–4, when known */
  fisioterapiaLevel?: number
  /** active tensions for this week; `tecnico_vs_descanso` boosts probability */
  tensions?: readonly TensionId[]
}

/**
 * weekly injury roll. the orchestrator should call this AFTER training has been
 * applied (so fatigue is current) but BEFORE competition. returns a fresh
 * InjuryRecord when an injury triggers, null otherwise. never overwrites an
 * already-active injury (caller must check `isInjured` first).
 */
export function rollWeeklyInjury(
  skater: SkaterData,
  schedule: WeekSchedule,
  options: InjuryRollOptions,
): InjuryRecord | null {
  if (skater.weeklyState.currentInjury) return null
  const probability = weeklyInjuryProbability(skater, schedule, options.tensions)
  if (options.trigger >= probability) return null
  const rng = options.rng ?? Math.random
  const severity = pickSeverity(skater, rng)
  const weeks = pickRecoveryWeeks(severity, options.fisioterapiaLevel ?? 0, rng)
  return {
    injuredAtWeek:          options.currentWeek,
    recoveryWeeksTotal:     weeks,
    recoveryWeeksRemaining: weeks,
    severity,
  }
}

/**
 * post-competition injury roll triggered by falls. probability scales with the
 * number of falls and the skater's fatigue + history. returns null when the
 * skater is already injured or the roll fails.
 */
export function rollFallInjury(
  skater: SkaterData,
  caidas: number,
  trigger: number,
  options: { currentWeek: number; fisioterapiaLevel?: number; rng?: () => number },
): InjuryRecord | null {
  if (skater.weeklyState.currentInjury) return null
  if (caidas <= 0) return null
  const fatigueBoost = Math.max(0, skater.weeklyState.fatigaAcumulada - 50) / 100
  const historyBoost = skater.physical.historialLesiones / 200
  const traitFactor = traitMultiplier(skater)
  const probability = Math.min(
    0.6,
    FALL_INJURY_BASE_PROB * caidas * (1 + fatigueBoost + historyBoost) * traitFactor,
  )
  if (trigger >= probability) return null
  const rng = options.rng ?? Math.random
  // falls bias toward 'leve' / 'moderada'; grave only with high history
  const severity = pickSeverity(skater, rng)
  const weeks = pickRecoveryWeeks(severity, options.fisioterapiaLevel ?? 0, rng)
  return {
    injuredAtWeek:          options.currentWeek,
    recoveryWeeksTotal:     weeks,
    recoveryWeeksRemaining: weeks,
    severity,
  }
}

// ─── tick & recovery ─────────────────────────────────────────────────────────

export interface RecoveryOutcome {
  skater:        SkaterData
  /** true the week the skater returns from injury (last tick brought it to 0) */
  justRecovered: boolean
  /** severity of the injury that just ended; null when no recovery happened */
  recoveredSeverity: InjurySeverity | null
}

/**
 * advances the active injury one week. when the counter reaches zero, applies
 * historialLesiones increment and (for 'grave') a small techo biológico loss,
 * then clears `currentInjury`. callers commit the returned skater patch atomically.
 */
export function tickInjuryWeek(
  skater: SkaterData,
  rng: () => number = Math.random,
): RecoveryOutcome {
  const inj = skater.weeklyState.currentInjury
  if (!inj) {
    return { skater, justRecovered: false, recoveredSeverity: null }
  }
  const remaining = inj.recoveryWeeksRemaining - 1
  if (remaining > 0) {
    return {
      skater: {
        ...skater,
        weeklyState: {
          ...skater.weeklyState,
          currentInjury: { ...inj, recoveryWeeksRemaining: remaining },
        },
      },
      justRecovered: false,
      recoveredSeverity: null,
    }
  }
  // recovered — apply secuelae
  const inc = HISTORIAL_INCREASE_BY_SEVERITY[inj.severity]
  const physical = {
    ...skater.physical,
    historialLesiones: clamp(skater.physical.historialLesiones + inc),
  }
  if (inj.severity === 'grave') {
    const range = TECHO_LOSS_RANGE_GRAVE
    const loss = range.min + Math.floor(rng() * (range.max - range.min + 1))
    physical.techosBiologico = clamp(physical.techosBiologico - loss)
  }
  return {
    skater: {
      ...skater,
      physical,
      weeklyState: {
        ...skater.weeklyState,
        currentInjury: null,
      },
    },
    justRecovered: true,
    recoveredSeverity: inj.severity,
  }
}

// ─── slot eligibility ────────────────────────────────────────────────────────

/**
 * activities allowed while the skater is injured. tecnico/fisico are always
 * blocked; ensayo only allowed during 'leve' to keep the program memory alive.
 */
export function activityAllowedDuringInjury(
  activity: ActivityId,
  severity: InjurySeverity,
): boolean {
  if (activity === 'tecnico' || activity === 'fisico') return false
  if (activity === 'ensayo') return severity === 'leve'
  return true  // mental, descanso, dialogo always OK
}

/** filters the schedule, replacing blocked activities with null so the
 *  pipeline does not apply their effects this week */
export function maskInjuredSchedule(
  schedule: WeekSchedule,
  severity: InjurySeverity,
): WeekSchedule {
  return {
    ...schedule,
    slots: schedule.slots.map(s => {
      if (!s.activityId) return s
      if (activityAllowedDuringInjury(s.activityId, severity)) return s
      return { ...s, activityId: null }
    }),
  }
}
