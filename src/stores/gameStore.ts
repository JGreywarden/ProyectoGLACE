import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { SkaterData } from '@/types/skater'
import type { CoachData } from '@/types/coach'
import type { ClubData } from '@/types/club'
import type { SeasonData } from '@/types/season'
import type { SessionSummary } from '@/services/saveService'

export enum GameState {
  BOOT               = 'BOOT',
  MAIN_MENU          = 'MAIN_MENU',
  COACH_CREATION     = 'COACH_CREATION',
  SESSION_RESUME     = 'SESSION_RESUME',
  WEEKLY_PLANNING    = 'WEEKLY_PLANNING',
  WEEK_PROCESSING    = 'WEEK_PROCESSING',
  NARRATIVE_EVENT    = 'NARRATIVE_EVENT',
  COMPETITION        = 'COMPETITION',
  SEASON_END         = 'SEASON_END',
  SKATER_RETIREMENT  = 'SKATER_RETIREMENT',
  GAME_END           = 'GAME_END',
}

const VALID_TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  [GameState.BOOT]:              [GameState.MAIN_MENU],
  [GameState.MAIN_MENU]:         [GameState.COACH_CREATION, GameState.SESSION_RESUME],
  [GameState.COACH_CREATION]:    [GameState.WEEKLY_PLANNING],
  [GameState.SESSION_RESUME]:    [GameState.WEEKLY_PLANNING],
  [GameState.WEEKLY_PLANNING]:   [GameState.WEEK_PROCESSING, GameState.SEASON_END],
  [GameState.WEEK_PROCESSING]:   [GameState.WEEKLY_PLANNING, GameState.NARRATIVE_EVENT, GameState.COMPETITION],
  [GameState.NARRATIVE_EVENT]:   [GameState.WEEKLY_PLANNING],
  [GameState.COMPETITION]:       [GameState.WEEKLY_PLANNING],
  [GameState.SEASON_END]:        [GameState.WEEKLY_PLANNING, GameState.SKATER_RETIREMENT],
  [GameState.SKATER_RETIREMENT]: [GameState.WEEKLY_PLANNING, GameState.GAME_END],
  [GameState.GAME_END]:          [],
}

interface GameStoreState {
  currentState:    GameState
  currentSkater:   SkaterData | null
  currentCoach:    CoachData | null
  currentClub:     ClubData | null
  currentSeason:   SeasonData | null
  isFirstSession:  boolean
  stateHistory:    GameState[]
  sessionSummary:  SessionSummary | null
  changeState:        (newState: GameState) => void
  setCurrentSkater:   (skater: SkaterData | null) => void
  setCurrentCoach:    (coach: CoachData | null) => void
  setCurrentClub:     (club: ClubData | null) => void
  setCurrentSeason:   (season: SeasonData | null) => void
  setIsFirstSession:  (value: boolean) => void
  setSessionSummary:  (summary: SessionSummary | null) => void
}

export const useGameStore = create<GameStoreState>()(
  devtools(
    (set, get) => ({
      currentState:   GameState.BOOT,
      currentSkater:  null,
      currentCoach:   null,
      currentClub:    null,
      currentSeason:  null,
      isFirstSession: true,
      stateHistory:   [GameState.BOOT],
      sessionSummary: null,

      changeState: (newState) => {
        const { currentState, stateHistory } = get()
        const allowed = VALID_TRANSITIONS[currentState]
        if (!allowed.includes(newState)) {
          throw new Error(
            `Transición ilegal: ${currentState} → ${newState}. Permitidas: [${allowed.join(', ') || '—'}]`,
          )
        }
        set(
          { currentState: newState, stateHistory: [...stateHistory, newState] },
          false,
          'game/changeState',
        )
      },

      setCurrentSkater:  (skater)  => set({ currentSkater: skater },   false, 'game/setCurrentSkater'),
      setCurrentCoach:   (coach)   => set({ currentCoach: coach },     false, 'game/setCurrentCoach'),
      setCurrentClub:    (club)    => set({ currentClub: club },       false, 'game/setCurrentClub'),
      setCurrentSeason:  (season)  => set({ currentSeason: season },   false, 'game/setCurrentSeason'),
      setIsFirstSession: (value)   => set({ isFirstSession: value },   false, 'game/setIsFirstSession'),
      setSessionSummary: (summary) => set({ sessionSummary: summary }, false, 'game/setSessionSummary'),
    }),
    { name: 'glace/game' },
  ),
)
