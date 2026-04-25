import type { ValidationViolation } from '@/features/program'

interface Props {
  violations: readonly ValidationViolation[]
}

export function ISUValidationBanner({ violations }: Props) {
  const valid = violations.length === 0
  return (
    <div
      role={valid ? 'status' : 'alert'}
      className={[
        'border-l-2 px-5 py-3 transition-opacity duration-500',
        valid
          ? 'border-l-success bg-success/[0.04] opacity-60'
          : 'border-l-danger bg-danger/[0.06]',
      ].join(' ')}
    >
      <p className={[
        'glace-eyebrow leading-tight',
        valid ? 'text-success' : 'text-danger',
      ].join(' ')}>
        {valid
          ? '— programa conforme ISU'
          : `— ${violations.length} violación${violations.length > 1 ? 'es' : ''} ISU`}
      </p>
      {!valid && (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-content-secondary">
          {violations.map(v => (
            <li key={v.code} className="font-display italic">
              <span className="text-content-disabled">·</span> {v.mensaje}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
