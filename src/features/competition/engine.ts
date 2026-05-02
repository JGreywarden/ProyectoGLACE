// pure engine for ISU TES/PCS scoring — GDD cap. 5
// no React, no Zustand, no DOM. all constants live in @/lib/balance.

import {
  AXEL_GOE_MULTIPLIER,
  DEFAULT_POST_FALL_GOE_PENALTY,
  ELEMENT_GOE_TES_FACTOR,
  FALL_DEDUCTION,
  FALL_GOE_THRESHOLD,
  FATIGUE_BLOCK_THRESHOLD,
  GOE_RANGE,
  GOE_WEIGHTS,
  INVALIDATION_THRESHOLD,
  MENTAL_VARIANCE_SIGMA,
  PCS_COMPONENT_COEFFICIENTS,
  PCS_PROGRAM_FACTOR,
} from '@/lib/balance'
import type { SkaterData } from '@/types'
import type { ProgramData, ProgramElement } from '@/types'
import type {
  CompetitionResult,
  ElementOutcome,
  MomentImpact,
  PCSBreakdown,
  ProgramScore,
} from '@/types'
import type { Judge } from '@/services/dataService'
import type { MomentOutcome } from '@/features/narrative'

// ─── rng ──────────────────────────────────────────────────────────────────────

export type RNG = () => number

