import type { ActivityId } from '@/features/training'

interface Props {
  index:        number
  activityId:   ActivityId | null
  onClick:      () => void
  selected?:    boolean
}

const LABELS: Record<ActivityId, string> = {
  tecnico:  'Técnico',
  fisico:   'Físico',
  mental:   'Mental',
  descanso: 'Descanso',
  ensayo:   'Ensayo',
  dialogo:  'Diálogo',
}

// the marks are intentionally pictographic and minimal — nordic skating sigils,
// not generic icons. each one points to the activity's nature (line, breath, rest…).
const GLYPHS: Record<ActivityId, string> = {
  tecnico:  '✕',
  fisico:   '/',
  mental:   '◯',
  descanso: '—',
  ensayo:   '~',
  dialogo:  '«»',
}

export function ActivitySlot({ index, activityId, onClick, selected = false }: Props) {
  const empty = activityId === null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ranura ${index + 1}: ${empty ? 'sin asignar' : LABELS[activityId]}`}
      className={[
        'group relative flex h-32 w-full flex-col justify-between',
        'border-l px-4 py-4 text-left',
        'glace-lift',
        selected
          ? 'border-l-ice-300 bg-ice-500/[0.04]'
          : empty
            ? 'border-l-border-subtle hover:border-l-ice-500'
            : 'border-l-ice-600 hover:border-l-ice-300',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-display text-3xl text-content-disabled tabular-nums leading-none">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className={[
          'text-xl leading-none',
          empty ? 'text-content-disabled' : 'text-ice-300 group-hover:text-ice-200',
        ].join(' ')}>
          {empty ? '·' : GLYPHS[activityId]}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="glace-eyebrow">ranura</span>
        <span className={[
          'font-display text-xl',
          empty ? 'italic text-content-muted' : 'text-content-primary',
        ].join(' ')}>
          {empty ? 'sin asignar' : LABELS[activityId]}
        </span>
      </div>
    </button>
  )
}
