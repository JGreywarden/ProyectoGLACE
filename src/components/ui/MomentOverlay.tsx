// modal overlay that pauses the rink animation while a competition Moment plays.
// the rink stays visible behind a darkening veil so the player feels the pause,
// not a context switch. a visible countdown bar warns the player that an
// auto-pick will fire if no choice is made in time.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { NarrativeEvent, NarrativeOption } from '@/features/narrative'

interface Props {
  event:         NarrativeEvent
  onChoose:      (optionId: string) => void
  /** seconds before auto-pick fires; default 7 (anti-softlock) */
  autoPickAfterSeconds?: number
}

const DEFAULT_TIMEOUT_SECONDS = 7

// ranks options by mechanical magnitude — lowest = most neutral
function neutralOption(opciones: readonly NarrativeOption[]): NarrativeOption {
  const score = (o: NarrativeOption): number => {
    const e = o.efectos
    return Math.abs(e.goeDeltaCurrent ?? 0) * 10
         + Math.abs(e.goeDeltaRemaining ?? 0) * 30
         + Math.abs((e.varianzaMultiplier ?? 1) - 1) * 5
         + Math.abs(e.bondDelta ?? 0) * 0.1
         + (e.causesFall ? 100 : 0)
  }
  return [...opciones].sort((a, b) => score(a) - score(b))[0]
}

export function MomentOverlay({ event, onChoose, autoPickAfterSeconds }: Props) {
  const fallback = useMemo(() => {
    if (event.defaultOptionId) {
      return event.opciones.find(o => o.id === event.defaultOptionId) ?? neutralOption(event.opciones)
    }
    return neutralOption(event.opciones)
  }, [event])

  const totalSeconds = autoPickAfterSeconds ?? event.momentTimeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS
  const startedAt = useRef<number>(performance.now())
  const [remaining, setRemaining] = useState<number>(totalSeconds)
  const decided = useRef<boolean>(false)

  // animate the remaining time at ~60fps via rAF — keeps the bar smooth without
  // flooding React state updates (one per frame is fine for a brief overlay)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const elapsed = (performance.now() - startedAt.current) / 1000
      const left = Math.max(0, totalSeconds - elapsed)
      setRemaining(left)
      if (left <= 0 && !decided.current) {
        decided.current = true
        onChoose(fallback.id)
        return
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [totalSeconds, fallback, onChoose])

  function handleChoose(optionId: string) {
    if (decided.current) return
    decided.current = true
    onChoose(optionId)
  }

  const pct = Math.max(0, Math.min(1, remaining / totalSeconds))
  const isLowTime = remaining < 2.5

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={event.titulo}
      className="absolute inset-0 z-30 flex items-center justify-center px-12 glace-grain"
      style={{ backgroundColor: 'rgba(12, 18, 32, 0.92)' }}
    >
      <div className="relative flex w-full max-w-3xl flex-col gap-8 px-12 py-12">
        {/* hairline frame — left and right verticals */}
        <span className="glace-hairline-v absolute left-0 top-8 bottom-8" aria-hidden />
        <span className="glace-hairline-v absolute right-0 top-8 bottom-8" aria-hidden />

        <header className="glace-reveal-fade flex flex-col items-center gap-3 text-center">
          <span className="glace-eyebrow text-semantic-human">— momento de competición —</span>
          <h2 className="glace-reveal-letter glace-stagger-1 font-display text-5xl text-content-primary leading-[0.95]">
            {event.titulo}
          </h2>
        </header>

        {/* countdown bar — visible top-of-mind so the player knows time is ticking */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between font-display text-xs uppercase tracking-widest">
            <span className={isLowTime ? 'text-danger' : 'text-content-disabled'}>
              decide
            </span>
            <span className={[
              'tabular-nums',
              isLowTime ? 'text-danger' : 'text-content-secondary',
            ].join(' ')}>
              {remaining.toFixed(1)}s
            </span>
          </div>
          <div className="relative h-[2px] w-full bg-border-subtle overflow-hidden">
            <div
              className={[
                'absolute inset-y-0 left-0 transition-colors',
                isLowTime ? 'bg-danger' : 'bg-ice-400',
              ].join(' ')}
              style={{
                width: `${pct * 100}%`,
                // disable transition on width so the rAF loop drives motion smoothly
                transitionProperty: 'background-color',
              }}
              aria-hidden
            />
          </div>
        </div>

        <div className="glace-hairline mx-auto w-32" />

        <p className="glace-reveal glace-stagger-2 mx-auto max-w-2xl font-display italic text-2xl leading-relaxed text-content-secondary text-center">
          {event.descripcion}
        </p>

        <ul className="glace-reveal glace-stagger-3 flex flex-col gap-px bg-border-subtle">
          {event.opciones.map((opt, i) => (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => handleChoose(opt.id)}
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
