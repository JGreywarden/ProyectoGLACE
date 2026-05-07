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

// 'ok'       — every data file loaded
// 'degraded' — at least one optional file failed (e.g. music_library); game can still start
// 'failed'   — a load-bearing file is missing (judges, installations, competitions);
//              callers must block "Nueva partida" until the user retries
export type DataLoadStatus = 'idle' | 'loading' | 'ok' | 'degraded' | 'failed'

interface DataStoreState {
  /** true once preloadAll() resolved AND no critical file is missing */
  loaded:       boolean
  status:       DataLoadStatus
  /** absolute paths of files that failed in the last preloadAll() call */
  failedPaths:  string[]
  /** subset of failedPaths whose absence blocks new games */
  criticalMissing: string[]
  preloadAll:      () => Promise<void>
  getEventsByType: (type: EventType) => Promise<NarrativeEvent[]>
  getRandomEvent:  (conditions: RandomEventConditions) => Promise<NarrativeEvent | null>
  getJudgePanel:   (competitionId: string) => Promise<Judge[]>
}

export const useDataStore = create<DataStoreState>()(
  devtools(
    (set) => ({
      loaded:          false,
      status:          'idle',
      failedPaths:     [],
      criticalMissing: [],

      preloadAll: async () => {
        set({ status: 'loading' }, false, 'data/preloadStart')
        const { failed, critical } = await preloadAll()
        const status: DataLoadStatus =
          critical.length > 0 ? 'failed'
          : failed.length > 0 ? 'degraded'
          : 'ok'
        set(
          {
            loaded:          status !== 'failed',
            status,
            failedPaths:     failed,
            criticalMissing: critical,
          },
          false,
          'data/preloadAll',
        )
      },

      getEventsByType: (type) => getEventsByType(type),
      getRandomEvent:  (conditions) => getRandomEvent(conditions),
      getJudgePanel:   (competitionId) => getJudgePanel(competitionId),
    }),
    { name: 'glace/data' },
  ),
)
