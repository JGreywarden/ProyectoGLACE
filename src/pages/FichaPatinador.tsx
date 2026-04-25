import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'

import { useGameStore } from '@/stores/gameStore'
import { computeTraitVisibilityLayer } from '@/features/athlete'
import { TRAITS_BY_ID, type SkaterTrait, TraitLayer } from '@/types/skater'
import { AttributeRow, BondMeter } from '@/components/ui'
import { getAllTraits, type TraitData } from '@/services/dataService'

const PSYCHO_LAYER = {
  confianza:            20,
  resistenciaMental:    40,
  presionCompetitiva:   55,
  motivacionIntrinseca: 65,
  autoexigencia:        -1,
} as const

const PSYCHO_LABEL = {
  confianza:            'Confianza',
  resistenciaMental:    'Resistencia mental',
  presionCompetitiva:   'Presión competitiva',
  motivacionIntrinseca: 'Motivación intrínseca',
  autoexigencia:        'Autoexigencia',
} as const

export function FichaPatinador() {
  const navigate = useNavigate()
  const { skater } = useGameStore(useShallow(s => ({ skater: s.currentSkater })))
  const [allTraits, setAllTraits] = useState<TraitData[]>([])

  useEffect(() => {
    getAllTraits().then(setAllTraits).catch(() => setAllTraits([]))
  }, [])

  if (!skater) {
    return (
      <div className="flex min-h-screen items-center justify-center glace-vignette">
        <p className="font-display italic text-content-secondary">No hay patinador activo.</p>
      </div>
    )
  }

  const layer = computeTraitVisibilityLayer(skater.weeklyState.vinculo)

  return (
    <div className="relative min-h-screen glace-vignette glace-grain">
      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-12 gap-x-8 gap-y-12 px-10 pt-10 pb-20">

        {/* eyebrow + back */}
        <div className="col-span-12 flex items-baseline gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="glace-eyebrow text-content-secondary hover:text-ice-300 transition-colors"
          >
            ← volver
          </button>
          <span className="glace-hairline flex-1" />
          <span className="glace-eyebrow text-content-disabled">— ficha</span>
        </div>

        {/* HERO — name takes 8 cols, vitals 4 */}
        <header className="col-span-12 md:col-span-8 flex flex-col gap-4">
          <span className="glace-eyebrow">— patinadora bajo tu mirada</span>
          <h1 className="glace-reveal-letter font-display font-light text-8xl leading-[0.9] text-content-primary">
            {skater.name}
          </h1>
          <p className="font-display italic text-xl text-content-secondary">
            {skater.age} años · {skater.nationality} ·{' '}
            <span className="text-content-muted">
              {skater.weeklyState.semanasEntrenadas} semanas a tu cargo
            </span>
          </p>
        </header>

        <aside className="col-span-12 md:col-span-4 flex flex-col gap-6 border-l border-border-subtle pl-6 pt-4">
          <BondMeter value={skater.weeklyState.vinculo} />
          <div className="flex flex-col gap-1">
            <span className="glace-eyebrow">— capa visible de rasgos</span>
            <span className="font-display text-4xl text-content-primary">
              {layer} <span className="text-content-disabled">/ 3</span>
            </span>
          </div>
        </aside>

        {/* SECTION: técnicos — 7 cols */}
        <section className="col-span-12 md:col-span-7 flex flex-col gap-4 glace-reveal glace-stagger-1">
          <SectionHead label="atributos técnicos" sub="visibles desde el primer entrenamiento" />
          <AttributeRow label="Saltos"             value={skater.technical.saltos}           visible accent="technical" />
          <AttributeRow label="Giros"              value={skater.technical.giros}            visible accent="technical" />
          <AttributeRow label="Secuencia de pasos" value={skater.technical.secuenciaDePasos} visible accent="technical" />
          <AttributeRow label="Amplitud / línea"   value={skater.technical.amplitudLinea}    visible accent="technical" />
        </section>

        {/* SECTION: estado — 5 cols, sits beside técnicos */}
        <section className="col-span-12 md:col-span-5 flex flex-col gap-4 glace-reveal glace-stagger-2">
          <SectionHead label="estado semanal" sub="cambia cada lunes" />
          <AttributeRow label="Fatiga acumulada" value={skater.weeklyState.fatigaAcumulada} visible />
          <AttributeRow label="Estrés"           value={skater.weeklyState.estres}           visible accent="human" />
          {skater.weeklyState.currentInjury && (
            <p className="border-l-2 border-l-danger pl-3 py-1 mt-2 font-display italic text-sm text-danger">
              lesión activa · {skater.weeklyState.currentInjury.recoveryWeeksRemaining} sem restantes
            </p>
          )}
        </section>

        {/* SECTION: psicológicos — full width */}
        <section className="col-span-12 flex flex-col gap-4 glace-reveal glace-stagger-3">
          <SectionHead
            label="atributos psicológicos"
            sub="se revelan a medida que se construye el vínculo"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
            {(Object.keys(PSYCHO_LABEL) as Array<keyof typeof PSYCHO_LABEL>).map(key => {
              const threshold = PSYCHO_LAYER[key]
              const visible = threshold >= 0 && skater.weeklyState.vinculo >= threshold
              const min = key === 'presionCompetitiva' ? -100 : 0
              return (
                <AttributeRow
                  key={key}
                  label={PSYCHO_LABEL[key]}
                  value={skater.psychological[key]}
                  visible={visible}
                  min={min}
                  accent="bond"
                />
              )
            })}
          </div>
        </section>

        {/* SECTION: rasgos */}
        <section className="col-span-12 flex flex-col gap-4 glace-reveal glace-stagger-4">
          <SectionHead label="rasgos" sub="capa de visibilidad determinada por el vínculo" />
          <TraitsSection
            traits={skater.traits}
            allTraits={allTraits}
            visibleLayer={layer}
          />
        </section>

      </div>
    </div>
  )
}

function SectionHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border-subtle pb-2 mb-2">
      <span className="glace-eyebrow">— {label}</span>
      {sub && <span className="font-display italic text-sm text-content-muted">{sub}</span>}
    </div>
  )
}

function TraitsSection({
  traits, allTraits, visibleLayer,
}: {
  traits: SkaterTrait[]
  allTraits: TraitData[]
  visibleLayer: number
}) {
  if (traits.length === 0) {
    return (
      <p className="border-l-2 border-l-border-subtle pl-4 font-display italic text-content-muted">
        aún no hay rasgos en su carta. los primeros aparecerán tras la primera competición o
        tras una conversación honesta.
      </p>
    )
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
      {traits.map(t => {
        const def = TRAITS_BY_ID[t.id]
        const meta = allTraits.find(a => a.id === t.id)
        const layerNum = layerEnumToNum(def?.layer)
        const revealed = layerNum <= visibleLayer
        return (
          <li
            key={t.id}
            className={[
              'border-b border-border-subtle/60 py-3',
              revealed ? '' : 'opacity-50',
            ].join(' ')}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-2xl leading-tight text-content-primary">
                {revealed ? (def?.name ?? t.id) : '· · ·'}
              </span>
              {t.mutated && (
                <span className="glace-eyebrow text-semantic-human">mutación · {t.mutated}</span>
              )}
            </div>
            {revealed && meta && (
              <p className="mt-1 font-display italic text-sm text-content-secondary leading-snug">
                {meta.descripcion}
              </p>
            )}
            {!revealed && (
              <p className="mt-1 font-display italic text-xs text-content-disabled">
                requiere vínculo {layerNum === 1 ? '20' : layerNum === 2 ? '40' : '65'}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function layerEnumToNum(layer: TraitLayer | undefined): number {
  if (layer === undefined) return 0
  return layer
}
