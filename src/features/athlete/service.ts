// pure functions for skater state mutations — GDD cap. 3 (atributos, rasgos) & 4 (vínculo)

import {
  BOND_DECAY_PER_WEEK_MIN,
  BOND_DECAY_PER_WEEK_MAX,
  BOND_LAYERS,
} from '@/lib/balance'
import type { SkaterData, TraitDefinition, TraitId } from '@/types'
import type { TechnicalAttributes } from '@/types/skater'

import traitsRaw from '../../../public/data/traits.json'

// ─── mutation lookup ──────────────────────────────────────────────────────────

// built once at module load from public/data/traits.json
const MUTATION_DESTINATIONS = new Map<string, string>(
  (traitsRaw as Array<{ id: string; mutacion?: { traitDestino: string } }>)
    .flatMap(t =>
      t.mutacion?.traitDestino
        ? ([[t.id, t.mutacion.traitDestino]] as [string, string][])
        : [],
    ),
)

// ─── helpers ─────────────────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, v))

// ─── bond ─────────────────────────────────────────────────────────────────────

/** decays bond by 2–3 pts when no Dialogue slot was used this week (GDD cap. 4) */
export function applyBondDecay(
  skater: SkaterData,
  didDialogueThisWeek: boolean,
  rng: () => number = Math.random,
): SkaterData {
  if (didDialogueThisWeek) return skater
  const range = BOND_DECAY_PER_WEEK_MAX - BOND_DECAY_PER_WEEK_MIN
  const decay = BOND_DECAY_PER_WEEK_MIN + rng() * range
  return {
    ...skater,
    weeklyState: {
      ...skater.weeklyState,
      vinculo: clamp(skater.weeklyState.vinculo - decay),
    },
  }
}

// ─── fatigue ──────────────────────────────────────────────────────────────────

/** reduces fatigaAcumulada by the installation recovery bonus (positive number) */
export function applyFatigueRecovery(
  skater: SkaterData,
  installationBonus: number,
): SkaterData {
  return {
    ...skater,
    weeklyState: {
      ...skater.weeklyState,
      fatigaAcumulada: clamp(skater.weeklyState.fatigaAcumulada - installationBonus),
    },
  }
}

// ─── trait visibility ─────────────────────────────────────────────────────────

/**
 * returns the highest trait layer unlocked at the given bond level.
 * layer 1 ≥ 20, layer 2 ≥ 40, layer 3 ≥ 65 (BOND_LAYERS indices 0, 1, 3).
 */
export function computeTraitVisibilityLayer(bond: number): 0 | 1 | 2 | 3 {
  if (bond >= BOND_LAYERS[3]) return 3 // >= 65
  if (bond >= BOND_LAYERS[1]) return 2 // >= 40
  if (bond >= BOND_LAYERS[0]) return 1 // >= 20
  return 0
}

/** returns only traits whose layer is unlocked by the skater's current bond */
export function computeVisibleTraits(
  skater: SkaterData,
  allTraits: readonly TraitDefinition[],
): TraitDefinition[] {
  const maxLayer = computeTraitVisibilityLayer(skater.weeklyState.vinculo)
  return allTraits.filter(t => t.layer <= maxLayer)
}

// ─── attribute progression ────────────────────────────────────────────────────

/**
 * applies pre-computed gains to technical attributes.
 * ceiling per attribute = min(potential, skater.physical.techosBiologico).
 */
export function applyAttributeGains(
  skater: SkaterData,
  gains: Partial<Record<keyof TechnicalAttributes, number>>,
  potential = 100,
): SkaterData {
  const ceiling = Math.min(potential, skater.physical.techosBiologico)
  const technical = { ...skater.technical }
  for (const key of Object.keys(gains) as Array<keyof TechnicalAttributes>) {
    const delta = gains[key]
    if (delta === undefined) continue
    technical[key] = clamp(technical[key] + delta, 0, ceiling)
  }
  return { ...skater, technical }
}

// ─── mutation ─────────────────────────────────────────────────────────────────

export type MutationResult =
  | { mutated: true; newTraitId: string }
  | { mutated: false; newTraitId: null }

/** rolls a mutation check; mutates when rng() < probabilidad (GDD cap. 3) */
export function rollMutation(
  _skater: SkaterData,
  traitRiesgo: TraitId,
  probabilidad: number,
  rng: () => number = Math.random,
): MutationResult {
  if (rng() >= probabilidad) return { mutated: false, newTraitId: null }
  const newTraitId = MUTATION_DESTINATIONS.get(traitRiesgo) ?? null
  if (newTraitId === null) return { mutated: false, newTraitId: null }
  return { mutated: true, newTraitId }
}

// ─── injury ───────────────────────────────────────────────────────────────────

/**
 * computes weekly injury risk from training load.
 * above historialLesiones=70 risk amplifies exponentially (GDD cap. 3).
 * weeklyTechnicalLoad: sum of injuryRiskPct for the week's slots.
 */
export function computeInjuryRisk(
  skater: SkaterData,
  weeklyTechnicalLoad: number,
): number {
  const { historialLesiones } = skater.physical
  // exponential amplification above threshold — el GOE cae exponencialmente si historialLesiones > 70
  if (historialLesiones > 70) {
    return weeklyTechnicalLoad * Math.exp((historialLesiones - 70) / 30)
  }
  return weeklyTechnicalLoad
}
