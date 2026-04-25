import type { ElementType, JumpType, ProgramElement } from '@/types/program'
import { getJumpBaseValue } from '@/features/program'

interface Props {
  index:    number
  total:    number
  element:  ProgramElement
  onChange: (patch: Partial<ProgramElement>) => void
  onMove:   (dir: -1 | 1) => void
  onRemove: () => void
}

const TIPOS: ElementType[] = ['salto', 'giro', 'secuenciaPasos', 'secuenciaCoreografica', 'espiral']
const JUMPS: JumpType[]    = ['axel', 'lutz', 'flip', 'loop', 'salchow', 'toeloop']

const TIPO_LABEL: Record<ElementType, string> = {
  salto:                 'salto',
  giro:                  'giro',
  secuenciaPasos:        'pasos',
  secuenciaCoreografica: 'sec. coreográfica',
  espiral:               'espiral',
}

export function ProgramElementRow({ index, total, element, onChange, onMove, onRemove }: Props) {
  const isJump = element.tipo === 'salto'

  function setTipo(tipo: ElementType) {
    if (tipo === 'salto') {
      const tipoSalto = element.tipoSalto ?? 'toeloop'
      const rotaciones = element.rotaciones ?? 3
      onChange({
        tipo,
        tipoSalto,
        rotaciones,
        dificultadBase: getJumpBaseValue(tipoSalto, rotaciones as 1|2|3|4),
      })
    } else {
      onChange({ tipo, tipoSalto: null, rotaciones: null })
    }
  }

  function setSubtipo(salto: JumpType) {
    const rotaciones = (element.rotaciones ?? 3) as 1|2|3|4
    onChange({
      tipoSalto: salto,
      dificultadBase: getJumpBaseValue(salto, rotaciones),
    })
  }

  function setRotaciones(r: 1|2|3|4) {
    if (!element.tipoSalto) return
    onChange({
      rotaciones: r,
      dificultadBase: getJumpBaseValue(element.tipoSalto, r),
    })
  }

  return (
    <div className="group grid grid-cols-[3rem_1.4fr_1fr_0.7fr_0.7fr_auto] items-baseline gap-4 border-b border-border-subtle py-3 hover:bg-bg-surface/40 transition-colors">
      <span className="font-display text-3xl text-content-disabled tabular-nums leading-none">
        {String(index + 1).padStart(2, '0')}
      </span>

      <select
        aria-label="Tipo de elemento"
        value={element.tipo}
        onChange={e => setTipo(e.target.value as ElementType)}
        className="bg-transparent text-base text-content-primary focus:outline-none cursor-pointer hover:text-ice-300 transition-colors"
      >
        {TIPOS.map(t => <option key={t} value={t} className="bg-bg-base">{TIPO_LABEL[t]}</option>)}
      </select>

      {isJump ? (
        <select
          aria-label="Tipo de salto"
          value={element.tipoSalto ?? 'toeloop'}
          onChange={e => setSubtipo(e.target.value as JumpType)}
          className="bg-transparent text-sm text-content-secondary focus:outline-none cursor-pointer hover:text-ice-300 transition-colors"
        >
          {JUMPS.map(j => <option key={j} value={j} className="bg-bg-base">{j}</option>)}
        </select>
      ) : (
        <span className="text-xs text-content-disabled italic">—</span>
      )}

      {isJump ? (
        <select
          aria-label="Rotaciones"
          value={element.rotaciones ?? 3}
          onChange={e => setRotaciones(Number(e.target.value) as 1|2|3|4)}
          className="bg-transparent text-sm text-content-secondary focus:outline-none cursor-pointer hover:text-ice-300 transition-colors"
        >
          {[1,2,3,4].map(r => <option key={r} value={r} className="bg-bg-base">{r}T</option>)}
        </select>
      ) : (
        <span className="text-xs text-content-disabled tabular-nums">{element.dificultadBase.toFixed(1)}</span>
      )}

      <label className="flex items-baseline gap-1.5 text-xs uppercase tracking-widest text-content-muted cursor-pointer hover:text-ice-300 transition-colors">
        <input
          type="checkbox"
          checked={element.esCombinacion}
          onChange={e => onChange({ esCombinacion: e.target.checked })}
          aria-label="combinación"
          className="accent-ice-500"
        />
        combo
      </label>

      <div className="flex items-baseline gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          aria-label="Mover arriba"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="text-content-secondary hover:text-ice-300 disabled:cursor-not-allowed disabled:text-content-disabled transition-colors"
        >↑</button>
        <button
          type="button"
          aria-label="Mover abajo"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className="text-content-secondary hover:text-ice-300 disabled:cursor-not-allowed disabled:text-content-disabled transition-colors"
        >↓</button>
        <button
          type="button"
          aria-label="Eliminar elemento"
          onClick={onRemove}
          className="text-content-secondary hover:text-danger transition-colors text-lg leading-none"
        >×</button>
      </div>
    </div>
  )
}
