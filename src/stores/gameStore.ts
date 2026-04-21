import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { GameClock, SeasonPhase } from '@/types'

const WEEKS_PER_SEASON = 30

interface GameState extends GameClock {
  advanceWeek: () => void
  setPhase:    (phase: SeasonPhase) => void
}

export const useGameStore = create<GameState>()(
  devtools(
    (set, get) => ({
      week:   1,
      season: 1,
      phase:  'preseason',

      advanceWeek: () => {
        const { week, season } = get()
        const isLastWeek = week >= WEEKS_PER_SEASON
        set(
          isLastWeek
            ? { week: 1, season: season + 1, phase: 'preseason' }
            : { week: week + 1 },
          false,
          'game/advanceWeek',
        )
      },

      setPhase: (phase) => set({ phase }, false, 'game/setPhase'),
    }),
    { name: 'glace/game' },
  ),
)
