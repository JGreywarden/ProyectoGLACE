import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'
import { GameState, useGameStore } from '@/stores/gameStore'

export function SessionResume() {
  const navigate = useNavigate()
  const { sessionSummary, skater, season } = useGameStore(
    useShallow((s) => ({
      sessionSummary: s.sessionSummary,
      skater:         s.currentSkater,
      season:         s.currentSeason,
    })),
  )

  function continueSession() {
    useGameStore.getState().changeState(GameState.WEEKLY_PLANNING)
    navigate('/semana', { replace: true })
  }

  function backToMenu() {
    // bypass changeState() — there's no legal SESSION_RESUME → MAIN_MENU
    // transition, but the player should always be able to step away from a load
    useGameStore.setState({
      currentState: GameState.MAIN_MENU,
      stateHistory: [GameState.MAIN_MENU],
    })
    navigate('/', { replace: true })
  }

  if (!skater || !season) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 glace-vignette px-6 text-center">
        <span className="glace-eyebrow text-danger">— sesión</span>
        <p className="font-display italic text-content-secondary">No hay datos de partida cargados.</p>
        <button
          type="button"
          onClick={backToMenu}
          className="group flex items-baseline gap-3 text-content-primary hover:text-ice-200"
        >
          <span className="font-display text-2xl">volver al menú</span>
          <span className="transition-transform group-hover:translate-x-2">→</span>
        </button>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen glace-vignette glace-grain">
      <div className="relative mx-auto grid min-h-screen max-w-4xl grid-cols-12 gap-8 px-10 py-16">

        <div className="col-span-12 flex items-baseline gap-4">
          <span className="glace-eyebrow">— bienvenido de vuelta</span>
          <span className="glace-hairline flex-1" />
          <span className="glace-eyebrow text-content-disabled">
            temporada {season.temporadaNumero} · semana {season.semanaActual}
          </span>
        </div>

        <div className="col-span-12 flex flex-col justify-center gap-6">
          <h1 className="glace-reveal-letter font-display text-7xl leading-[0.9] text-content-primary">
            {skater.name}
          </h1>
          <p className="font-display italic text-2xl leading-relaxed text-content-secondary max-w-2xl">
            {sessionSummary?.mensajeResumen ??
              `Continuando en la semana ${season.semanaActual}, temporada ${season.temporadaNumero}.`}
          </p>
        </div>

        <div className="col-span-12 flex items-baseline gap-8">
          <button
            type="button"
            onClick={continueSession}
            className="group flex items-baseline gap-3 text-content-primary hover:text-ice-200"
          >
            <span className="font-display text-3xl">continuar la temporada</span>
            <span className="text-2xl text-ice-300 transition-transform duration-300 group-hover:translate-x-2">→</span>
          </button>
          <button
            type="button"
            onClick={backToMenu}
            className="font-display italic text-base text-content-muted hover:text-danger transition-colors"
          >
            volver al menú
          </button>
        </div>
      </div>
    </div>
  )
}
