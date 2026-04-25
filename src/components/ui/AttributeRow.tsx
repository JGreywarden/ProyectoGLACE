interface Props {
  label:   string
  value:   number
  /** false hides the value behind a fog grid (psychological attrs locked by bond) */
  visible: boolean
  /** 0–100 baseline; values outside (e.g. -100..100) need a custom max */
  max?:    number
  min?:    number
  accent?: 'technical' | 'human' | 'bond' | 'neutral'
}

// hairline rather than progress bar; the bar is a single thin line that
// extends rightward, with a stronger 1px segment marking the value. closer to
// editorial infographic than to a generic UI gauge.
const ACCENT: Record<NonNullable<Props['accent']>, string> = {
  technical: 'bg-semantic-technical',
  human:     'bg-semantic-human',
  bond:      'bg-semantic-bond',
  neutral:   'bg-ice-300',
}

export function AttributeRow({
  label, value, visible, min = 0, max = 100, accent = 'neutral',
}: Props) {
  const span = max - min
  const pct  = span > 0 ? Math.max(0, Math.min(100, ((value - min) / span) * 100)) : 0
  return (
    <div className="grid grid-cols-[10rem_1fr_3rem] items-baseline gap-4 py-2.5 border-b border-border-subtle/60 last:border-0">
      <span className="font-display text-base text-content-secondary leading-none">{label}</span>

      <div className="relative h-px w-full bg-border-subtle">
        {visible ? (
          <>
            <div className={`absolute left-0 top-0 h-px ${ACCENT[accent]}`} style={{ width: `${pct}%` }} />
            <div
              className={`absolute top-1/2 -translate-y-1/2 h-2 w-px ${ACCENT[accent]}`}
              style={{ left: `calc(${pct}% - 0.5px)` }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, var(--c-text-disabled) 0 2px, transparent 2px 6px)',
            }}
          />
        )}
      </div>

      <span
        className={[
          'tabular-nums text-right',
          visible
            ? 'font-display text-2xl text-content-primary leading-none'
            : 'text-xs tracking-[0.3em] text-content-disabled',
        ].join(' ')}
      >
        {visible ? Math.round(value) : '—'}
      </span>
    </div>
  )
}
