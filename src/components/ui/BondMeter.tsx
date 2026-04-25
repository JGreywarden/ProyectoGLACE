// purple bar with milestone ticks at 20/40/55/65 — bond reveals psychological attrs.
// the bond color is exclusive (--c-semantic-bond per GDD cap. 18).

interface Props {
  value:   number  // 0–100
  showMilestones?: boolean
  /** when true, lay out as a single-row label+value+bar (footer use) */
  compact?: boolean
}

const MILESTONES = [20, 40, 55, 65] as const

export function BondMeter({ value, showMilestones = true, compact = false }: Props) {
  const pct = Math.max(0, Math.min(100, value))

  if (compact) {
    return (
      <div className="flex items-baseline gap-3">
        <span className="glace-eyebrow">vínculo</span>
        <div className="relative h-px flex-1 bg-border-subtle">
          <div
            className="absolute left-0 top-0 h-px bg-semantic-bond transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
          {showMilestones &&
            MILESTONES.map(m => (
              <span
                key={m}
                className="absolute top-1/2 -translate-y-1/2 h-1.5 w-px bg-content-disabled"
                style={{ left: `${m}%` }}
              />
            ))}
          <span
            className="absolute top-1/2 -translate-y-1/2 h-2 w-px bg-semantic-bond"
            style={{ left: `calc(${pct}% - 0.5px)` }}
          />
        </div>
        <span className="font-display text-2xl text-semantic-bond tabular-nums leading-none">
          {Math.round(pct)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="glace-eyebrow">vínculo</span>
        <span className="font-display text-4xl text-semantic-bond tabular-nums leading-none">
          {Math.round(pct)}
        </span>
      </div>
      <div className="relative h-px w-full bg-border-subtle">
        <div
          className="absolute left-0 top-0 h-px bg-semantic-bond transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
        {showMilestones &&
          MILESTONES.map(m => (
            <span
              key={m}
              className="absolute top-1/2 -translate-y-1/2 h-2 w-px bg-content-disabled"
              style={{ left: `${m}%` }}
              title={`umbral ${m}`}
            />
          ))}
        <span
          className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-semantic-bond"
          style={{ left: `calc(${pct}% - 0.5px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-content-disabled">
        {MILESTONES.map(m => <span key={m}>{m}</span>)}
      </div>
    </div>
  )
}