/** Box–Muller: one gaussian sample with mean 0 and stddev = sigma. */
export function gaussian(rng: RNG, sigma: number): number {
  // rejection of u=0 to keep log finite
  let u = rng()
  while (u === 0) u = rng()
  let v = rng()
  while (v === 0) v = rng()
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ─── context ──────────────────────────────────────────────────────────────────

/** per-simulation flags mutated in place as the program progresses */
export interface CompetitionContextFlags {
  /** true once the skater has fallen at least once in this program */
  firstFallTriggered?: boolean
  /** optional integer seed (used by the worker to build a deterministic rng) */
  seed?: number
}

export type PCSComponentKey = keyof PCSBreakdown

// ─── helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * ISU-style trimmed mean: drop the single highest and single lowest sample
 * before averaging. With <= 2 samples, returns the plain mean.
 */
export function trimmedMean(values: readonly number[]): number {
  if (values.length === 0) return 0
  if (values.length <= 2) {
    let total = 0
    for (const x of values) total += x
    return total / values.length
  }
  const sorted = [...values].sort((a, b) => a - b)
  const trimmed = sorted.slice(1, -1)
  let total = 0
  for (const x of trimmed) total += x
  return total / trimmed.length
}

function elementFactor(el: ProgramElement): number {
  return ELEMENT_GOE_TES_FACTOR[el.tipo] ?? 0.1
}

/** true when this element counts as a fall (only jumps below the threshold) */
function isFall(el: ProgramElement, goe: number): boolean {
  return el.tipo === 'salto' && goe <= FALL_GOE_THRESHOLD
}

/** true when this fall is so severe that the element does not score TES */
function isInvalidated(el: ProgramElement, goe: number): boolean {
  return el.tipo === 'salto' && goe <= INVALIDATION_THRESHOLD
}

// ─── GOE base (panel-independent) ─────────────────────────────────────────────

/**
 * baseline GOE before judge influence. depends only on skater + element + flags.
 * GDD cap. 5: f(Atributos técnicos, Fatiga acumulada, Posición en programa,
 * Presión competitiva, Varianza[Resistencia mental]).
 *
 * does NOT clamp to [-5, +5]: the clamp happens after each judge's bias is
 * applied (see applyJudgeAdjustment).
 */
export function computeBaseGOE(
  skater: SkaterData,
  element: ProgramElement,
  rng: RNG,
): number {
  const t = skater.technical
  const p = skater.psychological
  const ws = skater.weeklyState

  const techMix = (t.saltos * 0.4 + t.giros * 0.3 + t.secuenciaDePasos * 0.3) / 10
  const baseGOE = (techMix - 5) * GOE_WEIGHTS.technicalBase

  const fatiguePenalty = ws.fatigaAcumulada > FATIGUE_BLOCK_THRESHOLD
    ? -(ws.fatigaAcumulada - FATIGUE_BLOCK_THRESHOLD) * GOE_WEIGHTS.fatigueImpact
    : 0

  // posicionEnPrograma is 1-based; position 1 receives no decay
  const positionIndex = Math.max(0, element.posicionEnPrograma - 1)
  const positionPenalty = -positionIndex * GOE_WEIGHTS.positionDecay

  const pressureMod = (p.presionCompetitiva / 100) * GOE_WEIGHTS.pressureWeight

  const sigma = MENTAL_VARIANCE_SIGMA(p.resistenciaMental)
  const noise = gaussian(rng, sigma)

  let goe = baseGOE + fatiguePenalty + positionPenalty + pressureMod + noise

  if (element.tipo === 'salto' && element.tipoSalto === 'axel') {
    goe *= AXEL_GOE_MULTIPLIER
  }

  return goe
}

/**
 * applies one judge's personality to the base GOE for a given element:
 * - own postFallGoePenalty when the program already saw a fall (Anna Müller)
 * - own nacionalidadBonus if the skater matches (Petrov)
 * - own sesgos.tes added directly to the GOE
 * the result is clamped to [-5, +5].
 */
function applyJudgeAdjustment(
  baseGOE: number,
  judge: Judge,
  contextFlags: CompetitionContextFlags,
  skater: SkaterData,
): number {
  let goe = baseGOE
  if (contextFlags.firstFallTriggered) {
    // every judge penalises elements after a fall — that's intrinsic to ISU.
    // we model it as a flat subtraction so it also bites when GOE is already
    // negative (multiplying a negative by 0.7 would *reduce* severity).
    // judges without an override use the baseline (0.94 → -0.3 GOE);
    // anti-caídas judges (Anna Müller 0.88 → -0.6 GOE) override it with a
    // smaller factor for a steeper subtraction.
    const penalty = judge.sesgos.postFallGoePenalty ?? DEFAULT_POST_FALL_GOE_PENALTY
    goe -= (1 - penalty) * 5
  }
  const nat = judge.sesgos.nacionalidadBonus
  if (nat && nat.pais === skater.nationality) {
    goe += nat.bonus
  }
  goe += judge.sesgos.tes ?? 0
  return clamp(goe, GOE_RANGE.min, GOE_RANGE.max)
}

/**
 * panel-aware final GOE for one element. trimmed mean of per-judge adjustments.
 * with no judges, falls back to clamping the base value.
 */
export function computePanelGOE(
  baseGOE: number,
  contextFlags: CompetitionContextFlags,
  skater: SkaterData,
  judges: readonly Judge[],
): number {
  if (judges.length === 0) {
    return clamp(baseGOE, GOE_RANGE.min, GOE_RANGE.max)
  }
  const judgeGoes = judges.map(j => applyJudgeAdjustment(baseGOE, j, contextFlags, skater))
  return trimmedMean(judgeGoes)
}

// ─── public GOE wrapper (kept for legacy call-sites and tests) ───────────────

/**
 * convenience wrapper: base GOE without judge influence, clamped to [-5, +5].
 * the worker uses computePanelGOE directly so judges can apply their personality.
 */
export function computeGOE(
  skater: SkaterData,
  element: ProgramElement,
  contextFlags: CompetitionContextFlags,
  rng: RNG,
  judges: readonly Judge[] = [],
): number {
  const base = computeBaseGOE(skater, element, rng)
  return computePanelGOE(base, contextFlags, skater, judges)
}

// ─── TES ──────────────────────────────────────────────────────────────────────

/** TES contribution of a single element: base * (1 + goe * factor). */
export function computeTESElement(element: ProgramElement, goe: number): number {
  return element.dificultadBase * (1 + goe * elementFactor(element))
}

/** aggregate TES over the full program, with fall bookkeeping. */
export interface TESResult {
  tes: number
  caidas: number
  deducciones: number
  /** GOE of each element in execution order */
  goes: number[]
}

export function computeTES(
  program: ProgramData,
  skater: SkaterData,
  contextFlags: CompetitionContextFlags,
  rng: RNG,
  judges: readonly Judge[] = [],
): TESResult {
  const elements = simulateProgramElements(program, skater, contextFlags, rng, judges)
  let tes = 0
  let caidas = 0
  let deducciones = 0
  const goes: number[] = []
  for (const e of elements) {
    tes += e.tesBruto
    if (e.caida) caidas += 1
    deducciones += e.deduccion
    goes.push(e.goe)
  }
  return { tes, caidas, deducciones, goes }
}

// ─── element-by-element simulation ───────────────────────────────────────────

/**
 * runs the program element-by-element and exposes each ElementOutcome so the UI
 * can reveal them progressively. Each ElementOutcome holds the panel-trimmed GOE
 * plus the derived flags (caida, invalid) and bookkeeping (tesBruto, deduccion).
 *
 * Pure: the contextFlags argument is cloned; callers may reuse their object.
 * judges is optional; without judges, the GOE collapses to the clamped base value
 * (used by the program-designer projection in features/program/service.ts).
 */
export function simulateProgramElements(
  program: ProgramData,
  skater: SkaterData,
  contextFlags: CompetitionContextFlags,
  rng: RNG,
  judges: readonly Judge[] = [],
): ElementOutcome[] {
  const localFlags: CompetitionContextFlags = { ...contextFlags }
  const out: ElementOutcome[] = []

  for (const element of program.elementos) {
    const baseGOE = computeBaseGOE(skater, element, rng)
    const goe = computePanelGOE(baseGOE, localFlags, skater, judges)
    const caida = isFall(element, goe)
    const invalid = isInvalidated(element, goe)
    const tesBruto = invalid ? 0 : computeTESElement(element, goe)
    const deduccion = caida ? FALL_DEDUCTION : 0
    out.push({ element, goe, caida, invalid, tesBruto, deduccion })
    if (caida) localFlags.firstFallTriggered = true
  }
  return out
}

// ─── PCS ──────────────────────────────────────────────────────────────────────

/**
 * raw component score in 0–10 scale from skater + program + one judge.
 * GDD pág. 12 mapping (with realistic figure-skating sources):
 *
 *   SK Skating Skills    ← Amplitud/Línea, Sec. pasos, Físico (≡ 100 - fatiga)
 *   TR Transitions       ← Sec. pasos, Artística, Cohesión del programa
 *   PE Performance       ← Artística, Confianza, Presión competitiva
 *   CO Composition       ← Diseño (densidad), Cohesión, Coreógrafo
 *   IN Interpretation    ← Artística, Vínculo con la música, Rasgos / Motivación
 *
 * note: `vinculo` (coach-skater bond) is intentionally NOT used here. IN consumes
 * `program.vinculoMusical`, which is the bond between this skater and this music.
 */
export function computePCSComponent(
  component: PCSComponentKey,
  skater: SkaterData,
  program: ProgramData,
  judge: Judge,
): number {
  const t = skater.technical
  const psy = skater.psychological
  const ws = skater.weeklyState
  const densidad = program.densidadEmocional * 100
  const coreografo = program.coreografoNivel * 20
  const fisico = clamp(100 - ws.fatigaAcumulada, 0, 100)

  let raw: number
  switch (component) {
    case 'sk':
      // skating skills: amplitud + steps + condición física en el momento
      raw = 0.45 * t.amplitudLinea + 0.30 * t.secuenciaDePasos + 0.25 * fisico
      break
    case 'tr':
      // transitions: steps + artística + cohesión construida en Ensayo
      raw = 0.40 * t.secuenciaDePasos + 0.35 * t.artistica + 0.25 * program.cohesion
      break
    case 'pe': {
      // performance: artística + confianza + presión competitiva centrada
      const presionCentrada = 50 + psy.presionCompetitiva / 2
      raw = 0.40 * t.artistica + 0.35 * psy.confianza + 0.25 * presionCentrada
      break
    }
    case 'co':
      // composition: diseño musical + cohesión + nivel del coreógrafo
      raw = 0.30 * densidad + 0.35 * program.cohesion + 0.35 * coreografo
      break
    case 'in':
      // interpretation: artística + vínculo con la música + motivación intrínseca
      raw = 0.45 * t.artistica + 0.30 * program.vinculoMusical + 0.25 * psy.motivacionIntrinseca
      break
  }

  // map 0–100 → 0–10 ISU scale and apply this judge's per-component bias
  const base = raw / 10
  const bias = judge.sesgos.pcs?.[component] ?? 0
  return clamp(base + bias, 0, 10)
}

/** apply a judge bias to a score; component → PCS bias, omitted → TES bias. */
export function applyJudgeBias(
  rawScore: number,
  judge: Judge,
  component?: PCSComponentKey,
): number {
  if (component === undefined) {
    return rawScore + (judge.sesgos.tes ?? 0)
  }
  return rawScore + (judge.sesgos.pcs?.[component] ?? 0)
}

export interface PCSResult {
  detalle: PCSBreakdown
  total: number
}

/** full PCS with per-component trimming across the judging panel. */
export function computePCS(
  skater: SkaterData,
  program: ProgramData,
  judges: readonly Judge[],
): PCSResult {
  const components: PCSComponentKey[] = ['sk', 'tr', 'pe', 'co', 'in']
  const detalle: PCSBreakdown = { sk: 0, tr: 0, pe: 0, co: 0, in: 0 }
  let weightedSum = 0

  for (const comp of components) {
    const scores = judges.map(j => computePCSComponent(comp, skater, program, j))
    const avg = trimmedMean(scores)
    detalle[comp] = avg
    weightedSum += avg * PCS_COMPONENT_COEFFICIENTS[comp]
  }

  const factor = PCS_PROGRAM_FACTOR[program.tipo]
  return { detalle, total: weightedSum * factor }
}

// ─── finalization ────────────────────────────────────────────────────────────

/**
 * combines the (possibly Moment-mutated) elements with PCS to produce the full
 * ProgramScore. PCS depends only on judges + skater + program, so it can be
 * computed once at the end of revelation; TES is simply the sum of element
 * contributions, which is what makes the player's choices in Moments visible.
 */
export function finalizeProgramScore(
  elements: readonly ElementOutcome[],
  skater: SkaterData,
  program: ProgramData,
  judges: readonly Judge[],
): ProgramScore {
  let tes = 0
  let caidas = 0
  let deducciones = 0
  for (const e of elements) {
    tes += e.tesBruto
    if (e.caida) caidas += 1
    deducciones += e.deduccion
  }
  const pcs = computePCS(skater, program, judges)
  return {
    programType: program.tipo,
    elements: [...elements],
    tes,
    pcs:        pcs.total,
    pcsDetalle: pcs.detalle,
    caidas,
    deducciones,
    total: tes + pcs.total - deducciones,
  }
}

// ─── moment patching ──────────────────────────────────────────────────────────

/**
 * applies a Moment outcome to the elements that have not been revealed yet.
 * the element at fromIndex receives goeBonusCurrent; later elements receive
 * goeBonusRemaining. when causesFall is true, the element at fromIndex is
 * forced to a fall (clamps GOE to FALL_GOE_THRESHOLD) and the standard
 * "first fall" penalty propagates to subsequent elements unless one already
 * fell earlier in the program. In this fast path we use DEFAULT_POST_FALL_GOE_PENALTY
 * (panel average) since we don't re-resolve the panel here.
 *
 * Pure: returns a new array; never mutates the input.
 */
export function applyMomentToElements(
  elements: readonly ElementOutcome[],
  outcome: MomentOutcome,
  fromIndex: number,
  causesFall: boolean,
): ElementOutcome[] {
  if (elements.length === 0) return [...elements]
  const idx = Math.max(0, Math.min(fromIndex, elements.length - 1))
  const earlierFall = elements.slice(0, idx).some(e => e.caida)
  const next: ElementOutcome[] = elements.map(e => ({ ...e, element: e.element }))

  for (let i = idx; i < next.length; i++) {
    const cur = next[i]
    let goe = cur.goe
    if (i === idx) {
      if (causesFall) {
        goe = Math.min(goe, FALL_GOE_THRESHOLD)
      } else {
        goe += outcome.goeBonusCurrent
      }
    } else {
      goe += outcome.goeBonusRemaining
    }
    // propagate first-fall penalty when this Moment causes the program's first fall
    if (causesFall && i > idx && !earlierFall) {
      goe *= DEFAULT_POST_FALL_GOE_PENALTY
    }
    goe = clamp(goe, GOE_RANGE.min, GOE_RANGE.max)
    const caida = isFall(cur.element, goe)
    const invalid = isInvalidated(cur.element, goe)
    next[i] = {
      element:   cur.element,
      goe,
      caida,
      invalid,
      tesBruto:  invalid ? 0 : computeTESElement(cur.element, goe),
      deduccion: caida ? FALL_DEDUCTION : 0,
    }
  }
  return next
}

/**
 * builds the human-readable MomentImpact entry for a Moment that just resolved.
 * deltaTes is the TES difference between before and after applying the moment.
 */
export function summarizeMomentImpact(
  before: readonly ElementOutcome[],
  after: readonly ElementOutcome[],
  programType: ProgramScore['programType'],
  momentoId: string,
  optionId: string,
  causesFall: boolean,
): MomentImpact {
  const beforeTes = before.reduce((s, e) => s + e.tesBruto, 0)
  const afterTes = after.reduce((s, e) => s + e.tesBruto, 0)
  const deltaTes = afterTes - beforeTes
  const sign = deltaTes >= 0 ? '+' : ''
  const desc = causesFall
    ? `caída forzada por el Momento (${sign}${deltaTes.toFixed(1)} TES)`
    : `tu elección modificó la ejecución (${sign}${deltaTes.toFixed(1)} TES)`
  return {
    programType,
    momentoId,
    optionId,
    descripcion: desc,
    deltaTes,
    causesFall,
  }
}

// ─── legacy SimulationResult and aggregate simulate ──────────────────────────

export interface SimulationResult {
  tes:         number
  pcs:         number
  pcsDetalle:  PCSBreakdown
  total:       number
  caidas:      number
  deducciones: number
}

/**
 * legacy single-program simulation kept so the worker and existing tests keep
 * working unchanged. New competition code should call simulateProgramElements
 * + finalizeProgramScore so the UI can reveal element-by-element.
 */
export function simulate(
  skater: SkaterData,
  program: ProgramData,
  judges: readonly Judge[],
  contextFlags: CompetitionContextFlags,
  rng: RNG,
): SimulationResult {
  const elements = simulateProgramElements(program, skater, contextFlags, rng, judges)
  const score = finalizeProgramScore(elements, skater, program, judges)
  return {
    tes:         score.tes,
    pcs:         score.pcs,
    pcsDetalle:  score.pcsDetalle,
    total:       score.total,
    caidas:      score.caidas,
    deducciones: score.deducciones,
  }
}

// ─── legacy applyMomentToResult kept for the existing engine.test.ts ─────────

/**
 * legacy helper: re-scores TES on an already-totalled CompetitionResult by
 * applying the marginal effect of a Moment. The newer pipeline mutates the
 * ElementOutcome[] directly via applyMomentToElements; keep this so existing
 * call-sites compile while we migrate the UI.
 */
export function applyMomentToResult(
  result: CompetitionResult,
  outcome: MomentOutcome,
  fromElementIndex: number,
  programElements: readonly ProgramElement[],
): CompetitionResult {
  if (programElements.length === 0) return { ...result }
  const idx = Math.max(0, Math.min(fromElementIndex, programElements.length - 1))

  let tesDelta = 0
  for (let i = 0; i < programElements.length; i++) {
    const el = programElements[i]
    const factor = elementFactor(el)
    if (i === idx) {
      tesDelta += el.dificultadBase * factor * outcome.goeBonusCurrent
    } else if (i > idx) {
      tesDelta += el.dificultadBase * factor * outcome.goeBonusRemaining
    }
  }

  const tes = result.tes + tesDelta
  const total = tes + result.pcs - result.deducciones
  return { ...result, tes, total }
}
