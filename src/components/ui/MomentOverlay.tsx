// modal overlay that pauses the rink animation while a competition Moment plays.
// the rink stays visible behind a darkening veil so the player feels the pause,
// not a context switch. anti-softlock: a 30-second timer auto-picks the lowest-impact option.

import { useEffect, useMemo } from 'react'
import type { NarrativeEvent, NarrativeOption } from '@/features/narrative'

interface Props {
  event:         NarrativeEvent
  onChoose:      (optionId: string) => void
  /** seconds before auto-pick fires; default 30 (anti-softlock) */
  autoPickAfterSeconds?: number
}

// ranks options by mechanical magnitude — lowest = most neutral
function neutralOption(opciones: readonly NarrativeOption[]): NarrativeOption {
  const score = (o: NarrativeOption): number => {
    const e = o.efectos
    return Math.abs(e.goeDeltaCurrent ?? 0) * 10
         + Math.abs(e.goeDeltaRemaining ?? 0) * 30
         + Math.abs((e.varianzaMultiplier ?? 1) - 1) * 5
         + Math.abs(e.bondDelta ?? 0) * 0.1
  }
  return [...opciones].sort((a, b) => score(a) - score(b))[0]
}

export function MomentOverlay({ event, onChoose, autoPickAfterSeconds = 30 }: Props) {
  const fallback = useMemo(() => neutralOption(event.opciones), [event])

  useEffect(() => {
    const id = window.setTimeout(() => {
      onChoose(fallback.id)
    }, autoPickAfterSeconds * 1000)
    return () => window.clearTimeout(id)
  }, [fallback, autoPickAfterSeconds, onChoose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={event.titulo}
      className="absolute inset-0 z-30 flex items-center justify-center px-12 glace-grain"
      style={{ backgroundColor: 'rgba(12, 18, 32, 0.92)' }}
    >
      <div className="relative flex w-full max-w-3xl flex-col gap-10 px-12 py-14">
        {/* hairline frame — left and right verticals */}
        <span className="glace-hairline-v absolute left-0 top-8 bottom-8" aria-hidden />
        <span className="glace-hairline-v absolute right-0 top-8 bottom-8" aria-hidden />

        <header className="glace-reveal-fade flex flex-col items-center gap-3 text-center">
          <span className="glace-eyebrow text-semantic-human">— momento de competición —</span>
          <h2 className="glace-reveal-letter glace-stagger-1 font-display text-5xl text-content-primary leading-[0.95]">
            {event.titulo}
          </h2>
        </header>

        <div className="glace-hairline mx-auto w-32" />

        <p className="glace-reveal glace-stagger-2 mx-auto max-w-2xl font-display italic text-2xl leading-relaxed text-content-secondary text-center">
          {event.descripcion}
        </p>

        <ul className="glace-reveal glace-stagger-3 flex flex-col gap-px bg-border-subtle">
          {event.opciones.map((opt, i) => (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => onChoose(opt.id)}
                className={[
                  'group flex w-full items-baseline gap-6 bg-bg-deep/80 px-6 py-5 text-left',
                  'glace-lift hover:bg-bg-base',
                ].join(' ')}
              >
                <span className="font-display text-3xl text-content-disabled tabular-nums leading-none w-8 group-hover:text-ice-300 transition-colors">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="font-display text-xl text-content-primary group-hover:text-ice-200 transition-colors flex-1">
                  {opt.texto}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
