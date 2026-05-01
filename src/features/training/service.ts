import {
  computeGainCurve,
  FATIGUE_BLOCK_THRESHOLD,
  MOTIVATION_SPEED_MULTIPLIER,
} from '@/lib/balance'
import type { SkaterData } from '@/types'
import type { SeasonData, WeekSummary } from '@/types'
import type { InstallationId, InstallationLevel } from '@/types'
import type { ActivityId, Activity, WeekSchedule, TensionId, WeekEffects } from './types'

// ─── activity definitions (GDD cap. 17) ──────────────────────────────────────

export const ACTIVITY_DEFINITIONS: Readonly<Record<ActivityId, Activity>> = {
  tecnico: {
    id: 'tecnico',
    label: 'Técnico',
    targetAttributes: ['saltos', 'giros', 'secuenciaDePasos'],
    fatigueDeltaMin: 8,   fatigueDeltaMax: 14,
    stressDeltaMin:  3,   stressDeltaMax:  5,
    bondDeltaMin:    0,   bondDeltaMax:    0,
    injuryRiskDelta: 4,
    cohesionDeltaMin: 0,  cohesionDeltaMax: 0,
    energyCost: 60,
  },
  fisico: {
    id: 'fisico',
    label: 'Físico',
    targetAttributes: [],
    fatigueDeltaMin: 5,  fatigueDeltaMax: 8,
    stressDeltaMin:  1,  stressDeltaMax:  3,
    bondDeltaMin:    0,  bondDeltaMax:    0,
    injuryRiskDelta: 2,
    cohesionDeltaMin: 0, cohesionDeltaMax: 0,
    energyCost: 40,
  },
  mental: {
    id: 'mental',
    label: 'Mental',
    targetAttributes: [],
    fatigueDeltaMin: 0,   fatigueDeltaMax: 2,
    stressDeltaMin:  -10, stressDeltaMax:  -5,
    bondDeltaMin:    1,   bondDeltaMax:    3,
    injuryRiskDelta: 0,
    cohesionDeltaMin: 0,  cohesionDeltaMax: 0,
    energyCost: 20,
  },
  descanso: {
    id: 'descanso',
    label: 'Descanso',
    targetAttributes: [],
    fatigueDeltaMin: -30, fatigueDeltaMax: -20,
    stressDeltaMin:  -12, stressDeltaMax:  -8,
    bondDeltaMin:    0,   bondDeltaMax:    0,
    injuryRiskDelta: -2,
    cohesionDeltaMin: 0,  cohesionDeltaMax: 0,
    energyCost: 10,
  },
  ensayo: {
    id: 'ensayo',
    label: 'Ensayo',
    targetAttributes: ['amplitudLinea'],
    fatigueDeltaMin: 3,  fatigueDeltaMax: 6,
    stressDeltaMin:  -2, stressDeltaMax:  1,
    bondDeltaMin:    0,  bondDeltaMax:    0,
    injuryRiskDelta: 1,
    cohesionDeltaMin: 3, cohesionDeltaMax: 6,
    energyCost: 30,
  },
  dialogo: {
    id: 'dialogo',
    label: 'Diálogo',
    targetAttributes: [],
    fatigueDeltaMin: 0,  fatigueDeltaMax: 2,
    stressDeltaMin:  -6, stressDeltaMax:  -3,
    bondDeltaMin:    5,  bondDeltaMax:    10,
    injuryRiskDelta: 0,
    cohesionDeltaMin: 1, cohesionDeltaMax: 2,
    energyCost: 15,
  },
} as const

// ─── helpers ─────────────────────────────────────────────────────────────────

function lerp(min: number, max: number, t: number): number {
  return min + t * (max - min)
}

// ─── gain calculation ─────────────────────────────────────────────────────────

/** attribute gain per session; delegates to computeGainCurve (GDD cap. 17) */
export function calcGain(value: number, potential: number, factors = 1): number {
  return Math.max(0, Math.round(computeGainCurve(value, potential, factors)))
}

// ─── tension detection helpers ────────────────────────────────────────────────

// GDD cap. 17 — 1: >4 consecutive weeks without a descanso slot
function isTecnicoVsDescanso(schedule: WeekSchedule, historialSemanas: WeekSummary[]): boolean {
  if (schedule.slots.some(s => s.activityId === 'descanso')) return false
  let consecutive = 1  // count current week
  for (let i = historialSemanas.length - 1; i >= 0; i--) {
    if (historialSemanas[i].ranuraEjecutadas.includes('descanso')) break
    consecutive++
    if (consecutive > 4) return true
  }
  return consecutive > 4
}

// GDD cap. 17 — 2: <2 ensayo slots in the 3 weeks before a competition
function isEnsayoVsPreCompeticion(
  schedule: WeekSchedule,
  historialSemanas: WeekSummary[],
  season: SeasonData,
): boolean {
  const { semanaActual } = season
  const nextComp = season.calendario
    .filter(c => c.clasificado && c.semana > semanaActual && c.semana <= semanaActual + 3)
    .sort((a, b) => a.semana - b.semana)[0]
  if (!nextComp) return false

  const firstPreWeek = nextComp.semana - 3
  const pastEnsayo = historialSemanas
    .filter(w => w.semana >= firstPreWeek && w.semana < semanaActual)
    .reduce((sum, w) => sum + w.ranuraEjecutadas.filter(r => r === 'ensayo').length, 0)
  const currentEnsayo = schedule.slots.filter(s => s.activityId === 'ensayo').length

  return pastEnsayo + currentEnsayo < 2
}

