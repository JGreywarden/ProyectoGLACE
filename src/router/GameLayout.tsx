import { useEffect } from 'react'
import { Outlet, useBlocker } from 'react-router-dom'
import { useGameStore, GameState } from '@/stores/gameStore'

// states where the player is mid-session — going "back" would mean undoing a processed week
const ACTIVE_GAME_STATES = new Set<GameState>([
  GameState.WEEKLY_PLANNING,
  GameState.WEEK_PROCESSING,
  GameState.NARRATIVE_EVENT,
  GameState.COMPETITION,
  GameState.SEASON_END,
  GameState.SKATER_RETIREMENT,
])

// wraps all active-game routes; silently discards browser back navigation
// navigation forward during gameplay should use navigate('/path', { replace: true })
// so the session history never accumulates entries the player could pop back to
export function GameLayout() {
  const currentState = useGameStore(s => s.currentState)
  const isActiveGame = ACTIVE_GAME_STATES.has(currentState)

  const blocker = useBlocker(
    ({ historyAction }) => isActiveGame && historyAction === 'POP',
  )

  useEffect(() => {
    if (blocker.state === 'blocked') {
      blocker.reset()
    }
  }, [blocker])

  return <Outlet />
}
