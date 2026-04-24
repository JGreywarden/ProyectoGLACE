// narrative event pool — loading, filtering, selection, resolution.
// pure functions; rng injectable; never touches stores.

import { rollMutation } from '@/features/athlete'
import type { SkaterData, TraitId } from '@/types'
import { getFasePorSemana } from '@/types/season'
import { TRAITS_BY_ID } from '@/types/skater'
import {
  isFiniteNumber,
  isInRange,
  isInteger,
  isPlainObject,
} from '@/utils/validation'

import type {
  EventOutcome,
  MomentOutcome,
  MomentoTrigger,
  NarrativeCondition,
  NarrativeContext,
  NarrativeEvent,
  NarrativeEventType,
  NarrativeOption,
  NarrativeOptionEffect,
} from './types'

// ─── file registry ───────────────────────────────────────────────────────────

const EVENT_FILES: readonly NarrativeEventType[] = [
  'cotidiano',
  'revelacion',
  'crisis',
  'decision_moral',
  'terceros',
  'logro_compartido',
  'momento_competicion',
] as const

// ─── cooldown quotas ─────────────────────────────────────────────────────────

const COOLDOWN_WEEKS: Partial<Record<NarrativeEventType, number>> = {
  crisis:     3,
  revelacion: 4,
}

// weights for weighted random among weekly-event pool (exclusive of Moments)
const WEEKLY_WEIGHTS: Record<Exclude<NarrativeEventType, 'momento_competicion'>, number> = {
  cotidiano:        4,
  revelacion:       2,
  crisis:           1,
  decision_moral:   2,
  terceros:         2,
  logro_compartido: 1,
}

const VALID_TYPES: ReadonlySet<string> = new Set<NarrativeEventType>([
  'revelacion',
  'crisis',
  'decision_moral',
  'terceros',
  'cotidiano',
  'logro_compartido',
  'momento_competicion',
])

const VALID_TRIGGERS: ReadonlySet<string> = new Set<MomentoTrigger>(['early', 'mid', 'late'])

// ─── validators ──────────────────────────────────────────────────────────────

function validateConditions(v: unknown): v is NarrativeCondition {
  if (!isPlainObject(v)) return false

  if (v['minVinculo'] !== undefined && !isInRange(v['minVinculo'], 0, 100)) return false
  if (v['maxVinculo'] !== undefined && !isInRange(v['maxVinculo'], 0, 100)) return false
  if (v['minEstres']  !== undefined && !isInRange(v['minEstres'],  0, 100)) return false
  if (v['maxEstres']  !== undefined && !isInRange(v['maxEstres'],  0, 100)) return false

  if (v['faseTemporada'] !== undefined) {
    if (!Array.isArray(v['faseTemporada'])) return false
    if (!v['faseTemporada'].every(p => typeof p === 'string')) return false
  }
  if (v['flagsRequeridos'] !== undefined) {
    if (!Array.isArray(v['flagsRequeridos'])) return false
    if (!v['flagsRequeridos'].every(f => typeof f === 'string')) return false
  }
  if (v['flagsBloqueantes'] !== undefined) {
    if (!Array.isArray(v['flagsBloqueantes'])) return false
    if (!v['flagsBloqueantes'].every(f => typeof f === 'string')) return false
  }
  const temp = v['temporadaMinima']
  if (temp !== undefined) {
    if (!isInteger(temp) || temp < 1) return false
  }
  return true
}

function validateOptionEffect(v: unknown): v is NarrativeOptionEffect {
  if (!isPlainObject(v)) return false

  if (v['vinculoDelta']  !== undefined && !isInRange(v['vinculoDelta'],  -100, 100)) return false
  if (v['estresDelta']   !== undefined && !isInRange(v['estresDelta'],   -100, 100)) return false
  if (v['fatigueDelta']  !== undefined && !isInRange(v['fatigueDelta'],  -100, 100)) return false

  const attrs = v['atributosDelta']
  if (attrs !== undefined) {
    if (!isPlainObject(attrs)) return false
    for (const k of Object.keys(attrs)) {
      if (!isFiniteNumber(attrs[k])) return false
    }
  }

  const flags = v['narrativeFlags']
  if (flags !== undefined) {
    if (!isPlainObject(flags)) return false
    for (const k of Object.keys(flags)) {
      const val = flags[k]
      if (typeof val !== 'boolean' && typeof val !== 'number' && typeof val !== 'string') {
        return false
      }
    }
  }

  if (v['rasgoRiesgo'] !== undefined && typeof v['rasgoRiesgo'] !== 'string') return false
  if (v['probabilidadMutacion'] !== undefined && !isInRange(v['probabilidadMutacion'], 0, 1)) return false

  if (v['goeDeltaCurrent']    !== undefined && !isInRange(v['goeDeltaCurrent'],    -1,   1))   return false
  if (v['goeDeltaRemaining']  !== undefined && !isInRange(v['goeDeltaRemaining'],  -0.3, 0.3)) return false
  if (v['varianzaMultiplier'] !== undefined && !isInRange(v['varianzaMultiplier'],  0.5, 2.0)) return false
  if (v['bondDelta']          !== undefined && !isInRange(v['bondDelta'],         -100, 100))  return false

  return true
}

