import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useGameStore, GameState } from './gameStore'
import {
  save,
  load,
  getMetadata,
  deleteSave,
  generateSessionSummary,
} from '@/services/saveService'
import type { SaveSlot, SaveMetadata, SaveResult, GameStateSnapshot } from '@/services/saveService'

export type { SaveSlot, SaveMetadata, SaveResult } from '@/services/saveService'

// ─── store interface ──────────────────────────────────────────────────────────

interface SaveStoreState {
  /** cached metadata for each slot — populated on init and after each save/delete */
  slots:             Record<SaveSlot, SaveMetadata | null>
  /** reads slot metadata from localStorage into Zustand state */
  loadSlotMetadata:  () => void
  /** serializes game state and writes to the given slot; returns full result */
  saveGame:          (slot: SaveSlot) => SaveResult
  /** loads a save slot, restores game state, and generates the session summary */
  loadGame:          (slot: SaveSlot) => boolean
  /** removes primary save and backup for the given slot */
  deleteSlot:        (slot: SaveSlot) => void
}

// ─── store ────────────────────────────────────────────────────────────────────

export const useSaveStore = create<SaveStoreState>()(
  devtools(
    (set) => ({
      slots: { 1: null, 2: null, 3: null },

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
        const file = load(slot)
        if (!file) return false

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
        return true
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
