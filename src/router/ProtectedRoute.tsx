import { Navigate, Outlet } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import type { GameState } from '@/stores/gameStore'

interface Props {
  requiredStates: GameState[]
}

// layout route — renders children if currentState is valid, redirects to / otherwise
export function ProtectedRoute({ requiredStates }: Props) {
  const currentState = useGameStore(s => s.currentState)
  return requiredStates.includes(currentState) ? <Outlet /> : <Navigate to="/" replace />
}
