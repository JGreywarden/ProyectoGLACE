import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'

import { GameState, useGameStore } from '@/stores/gameStore'
import { useNarrativeStore } from '@/features/narrative'
import type { EventOutcome } from '@/features/narrative'

export function NarrativeEvent() {
  const navigate = useNavigate()
  const { event } = useNarrativeStore(useShallow(s => ({ event: s.currentEvent })))
  const resolveChoice = useNarrativeStore(s => s.resolveChoice)

  function handleChoice(optionId: string) {
    const outcome = resolveChoice(optionId)
    if (outcome && 'skaterPatch' in outcome) {
      applyEventOutcome(outcome)
    }
    useGameStore.getState().changeState(GameState.WEEKLY_PLANNING)
    navigate('/semana', { replace: true })
  }

  if (!event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-deep">
        <p className="font-display italic text-content-secondary">Sin evento activo.</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg-deep glace-grain">
      {/* radial glow at the centre, like a single overhead light */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 35%, rgba(78, 159, 200, 0.12), transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-12 px-12 py-16">

        {/* eyebrow */}
        <div className="glace-reveal-fade flex flex-col items-center gap-3">
          <span className="glace-eyebrow text-semantic-human">— evento narrativo</span>
          <span className="glace-hairline w-32" />
        </div>

        {/* title */}
        <h1 className="glace-reveal-letter font-display font-light text-7xl leading-[0.9] text-content-primary text-center">
          {event.titulo}
        </h1>

        {/* description with decorative quote marks */}
        <div className="glace-reveal glace-stagger-2 relative px-8">
          <span
            aria-hidden
            className="font-display absolute -left-2 -top-6 text-7xl text-ice-600/40 leading-none select-none"
          >
            «
          </span>
          <p className="font-display italic text-2xl leading-relaxed text-content-secondary text-center">
            {event.descripcion}
          </p>
          <span
            aria-hidden
            className="font-display absolute -right-2 -bottom-10 text-7xl text-ice-600/40 leading-none select-none"
          >
            »
          </span>
        </div>

        {/* hairline divider */}
        <div className="glace-hairline mx-auto w-48 mt-4" />

        {/* options */}
        <ul className="glace-reveal glace-stagger-3 flex flex-col gap-px bg-border-subtle">
          {event.opciones.map((opt, i) => (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => handleChoice(opt.id)}
                className="group flex w-full items-baseline gap-6 bg-bg-deep px-6 py-5 text-left transition-all duration-300 hover:-translate-y-[3px] hover:bg-bg-base"
              >
                <span className="font-display tabular-nums text-3xl text-content-disabled group-hover:text-ice-300 transition-colors leading-none w-8">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1 font-display text-xl text-content-primary group-hover:text-ice-200 transition-colors">
                  {opt.texto}
                </span>
                <span className="text-content-disabled group-hover:text-ice-300 group-hover:translate-x-1 transition-all">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function applyEventOutcome(outcome: EventOutcome): void {
  const gs = useGameStore.getState()
  const skater = gs.currentSkater
  if (!skater) return

  const patch: Partial<typeof skater> = {}
  if (outcome.skaterPatch.weeklyState) {
    patch.weeklyState = { ...skater.weeklyState, ...outcome.skaterPatch.weeklyState }
  }
  if (outcome.skaterPatch.technical) {
    patch.technical = { ...skater.technical, ...outcome.skaterPatch.technical }
  }
  if (outcome.skaterPatch.psychological) {
    patch.psychological = { ...skater.psychological, ...outcome.skaterPatch.psychological }
  }
  if (outcome.mutatedTrait) {
    patch.traits = skater.traits.map(t =>
      t.id === outcome.mutatedTrait!.from
        ? { ...t, mutated: 'positive' as const }
        : t,
    )
  }
  gs.applyWeekTransition({ skater: patch })
}