function validateOption(v: unknown): v is NarrativeOption {
  if (!isPlainObject(v)) return false
  if (typeof v['id'] !== 'string' || v['id'].length === 0) return false
  if (typeof v['texto'] !== 'string') return false
  if (!validateOptionEffect(v['efectos'])) return false
  return true
}

/** type guard for a single NarrativeEvent — validates ranges and Moment-specific fields */
export function validateNarrativeEvent(data: unknown): data is NarrativeEvent {
  if (!isPlainObject(data)) return false
  if (typeof data['id'] !== 'string' || data['id'].length === 0) return false
  if (typeof data['tipo'] !== 'string' || !VALID_TYPES.has(data['tipo'])) return false
  if (typeof data['titulo'] !== 'string') return false
  if (typeof data['descripcion'] !== 'string') return false

  if (!validateConditions(data['condiciones'])) return false

  if (!Array.isArray(data['opciones']) || data['opciones'].length === 0) return false
  if (!data['opciones'].every(validateOption)) return false

  if (data['tipo'] === 'momento_competicion') {
    if (typeof data['trigger'] !== 'string' || !VALID_TRIGGERS.has(data['trigger'])) return false
  } else if (data['trigger'] !== undefined && !VALID_TRIGGERS.has(String(data['trigger']))) {
    return false
  }

  if (data['source'] !== undefined && data['source'] !== 'static' && data['source'] !== 'generated') return false
  if (data['generatedAt'] !== undefined && typeof data['generatedAt'] !== 'string') return false
  if (data['promptSeed']  !== undefined && typeof data['promptSeed']  !== 'string') return false
  if (data['model']       !== undefined && typeof data['model']       !== 'string') return false

  return true
}

// ─── pool loader ─────────────────────────────────────────────────────────────

/**
 * fetches and validates every event file under /data/events/.
 * individual file failures log a warning and are skipped; if ALL files fail
 * this throws — the caller should handle it as a hard bootstrap error.
 */
export async function loadEvents(): Promise<NarrativeEvent[]> {
  const events: NarrativeEvent[] = []
  let successCount = 0

  for (const tipo of EVENT_FILES) {
    try {
      const res = await fetch(`/data/events/${tipo}.json`)
      if (!res.ok) {
        console.warn(`[narrative] skip ${tipo}.json: HTTP ${res.status}`)
        continue
      }
      const raw: unknown = await res.json()
      if (!Array.isArray(raw)) {
        console.warn(`[narrative] skip ${tipo}.json: expected array`)
        continue
      }
      successCount++
      for (const entry of raw) {
        if (validateNarrativeEvent(entry)) {
          events.push(entry)
        } else {
          const id = isPlainObject(entry) && typeof entry['id'] === 'string' ? entry['id'] : '<anon>'
          console.warn(`[narrative] invalid event in ${tipo}.json: ${id}`)
        }
      }
    } catch (err) {
      console.warn(`[narrative] failed to load ${tipo}.json:`, err)
    }
  }

  if (successCount === 0) {
    throw new Error('[narrative] failed to load any event file')
  }

  return events
}

// ─── condition evaluation ───────────────────────────────────────────────────

