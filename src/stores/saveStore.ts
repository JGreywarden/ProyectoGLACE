import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useGameStore, GameState } from './gameStore'
import type { SkaterData } from '@/types/skater'
import type { CoachData } from '@/types/coach'
import type { ClubData } from '@/types/club'
import type { SeasonData } from '@/types/season'

export type SaveSlot = 1 | 2 | 3

const SAVE_KEYS: Record<SaveSlot, string> = {
  1: 'glace_save_1',
  2: 'glace_save_2',
  3: 'glace_save_3',
}

export interface SlotMetadata {
  fechaGuardado:   string  // ISO-8601 datetime
  semanaActual:    number
  temporadaNumero: number
  nombrePatinador: string
}

interface SaveData {
  saveVersion:    1
  metadata:       SlotMetadata
  skater:         SkaterData | null
  coach:          CoachData | null
  club:           ClubData | null
  season:         SeasonData | null
  isFirstSession: boolean
}

export interface SessionSummary {
  slots: Record<SaveSlot, SlotMetadata | null>
  currentSession: {
    coach:  CoachData | null
    skater: SkaterData | null
    season: SeasonData | null
  }
}

interface SaveStoreState {
  slots:                  Record<SaveSlot, SlotMetadata | null>
  loadSlotMetadata:       () => void
  saveGame:               (slot: SaveSlot) => boolean
  loadGame:               (slot: SaveSlot) => boolean
  deleteSlot:             (slot: SaveSlot) => void
  generateSessionSummary: () => SessionSummary
}

function readMetadata(slot: SaveSlot): SlotMetadata | null {
  const raw = localStorage.getItem(SAVE_KEYS[slot])
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as SaveData
    return data.saveVersion === 1 ? data.metadata : null
  } catch {
    return null
  }
}

export const useSaveStore = create<SaveStoreState>()(
  devtools(
    (set, get) => ({
      slots: { 1: null, 2: null, 3: null },

      loadSlotMetadata: () => {
        set(
          { slots: { 1: readMetadata(1), 2: readMetadata(2), 3: readMetadata(3) } },
          false,
          'save/loadSlotMetadata',
        )
      },

      saveGame: (slot) => {
        const { currentSkater, currentCoach, currentClub, currentSeason, isFirstSession } =
          useGameStore.getState()
        const metadata: SlotMetadata = {
          fechaGuardado:   new Date().toISOString(),
          semanaActual:    currentSeason?.semanaActual    ?? 1,
          temporadaNumero: currentSeason?.temporadaNumero ?? 1,
          nombrePatinador: currentSkater?.name ?? '',
        }
        const saveData: SaveData = {
          saveVersion: 1,
          metadata,
          skater:         currentSkater,
          coach:          currentCoach,
          club:           currentClub,
          season:         currentSeason,
          isFirstSession,
        }
        try {
          localStorage.setItem(SAVE_KEYS[slot], JSON.stringify(saveData))
          set(
            (s) => ({ slots: { ...s.slots, [slot]: metadata } }),
            false,
            'save/saveGame',
          )
          return true
        } catch {
          return false
        }
      },

      loadGame: (slot) => {
        const raw = localStorage.getItem(SAVE_KEYS[slot])
        if (!raw) return false
        try {
          const data = JSON.parse(raw) as SaveData
          if (data.saveVersion !== 1) return false
          // bypass changeState validation — restoring a saved state is not a game logic transition
          useGameStore.setState({
            currentSkater:  data.skater,
            currentCoach:   data.coach,
            currentClub:    data.club,
            currentSeason:  data.season,
            isFirstSession: data.isFirstSession,
            currentState:   GameState.SESSION_RESUME,
            stateHistory:   [GameState.SESSION_RESUME],
          })
          return true
        } catch {
          return false
        }
      },

      deleteSlot: (slot) => {
        localStorage.removeItem(SAVE_KEYS[slot])
        set(
          (s) => ({ slots: { ...s.slots, [slot]: null } }),
          false,
          'save/deleteSlot',
        )
      },

      generateSessionSummary: () => {
        const { currentCoach, currentSkater, currentSeason } = useGameStore.getState()
        return {
          slots:          get().slots,
          currentSession: { coach: currentCoach, skater: currentSkater, season: currentSeason },
        }
      },
    }),
    { name: 'glace/save' },
  ),
)
