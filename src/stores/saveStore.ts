import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useGameStore, GameState } from './gameStore'
import { useProgramStore } from '@/features/program'
import {
  save,
  load,
  getMetadata,
  deleteSave,
  generateSessionSummary,
} from '@/services/saveService'
import type {
  SaveSlot,
  SaveMetadata,
  SaveResult,
  LoadResult,
  LoadReason,
  GameStateSnapshot,
} from '@/services/saveService'
import { safeStorage } from '@/utils/safeStorage'

export type { SaveSlot, SaveMetadata, SaveResult, LoadResult, LoadReason } from '@/services/saveService'

// ─── store interface ──────────────────────────────────────────────────────────

interface SaveStoreState {
  /** false when localStorage is blocked; UI should show "modo sin guardado" */
  storageAvailable:  boolean
  /** cached metadata for each slot — populated on init and after each save/delete */
  slots:             Record<SaveSlot, SaveMetadata | null>
  /** last load attempt's reason — consumed by MainMenu to show a specific message */
  lastLoadReason:    LoadReason | null
  loadSlotMetadata:  () => void
  saveGame:          (slot: SaveSlot) => SaveResult
  loadGame:          (slot: SaveSlot) => LoadResult
  deleteSlot:        (slot: SaveSlot) => void
}

// ─── store ────────────────────────────────────────────────────────────────────

export const useSaveStore = create<SaveStoreState>()(
  devtools(
    (set) => ({
      storageAvailable: safeStorage.available,
      slots:            { 1: null, 2: null, 3: null },
      lastLoadReason:   null,

      loadSlotMetadata: () => {
        set(
          { slots: { 1: getMetadata(1), 2: getMetadata(2), 3: getMetadata(3) } },
          false,
          'save/loadSlotMetadata',
        )
      },

      saveGame: (slot) => {
        const gs = useGameStore.getState()
        const snapshot: GameStateSnapshot = {
          currentSkater:   gs.currentSkater,
          currentCoach:    gs.currentCoach,
          currentClub:     gs.currentClub,
          currentSeason:   gs.currentSeason,
          isFirstSession:  gs.isFirstSession,
          // future: pull from narrativeStore / eventStore when implemented
          narrativeFlags:  {},
          dialogueHistory: [],
          emittedEvents:   [],
          generatedEvents: [],
          confirmedPrograms: useProgramStore.getState().confirmedPrograms,
        }
        const result = save(slot, snapshot)
        if (result.ok) {
          set(
            (s) => ({ slots: { ...s.slots, [slot]: getMetadata(slot) } }),
            false,
            'save/saveGame',
          )
        }
        return result
      },

      loadGame: (slot) => {
        const result = load(slot)
        set({ lastLoadReason: result.reason }, false, 'save/setLastLoadReason')
        if (!result.file) return result

        const file = result.file
        // bypass changeState validation — restoring a saved state is not a game logic transition
        useGameStore.setState({
          currentSkater:  file.skater,
          currentCoach:   file.coach,
          currentClub:    file.club,
          currentSeason:  file.season,
          isFirstSession: file.isFirstSession,
          currentState:   GameState.SESSION_RESUME,
          stateHistory:   [GameState.SESSION_RESUME],
          sessionSummary: generateSessionSummary(file),
        })
        useProgramStore.getState().hydrateConfirmedPrograms(file.confirmedPrograms)
        return result
      },

      deleteSlot: (slot) => {
        deleteSave(slot)
        set(
          (s) => ({ slots: { ...s.slots, [slot]: null } }),
          false,
          'save/deleteSlot',
        )
      },
    }),
    { name: 'glace/save' },
  ),
)