/** returns true when every field of event.condiciones is satisfied by context */
export function evaluateConditions(
  event: NarrativeEvent,
  context: NarrativeContext,
): boolean {
  const c = event.condiciones
  const { vinculo, estres } = context.skater.weeklyState

  if (c.minVinculo !== undefined && vinculo < c.minVinculo) return false
  if (c.maxVinculo !== undefined && vinculo > c.maxVinculo) return false
  if (c.minEstres  !== undefined && estres  < c.minEstres)  return false
  if (c.maxEstres  !== undefined && estres  > c.maxEstres)  return false

  if (c.faseTemporada && c.faseTemporada.length > 0) {
    const fase = getFasePorSemana(context.season.semanaActual)
    if (!c.faseTemporada.includes(fase)) return false
  }

  if (c.temporadaMinima !== undefined && context.season.temporadaNumero < c.temporadaMinima) return false

  if (c.flagsRequeridos) {
    for (const f of c.flagsRequeridos) {
      if (!context.narrativeFlags[f]) return false
    }
  }
  if (c.flagsBloqueantes) {
    for (const f of c.flagsBloqueantes) {
      if (context.narrativeFlags[f]) return false
    }
  }

  return true
}

// ─── weekly selection ───────────────────────────────────────────────────────

/** extra inputs needed to enforce subtype cooldowns between weekly selections */
export interface WeeklySelectionState {
  /** current game week number (1–30) */
  currentWeek: number
  /** week number of the most recent emission per subtype */
  lastEmittedBySubtype: Partial<Record<NarrativeEventType, number>>
}

function passesCooldown(
  tipo: NarrativeEventType,
  state: WeeklySelectionState | undefined,
): boolean {
  if (!state) return true
  const cooldown = COOLDOWN_WEEKS[tipo]
  if (!cooldown) return true
  const last = state.lastEmittedBySubtype[tipo]
  if (last === undefined) return true
  return state.currentWeek - last >= cooldown
}

function weightedPick<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  rng: () => number,
): T | null {
  if (items.length === 0) return null
  let total = 0
  for (const it of items) total += weightOf(it)
  if (total <= 0) return null
  let r = rng() * total
  for (const it of items) {
    r -= weightOf(it)
    if (r < 0) return it
  }
  return items[items.length - 1] ?? null
}

/**
 * selects one weekly narrative event from the pool. Excludes Moments, events
 * already emitted, and events on cooldown. Picks weighted-randomly by type.
 */
export function selectWeeklyEvent(
  pool: readonly NarrativeEvent[],
  context: NarrativeContext,
  rng: () => number = Math.random,
  state?: WeeklySelectionState,
): NarrativeEvent | null {
  const emitted = new Set(context.emittedEvents)
  const candidates = pool.filter(e =>
    e.tipo !== 'momento_competicion' &&
    !emitted.has(e.id) &&
    passesCooldown(e.tipo, state) &&
    evaluateConditions(e, context),
  )
  if (candidates.length === 0) return null
  return weightedPick(
    candidates,
    e => (e.tipo === 'momento_competicion' ? 0 : WEEKLY_WEIGHTS[e.tipo]),
    rng,
  )
}

// ─── competition-moment selection ────────────────────────────────────────────

/**
 * selects one competition Moment for the given trigger point. Moments can
 * repeat across competitions — emittedEvents is intentionally NOT consulted.
 */
export function selectCompetitionMoment(
  pool: readonly NarrativeEvent[],
  trigger: MomentoTrigger,
  context: NarrativeContext,
  rng: () => number = Math.random,
): NarrativeEvent | null {
  const candidates = pool.filter(e =>
    e.tipo === 'momento_competicion' &&
    e.trigger === trigger &&
    evaluateConditions(e, context),
  )
  if (candidates.length === 0) return null
  const idx = Math.floor(rng() * candidates.length)
  return candidates[Math.min(idx, candidates.length - 1)] ?? null
}

// ─── effect application ─────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

function findOption(event: NarrativeEvent, optionId: string): NarrativeOption | null {
  return event.opciones.find(o => o.id === optionId) ?? null
}

/** narrows an arbitrary string to the TraitId union by catalog membership */
function isTraitId(v: string): v is TraitId {
  return Object.prototype.hasOwnProperty.call(TRAITS_BY_ID, v)
}

/**
 * applies a weekly event option to the context and returns the resulting
 * patches. Ignores Moment-only mechanical fields (they only make sense inside
 * a competition program).
 */
