import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useGameStore, GameState } from '@/stores/gameStore'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// root-level boundary. ANY uncaught throw (incl. changeState's illegal-transition
// error) lands here instead of blanking the app. fallback UI provides a one-click
// recovery path that bypasses changeState's validation to avoid re-throwing.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary captured error:', error, info.componentStack)
  }

  private handleReturnToMenu = (): void => {
    // setState directly — changeState would throw from any terminal state
    useGameStore.setState({
      currentState:  GameState.MAIN_MENU,
      stateHistory:  [GameState.MAIN_MENU],
    })
    this.setState({ error: null })
    window.location.assign('/')
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg-deep text-content-primary p-8">
          <div className="max-w-xl space-y-4 text-center">
            <h1 className="text-2xl font-semibold">Algo ha salido mal</h1>
            <p className="opacity-80">
              Se ha producido un error inesperado. El estado del juego está a salvo en tus slots de guardado.
            </p>
            {import.meta.env.DEV && (
              <pre className="text-left text-xs bg-bg-surface p-3 rounded overflow-auto">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReturnToMenu}
              className="px-4 py-2 rounded bg-ice-500 hover:bg-ice-400 text-bg-deep font-medium"
            >
              Volver al menú principal
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
