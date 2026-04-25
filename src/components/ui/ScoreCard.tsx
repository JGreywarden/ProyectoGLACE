interface Props {
  label:   string
  value:   number | string
  unit?:   string
  /** display the big number with the narrative serif (Cormorant Garamond) */
  narrative?: boolean
  accent?: 'ice' | 'frost' | 'gold' | 'neutral'
  /** larger display number (used in competition footer) */
  size?:   'sm' | 'md' | 'lg' | 'xl'
}

const ACCENT: Record<NonNullable<Props['accent']>, string> = {
  ice:     'text-ice-300',
  frost:   'text-frost-400',
  gold:    'text-gold',
  neutral: 'text-content-primary',
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-3xl',
  md: 'text-5xl',
  lg: 'text-6xl',
  xl: 'text-8xl',
}

export function ScoreCard({
  label, value, unit, narrative = false, accent = 'neutral', size = 'md',
}: Props) {
  const display = typeof value === 'number' ? value.toFixed(2) : value
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="glace-eyebrow">{label}</span>
      <div className="flex items-baseline gap-2">
        <span
          className={[
            narrative ? 'glace-number' : 'font-sans tabular-nums leading-none',
            SIZE[size],
            ACCENT[accent],
          ].join(' ')}
        >
          {display}
        </span>
        {unit ? (
          <span className="text-xs uppercase tracking-[0.2em] text-content-muted">{unit}</span>
        ) : null}
      </div>
    </div>
  )
}
