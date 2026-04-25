import { useNavigate } from 'react-router-dom'
import { GameState, useGameStore } from '@/stores/gameStore'

export function MainMenu() {
  const navigate = useNavigate()

  function startNewGame() {
    useGameStore.getState().changeState(GameState.COACH_CREATION)
    navigate('/nueva-partida')
  }

  return (
    <div className="relative min-h-screen overflow-hidden glace-vignette glace-grain">
      {/* asymmetric layout — title pushed left and high, copy floats lower-right */}
      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl grid-cols-12 gap-6 px-10 py-16">

        {/* eyebrow at top-left */}
        <div className="col-span-12 flex items-baseline justify-between">
          <span className="glace-reveal-fade glace-eyebrow">— manager narrativo · patinaje sobre hielo</span>
          <span className="glace-reveal-fade glace-stagger-2 glace-eyebrow text-content-disabled">
            v0.1 · fase 1
          </span>
        </div>

        {/* title block — col 1-9, vertically centred */}
        <div className="col-span-12 md:col-span-9 flex flex-col justify-center gap-8">
          <h1 className="glace-reveal-letter font-display font-light text-[14rem] leading-[0.85] tracking-[-0.05em] text-content-primary">
            GLACÉ
          </h1>

          <div className="glace-hairline w-48" />

          <p className="glace-reveal glace-stagger-3 max-w-md font-display italic text-2xl leading-snug text-content-secondary">
            la pista no es donde se gana o se pierde.
            <br />
            <span className="text-ice-300">es donde se aprende a quién se entrena.</span>
          </p>
        </div>

        {/* action — col 10-12, anchored bottom right */}
        <div className="col-span-12 md:col-span-3 flex flex-col justify-end gap-6">
          <div className="glace-hairline-v hidden h-32 md:block" />

          <button
            type="button"
            onClick={startNewGame}
            className="group glace-reveal glace-stagger-4 flex flex-col items-end gap-2 text-right"
          >
            <span className="glace-eyebrow text-ice-300 group-hover:text-ice-200 transition-colors">
              comenzar
            </span>
            <span className="font-display text-5xl text-content-primary group-hover:text-ice-200 transition-colors">
              Nueva partida
              <span className="ml-2 inline-block transition-transform duration-300 group-hover:translate-x-2">→</span>
            </span>
          </button>

          <div className="text-right text-[10px] uppercase tracking-[0.3em] text-content-disabled">
            sesión 20–40 min · sin instalación · sin login
          </div>
        </div>

      </div>
    </div>
  )
}
