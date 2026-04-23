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
  PROGRAM_DESIGNER   = 'PROGRAM_DESIGNER',
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
  [GameState.COACH_CREATION]:    [GameState.PROGRAM_DESIGNER],
  [GameState.PROGRAM_DESIGNER]:  [GameState.WEEKLY_PLANNING],
  [GameState.SESSION_RESUME]:    [GameState.WEEKLY_PLANNING],
  [GameState.WEEKLY_PLANNING]:   [GameState.WEEK_PROCESSING, GameState.SEASON_END],
  [GameState.WEEK_PROCESSING]:   [GameState.WEEKLY_PLANNING, GameState.NARRATIVE_EVENT, GameState.COMPETITION],
  [GameState.NARRATIVE_EVENT]:   [GameState.WEEKLY_PLANNING],
  [GameState.COMPETITION]:       [GameState.WEEKLY_PLANNING],
  [GameState.SEASON_END]:        [GameState.WEEKLY_PLANNING, GameState.SKATER_RETIREMENT, GameState.PROGRAM_DESIGNER],
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
  /** atomic cross-entity update: merges all patches in a single set() so no
   *  intermediate render can observe inconsistent state between skater/coach/club/season */
  applyWeekTransition: (patch: WeekTransitionPatch) => void
}

export interface WeekTransitionPatch {
  skater?: Partial<SkaterData>
  coach?:  Partial<CoachData>
  club?:   Partial<ClubData>
  season?: Partial<SeasonData>
}

const HISTORY_MAX = 50

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
        // cap history to last HISTORY_MAX entries — not serialized in saves so
        // truncation is observational-only; prevents unbounded growth in long sessions
        const nextHistory = stateHistory.length >= HISTORY_MAX
          ? [...stateHistory.slice(-(HISTORY_MAX - 1)), newState]
          : [...stateHistory, newState]
        set(
          { currentState: newState, stateHistory: nextHistory },
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

      applyWeekTransition: (patch) => {
        const { currentSkater, currentCoach, currentClub, currentSeason } = get()
        const next: Partial<GameStoreState> = {}
        if (patch.skater && currentSkater) next.currentSkater = { ...currentSkater, ...patch.skater }
        if (patch.coach  && currentCoach)  next.currentCoach  = { ...currentCoach,  ...patch.coach  }
        if (patch.club   && currentClub)   next.currentClub   = { ...currentClub,   ...patch.club   }
        if (patch.season && currentSeason) next.currentSeason = { ...currentSeason, ...patch.season }
        set(next, false, 'game/applyWeekTransition')
      },
    }),
    { name: 'glace/game' },
  ),
)
