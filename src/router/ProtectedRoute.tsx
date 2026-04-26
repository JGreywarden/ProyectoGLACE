import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useGameStore, GameState } from '@/stores/gameStore'

interface Props {
  requiredStates: GameState[]
}

// canonical URL for each game state — used to recover from a state/URL mismatch
// without dumping the player back to the menu. Keeps the player on the right
// screen when changeState() and navigate() race during a transition.
const PATH_FOR_STATE: Readonly<Record<GameState, string>> = {
  [GameState.BOOT]:               '/',
  [GameState.MAIN_MENU]:          '/',
  [GameState.COACH_CREATION]:     '/nueva-partida',
  [GameState.SESSION_RESUME]:     '/sesion',
  [GameState.PROGRAM_DESIGNER]:   '/disenador-programa',
  [GameState.WEEKLY_PLANNING]:    '/semana',
  [GameState.WEEK_PROCESSING]:    '/procesando',
  [GameState.NARRATIVE_EVENT]:    '/evento',
  [GameState.COMPETITION]:        '/competicion',
  [GameState.SEASON_END]:         '/fin-temporada',
  [GameState.SKATER_RETIREMENT]:  '/retirada',
  [GameState.GAME_END]:           '/fin',
}

// layout route — renders children if currentState is valid, otherwise redirects
// to the canonical URL for the current state (NOT to "/"). This protects against
// the Zustand-vs-React-Router microtask race during state transitions: if the
// store update reaches the OLD route's ProtectedRoute before the new URL has
// propagated, we redirect to where currentState says we should be — not to the
// main menu.
export function ProtectedRoute({ requiredStates }: Props) {
  const currentState = useGameStore(s => s.currentState)
  const { pathname } = useLocation()
  if (requiredStates.includes(currentState)) return <Outlet />

  const target = PATH_FOR_STATE[currentState] ?? '/'
  // already on the target — nothing to do, prevents redirect loops if PATH_FOR_STATE
  // happens to point at this same route (e.g. SEASON_END route uses PROGRAM_DESIGNER)
  if (target === pathname) return <Outlet />
  return <Navigate to={target} replace />
}