export function applyEventEffect(
  context: NarrativeContext,
  event: NarrativeEvent,
  optionId: string,
  rng: () => number = Math.random,
): EventOutcome {
  const opt = findOption(event, optionId)
  const skater = context.skater
  const skaterPatch: Partial<SkaterData> = {}
  const flagsPatch: Record<string, boolean | number | string> = {}

  if (!opt) return { skaterPatch, flagsPatch }

  const e = opt.efectos

  // vinculo + estres + fatigue → weeklyState
  const nextWeekly: SkaterData['weeklyState'] = { ...skater.weeklyState }
  let weeklyTouched = false
  if (e.vinculoDelta !== undefined) {
    nextWeekly.vinculo = clamp(nextWeekly.vinculo + e.vinculoDelta)
    weeklyTouched = true
  }
  if (e.estresDelta !== undefined) {
    nextWeekly.estres = clamp(nextWeekly.estres + e.estresDelta)
    weeklyTouched = true
  }
  if (e.fatigueDelta !== undefined) {
    nextWeekly.fatigaAcumulada = clamp(nextWeekly.fatigaAcumulada + e.fatigueDelta)
    weeklyTouched = true
  }
  // bondDelta applies in-competition too — support outside
  if (e.bondDelta !== undefined) {
    nextWeekly.vinculo = clamp(nextWeekly.vinculo + e.bondDelta)
    weeklyTouched = true
  }
  if (weeklyTouched) skaterPatch.weeklyState = nextWeekly

  // atributosDelta: technical keys or psychological keys. unknown keys
  // (pcsBonus, repMediatica…) are ignored — they surface via flags if needed.
  if (e.atributosDelta) {
    const technical: SkaterData['technical'] = { ...skater.technical }
    const psychological: SkaterData['psychological'] = { ...skater.psychological }
    let techTouched = false
    let psyTouched = false
    for (const [key, delta] of Object.entries(e.atributosDelta)) {
      switch (key) {
        case 'saltos':
        case 'giros':
        case 'secuenciaDePasos':
        case 'amplitudLinea':
          technical[key] = clamp(technical[key] + delta, 0, skater.physical.techosBiologico)
          techTouched = true
          break
        case 'confianza':
        case 'resistenciaMental':
        case 'motivacionIntrinseca':
        case 'autoexigencia':
          psychological[key] = clamp(psychological[key] + delta, 0, 100)
          psyTouched = true
          break
        case 'presionCompetitiva':
          psychological[key] = clamp(psychological[key] + delta, -100, 100)
          psyTouched = true
          break
      }
    }
    if (techTouched) skaterPatch.technical = technical
    if (psyTouched)  skaterPatch.psychological = psychological
  }

  // flags
  if (e.narrativeFlags) {
    for (const [k, v] of Object.entries(e.narrativeFlags)) flagsPatch[k] = v
  }

  // mutation roll
  let mutatedTrait: EventOutcome['mutatedTrait']
  if (e.rasgoRiesgo && isTraitId(e.rasgoRiesgo) && e.probabilidadMutacion !== undefined && e.probabilidadMutacion > 0) {
    const roll = rollMutation(skater, e.rasgoRiesgo, e.probabilidadMutacion, rng)
    if (roll.mutated) {
      mutatedTrait = { from: e.rasgoRiesgo, to: roll.newTraitId }
    }
  }

  return mutatedTrait
    ? { skaterPatch, flagsPatch, mutatedTrait }
    : { skaterPatch, flagsPatch }
}

/**
 * extracts the mechanical knobs of a competition-Moment option. Pure and
 * synchronous — competition engine applies the returned deltas directly.
 */
export function applyMomentEffect(
  event: NarrativeEvent,
  optionId: string,
): MomentOutcome {
  const opt = findOption(event, optionId)
  const flagsPatch: Record<string, boolean | number | string> = {}

  if (!opt) {
    return {
      goeBonusCurrent: 0,
      goeBonusRemaining: 0,
      varianzaMultiplier: 1.0,
      bondDelta: 0,
      flagsPatch,
    }
  }
  const e = opt.efectos
  if (e.narrativeFlags) {
    for (const [k, v] of Object.entries(e.narrativeFlags)) flagsPatch[k] = v
  }
  return {
    goeBonusCurrent:    e.goeDeltaCurrent    ?? 0,
    goeBonusRemaining:  e.goeDeltaRemaining  ?? 0,
    varianzaMultiplier: e.varianzaMultiplier ?? 1.0,
    bondDelta:          e.bondDelta          ?? 0,
    flagsPatch,
  }
}
