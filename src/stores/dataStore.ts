import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  getEventsByType,
  getRandomEvent,
  getJudgePanel,
  preloadAll,
} from '@/services/dataService'
import type {
  EventType,
  NarrativeEvent,
  Judge,
  RandomEventConditions,
} from '@/services/dataService'

// re-export domain types so existing imports from this module continue to work
export type { EventType, NarrativeEvent, Judge, RandomEventConditions } from '@/services/dataService'

// ─── store ────────────────────────────────────────────────────────────────────

interface DataStoreState {
  /** true once preloadAll() has resolved without errors */
  loaded: boolean
  preloadAll:      () => Promise<void>
  getEventsByType: (type: EventType) => Promise<NarrativeEvent[]>
  getRandomEvent:  (conditions: RandomEventConditions) => Promise<NarrativeEvent | null>
  getJudgePanel:   (competitionId: string) => Promise<Judge[]>
}

export const useDataStore = create<DataStoreState>()(
  devtools(
    (set) => ({
      loaded: false,

      preloadAll: async () => {
        await preloadAll()
        set({ loaded: true }, false, 'data/preloadAll')
      },

      getEventsByType: (type) => getEventsByType(type),
      getRandomEvent:  (conditions) => getRandomEvent(conditions),
      getJudgePanel:   (competitionId) => getJudgePanel(competitionId),
    }),
    { name: 'glace/data' },
  ),
)
