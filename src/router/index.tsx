import { createBrowserRouter } from 'react-router-dom'
import { RootLayout } from '@/App'
import { ProtectedRoute } from '@/router/ProtectedRoute'
import { GameLayout } from '@/router/GameLayout'
import { MainMenu } from '@/pages/MainMenu'
import { CoachCreation } from '@/pages/CoachCreation'
import { SessionResume } from '@/pages/SessionResume'
import { WeeklyPlanning } from '@/pages/WeeklyPlanning'
import { WeekProcessing } from '@/pages/WeekProcessing'
import { NarrativeEvent } from '@/pages/NarrativeEvent'
import { Competition } from '@/pages/Competition'
import { SeasonEnd } from '@/pages/SeasonEnd'
import { SkaterRetirement } from '@/pages/SkaterRetirement'
import { GameEnd } from '@/pages/GameEnd'
import { DisenadorPrograma } from '@/pages/DisenadorPrograma'
import { FichaPatinador } from '@/pages/FichaPatinador'
import { Calendario } from '@/pages/Calendario'
import { GameState } from '@/stores/gameStore'

// ─── route map ────────────────────────────────────────────────────────────────
//
//  /                   MainMenu          — always accessible from MAIN_MENU
//  /nueva-partida      CoachCreation     — requires COACH_CREATION
//  /sesion             SessionResume     — requires SESSION_RESUME
//  /disenador-programa DisenadorPrograma — requires PROGRAM_DESIGNER
//
//  Active-game routes (wrapped by GameLayout → back button disabled):
//  /semana             WeeklyPlanning    — requires WEEKLY_PLANNING
//  /procesando         WeekProcessing    — requires WEEK_PROCESSING
//  /evento             NarrativeEvent    — requires NARRATIVE_EVENT
//  /competicion        Competition       — requires COMPETITION
//  /fin-temporada      SeasonEnd         — requires SEASON_END
//  /retirada           SkaterRetirement  — requires SKATER_RETIREMENT
//  /fin                GameEnd           — requires GAME_END
//
//  Debug-only auxiliary views (not state-protected; useful when in WEEKLY_PLANNING):
//  /ficha              FichaPatinador
//  /calendario         Calendario
//
//  Adding a new route:
//   1. Create src/pages/MyPage.tsx
//   2. Add a GameState entry in gameStore.ts + VALID_TRANSITIONS
//   3. Add a child entry below following the same pattern

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      // ── main menu ────────────────────────────────────────────────────────
      { index: true, element: <MainMenu /> },

      // ── pre-game setup (no back-button restriction) ───────────────────────
      {
        element: <ProtectedRoute requiredStates={[GameState.COACH_CREATION]} />,
        children: [{ path: 'nueva-partida', element: <CoachCreation /> }],
      },
      {
        element: <ProtectedRoute requiredStates={[GameState.SESSION_RESUME]} />,
        children: [{ path: 'sesion', element: <SessionResume /> }],
      },
      {
        element: <ProtectedRoute requiredStates={[GameState.PROGRAM_DESIGNER, GameState.SEASON_END]} />,
        children: [{ path: 'disenador-programa', element: <DisenadorPrograma /> }],
      },

      // ── auxiliary debug routes — readable from any active state ──────────
      { path: 'ficha',      element: <FichaPatinador /> },
      { path: 'calendario', element: <Calendario /> },

      // ── active game (GameLayout silently blocks browser back navigation) ──
      {
        element: <GameLayout />,
        children: [
          {
            element: <ProtectedRoute requiredStates={[GameState.WEEKLY_PLANNING]} />,
            children: [{ path: 'semana', element: <WeeklyPlanning /> }],
          },
          {
            element: <ProtectedRoute requiredStates={[GameState.WEEK_PROCESSING]} />,
            children: [{ path: 'procesando', element: <WeekProcessing /> }],
          },
          {
            element: <ProtectedRoute requiredStates={[GameState.NARRATIVE_EVENT]} />,
            children: [{ path: 'evento', element: <NarrativeEvent /> }],
          },
          {
            element: <ProtectedRoute requiredStates={[GameState.COMPETITION]} />,
            children: [{ path: 'competicion', element: <Competition /> }],
          },
          {
            element: <ProtectedRoute requiredStates={[GameState.SEASON_END]} />,
            children: [{ path: 'fin-temporada', element: <SeasonEnd /> }],
          },
          {
            element: <ProtectedRoute requiredStates={[GameState.SKATER_RETIREMENT]} />,
            children: [{ path: 'retirada', element: <SkaterRetirement /> }],
          },
          {
            element: <ProtectedRoute requiredStates={[GameState.GAME_END]} />,
            children: [{ path: 'fin', element: <GameEnd /> }],
          },
        ],
      },
    ],
  },
])