// GDD cap. 17 — 3: ≥3 consecutive weeks without dialogo AND vinculo declining
function isDialogoVsHielo(schedule: WeekSchedule, historialSemanas: WeekSummary[]): boolean {
  if (schedule.slots.some(s => s.activityId === 'dialogo')) return false
  let consecutive = 1  // count current week
  for (let i = historialSemanas.length - 1; i >= 0; i--) {
    if (historialSemanas[i].ranuraEjecutadas.includes('dialogo')) break
    consecutive++
  }
  if (consecutive < 3) return false
  const lastWeek = historialSemanas[historialSemanas.length - 1]
  return lastWeek !== undefined && lastWeek.vinculoDelta < 0
}

// GDD cap. 17 — 4: total energyCost >75 in the week before a competition
function isCargaVsPico(schedule: WeekSchedule, season: SeasonData): boolean {
  const { semanaActual } = season
  const nextWeekHasComp = season.calendario.some(
    c => c.clasificado && c.semana === semanaActual + 1,
  )
  if (!nextWeekHasComp) return false
  const totalLoad = schedule.slots.reduce((sum, s) => {
    return s.activityId ? sum + ACTIVITY_DEFINITIONS[s.activityId].energyCost : sum
  }, 0)
  return totalLoad > 75
}

// GDD cap. 17 — 5: >4 consecutive ensayo slots without tecnico or dialogo interspersed
function isEnsayoVsEspontaneidad(schedule: WeekSchedule, historialSemanas: WeekSummary[]): boolean {
  const allSlots: string[] = []
  for (const w of historialSemanas) allSlots.push(...w.ranuraEjecutadas)
  for (const s of schedule.slots) if (s.activityId) allSlots.push(s.activityId)

  let count = 0
  for (let i = allSlots.length - 1; i >= 0; i--) {
    const s = allSlots[i]
    if (s === 'tecnico' || s === 'dialogo') break
    if (s === 'ensayo') count++
  }
  return count > 4
}

// GDD cap. 17 — 6: descanso present + skater estres ≥ 70 → seeds "hielo de noche"
function isParadojaDescansoemocional(schedule: WeekSchedule, skaterEstres: number): boolean {
  return schedule.slots.some(s => s.activityId === 'descanso') && skaterEstres >= 70
}

// ─── public tension detector ──────────────────────────────────────────────────

export function detectTensions(
  schedule: WeekSchedule,
  historialSemanas: WeekSummary[],
  season: SeasonData,
  skaterEstres = 0,
): TensionId[] {
  const out: TensionId[] = []
  if (isTecnicoVsDescanso(schedule, historialSemanas))              out.push('tecnico_vs_descanso')
  if (isEnsayoVsPreCompeticion(schedule, historialSemanas, season)) out.push('ensayo_vs_pre_competicion')
  if (isDialogoVsHielo(schedule, historialSemanas))                 out.push('dialogo_vs_hielo')
  if (isCargaVsPico(schedule, season))                              out.push('carga_vs_pico')
  if (isEnsayoVsEspontaneidad(schedule, historialSemanas))          out.push('ensayo_vs_espontaneidad')
  if (isParadojaDescansoemocional(schedule, skaterEstres))          out.push('paradoja_descanso_emocional')
  return out
}

// ─── week effect resolver ─────────────────────────────────────────────────────

export function resolveWeekEffects(
  schedule: WeekSchedule,
  skater: SkaterData,
  season: SeasonData,
  installationBonuses: Partial<Record<InstallationId, InstallationLevel>>,
  rng: () => number = Math.random,
): WeekEffects {
  const attributeGains: Partial<Record<keyof typeof skater.technical, number>> = {}
  let fatigueDelta = 0
  let stressDelta = 0
  let bondDelta = 0
  let cohesionDelta = 0

  const fatigueBlocked = skater.weeklyState.fatigaAcumulada > FATIGUE_BLOCK_THRESHOLD
  const motivationFactor = skater.psychological.motivacionIntrinseca >= 70
    ? MOTIVATION_SPEED_MULTIPLIER
    : 1
  const pistaNivel = installationBonuses['pistaPrincipal'] ?? 0

  for (const slot of schedule.slots) {
    if (!slot.activityId) continue
    const act = ACTIVITY_DEFINITIONS[slot.activityId]

    fatigueDelta  += lerp(act.fatigueDeltaMin,  act.fatigueDeltaMax,  rng())
    stressDelta   += lerp(act.stressDeltaMin,   act.stressDeltaMax,   rng())
    bondDelta     += lerp(act.bondDeltaMin,     act.bondDeltaMax,     rng())
    cohesionDelta += lerp(act.cohesionDeltaMin, act.cohesionDeltaMax, rng())

    if (!fatigueBlocked) {
      const potential = skater.physical.techosBiologico
      for (const attrKey of act.targetAttributes) {
        const gain = calcGain(skater.technical[attrKey], potential, motivationFactor)
        attributeGains[attrKey] = (attributeGains[attrKey] ?? 0) + gain
      }
      // pistaPrincipal nivel ≥ 3 adds 1 saltos per tecnico slot
      if (slot.activityId === 'tecnico' && pistaNivel >= 3) {
        attributeGains['saltos'] = (attributeGains['saltos'] ?? 0) + 1
      }
    }
  }

  const tensionsTriggered = detectTensions(
    schedule,
    season.historialSemanas,
    season,
    skater.weeklyState.estres,
  )

  const eventSeeds: string[] = []
  if (tensionsTriggered.includes('paradoja_descanso_emocional')) {
    eventSeeds.push('hielo_de_noche')
  }

  return {
    attributeGains,
    fatigueDelta:      Math.round(fatigueDelta),
    stressDelta:       Math.round(stressDelta),
    bondDelta:         Math.round(bondDelta),
    cohesionDelta:     Math.round(cohesionDelta),
    injuryRoll:        rng(),
    tensionsTriggered,
    eventSeeds,
  }
}
