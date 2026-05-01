// converts scouting profiles into playable SkaterData and surfaces N prospects
// for the founding-skater pick at career start. pure with respect to game state:
// the caller stores the chosen skater in gameStore.

import type { SkaterData, SkaterTrait, TraitId } from '@/types'
import { DEFAULT_SKATER_DATA } from '@/types'
import type { SkaterProfile } from '@/services/dataService'
import skatersRaw from '@/data/skaters.json'

// biological ceiling estimate from the scouting potencial label
const POTENCIAL_CEILING: Record<SkaterProfile['potencial'], number> = {
  bajo:        62,
  medio:       74,
  alto:        84,
  excepcional: 94,
}

const POTENCIAL_LABEL: Record<SkaterProfile['potencial'], string> = {
  bajo:        'potencial bajo',
  medio:       'potencial medio',
  alto:        'potencial alto',
  excepcional: 'potencial excepcional',
}

export { POTENCIAL_LABEL }

/**
 * Builds a complete SkaterData out of a SkaterProfile so the prospect can be
 * dropped straight into gameStore.currentSkater. Visible traits become active
 * SkaterTrait entries; physical attributes are derived from `potencial`.
 */
export function profileToSkater(
  profile: SkaterProfile,
  rng: () => number = Math.random,
): SkaterData {
  const ceiling = POTENCIAL_CEILING[profile.potencial]
  const traits: SkaterTrait[] = profile.rasgosVisibles.map((id) => ({
    id:      id as TraitId,
    active:  true,
    mutated: null,
  }))
  return {
    ...DEFAULT_SKATER_DATA,
    id:           `sk_${profile.id}_${Date.now().toString(36)}`,
    name:         profile.nombre,
    age:          profile.edad,
    nationality:  profile.nacionalidad,
    technical:    { ...profile.nivelVisible },
    psychological: { ...DEFAULT_SKATER_DATA.psychological },
    physical: {
      techosBiologico:       ceiling,
      historialLesiones:     Math.round(rng() * 10),
      velocidadRecuperacion: Math.max(55, ceiling - 8),
    },
    traits,
    weeklyState: { ...DEFAULT_SKATER_DATA.weeklyState },
  }
}

// skaters live as a compile-time JSON import: bootstrap (founding-skater pick)
// must work offline and cannot tolerate a fetch failure leaving the screen blocked.
const SKATERS_STATIC = (skatersRaw as SkaterProfile[]).filter((p) => p.disponible)

/** returns all available scouting profiles — never throws */
export function loadProspectPool(): SkaterProfile[] {
  return SKATERS_STATIC
}

/** picks `count` distinct prospects from the pool using the provided rng */
export function pickProspects(
  pool: readonly SkaterProfile[],
  count: number = 3,
  rng: () => number = Math.random,
): SkaterProfile[] {
  if (pool.length <= count) return [...pool]
  // Fisher-Yates partial shuffle
  const arr = [...pool]
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (arr.length - i))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, count)
}
