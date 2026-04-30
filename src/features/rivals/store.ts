// rivals store — holds the persisted pool for the current season and
// provides hydration + regeneration helpers for SaveFile round-trips.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { generateRivalPool } from './service'
import type { RivalsPool } from './types'

interface RivalsState {
  pool: RivalsPool | null
  /** ensures a pool exists for the given season; regenerates only when missing or stale */
  ensurePool: (seasonNumber: number, rng?: () => number) => RivalsPool
  /** rehydrate from a SaveFile; pass null to clear */
  hydratePool: (pool: RivalsPool | null) => void
  /** force a fresh pool for the given season — used when starting a new season */
  regeneratePool: (seasonNumber: number, rng?: () => number) => RivalsPool
}

export const useRivalsStore = create<RivalsState>()(
  devtools(
    (set, get) => ({
      pool: null,

      ensurePool: (seasonNumber, rng = Math.random) => {
        const current = get().pool
        if (current && current.seasonNumber === seasonNumber) return current
        const fresh = generateRivalPool(seasonNumber, rng)
        set({ pool: fresh }, false, 'rivals/ensurePool')
        return fresh
      },

      hydratePool: (pool) => {
        set({ pool }, false, 'rivals/hydratePool')
      },

      regeneratePool: (seasonNumber, rng = Math.random) => {
        const fresh = generateRivalPool(seasonNumber, rng)
        set({ pool: fresh }, false, 'rivals/regeneratePool')
        return fresh
      },
    }),
    { name: 'glace/rivals' },
  ),
)
