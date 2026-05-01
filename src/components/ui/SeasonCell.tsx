import type { FaseSeason } from '@/types'

interface Props {
  semana:    number
  fase:      FaseSeason
  hasCompetition?: boolean
  hasEvent?: boolean
  isCurrent?: boolean
  tooltip?:  string
}

// each fase paints a fine top-line in a slightly different cold tint, so the
// calendar reads as a horizon of phases rather than a chunky color grid
const FASE_BAR: Record<FaseSeason, string> = {
  Construccion: 'before:bg-border-strong',
  Activacion:   'before:bg-ice-600',
  Pico:         'before:bg-ice-300',
  Rearme:       'before:bg-ice-600',
  Cierre:       'before:bg-frost-500',
}

const FASE_LABEL: Record<FaseSeason, string> = {
  Construccion: 'Construcción',
  Activacion:   'Activación',
  Pico:         'Pico',
  Rearme:       'Rearme',
  Cierre:       'Cierre',
}

export function SeasonCell({
  semana, fase, hasCompetition = false, hasEvent = false, isCurrent = false, tooltip,
}: Props) {
  const title = tooltip ?? `Semana ${semana} — ${FASE_LABEL[fase]}`
  return (
    <div
      title={title}
      aria-label={title}
      className={[
        'relative flex h-16 w-full flex-col justify-between p-2',
        'before:absolute before:left-0 before:top-0 before:h-px before:w-full',
        FASE_BAR[fase],
        isCurrent ? 'bg-bg-surface' : 'bg-bg-base hover:bg-bg-surface transition-colors',
      ].join(' ')}
    >
      <span className={[
        'font-display tabular-nums text-2xl leading-none',
        isCurrent ? 'text-ice-300' : 'text-content-secondary',
      ].join(' ')}>
        {String(semana).padStart(2, '0')}
      </span>

      <div className="flex items-center gap-1.5">
        {hasCompetition && <span className="h-1 w-1 rounded-full bg-gold" aria-label="competición" />}
        {hasEvent       && <span className="h-1 w-1 rounded-full bg-semantic-human" aria-label="evento" />}
        {isCurrent      && <span className="h-1 w-1 rounded-full bg-ice-300" aria-label="actual" />}
      </div>
    </div>
  )
}
