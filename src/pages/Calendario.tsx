import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'

import { useGameStore } from '@/stores/gameStore'
import { SeasonCell } from '@/components/ui'
import { getFasePorSemana, type FaseSeason } from '@/types/season'

const FASE_GROUPS: Array<{ fase: FaseSeason; range: [number, number]; label: string }> = [
  { fase: 'Construccion', range: [1, 8],   label: 'construcción' },
  { fase: 'Activacion',   range: [9, 14],  label: 'activación' },
  { fase: 'Pico',         range: [15, 22], label: 'pico' },
  { fase: 'Rearme',       range: [23, 26], label: 'rearme' },
  { fase: 'Cierre',       range: [27, 30], label: 'cierre' },
]

export function Calendario() {
  const navigate = useNavigate()
  const { season } = useGameStore(useShallow(s => ({ season: s.currentSeason })))

  if (!season) {
    return (
      <div className="flex min-h-screen items-center justify-center glace-vignette">
        <p className="font-display italic text-content-secondary">No hay temporada activa.</p>
      </div>
    )
  }

  const competitionWeeks = new Set(season.calendario.filter(c => c.clasificado).map(c => c.semana))
  const eventWeeks = new Set(
    season.historialSemanas.filter(w => w.eventoNarrativoId).map(w => w.semana),
  )

  return (
    <div className="relative min-h-screen glace-vignette glace-grain">
      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-12 gap-x-8 gap-y-10 px-10 pt-10 pb-16">

        <div className="col-span-12 flex items-baseline gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="glace-eyebrow text-content-secondary hover:text-ice-300 transition-colors"
          >
            ← volver
          </button>
          <span className="glace-hairline flex-1" />
          <span className="glace-eyebrow text-content-disabled">— calendario isu</span>
        </div>

        {/* HERO */}
        <header className="col-span-12 md:col-span-9 flex flex-col gap-2">
          <span className="glace-eyebrow">— treinta semanas</span>
          <h1 className="glace-reveal-letter font-display text-7xl leading-[0.9] text-content-primary">
            Temporada <span className="italic text-ice-300">{String(season.temporadaNumero).padStart(2, '0')}</span>
          </h1>
          <p className="font-display italic text-lg text-content-secondary">
            actualmente en la semana {season.semanaActual} ·{' '}
            {FASE_GROUPS.find(g => g.fase === season.faseActual)?.label}
          </p>
        </header>

        {/* legend */}
        <aside className="col-span-12 md:col-span-3 flex flex-col gap-2 border-l border-border-subtle pl-6 pt-2">
          <span className="glace-eyebrow">— leyenda</span>
          <Legend dot="bg-gold" label="competición" />
          <Legend dot="bg-semantic-human" label="evento" />
          <Legend dot="bg-ice-300" label="semana actual" />
        </aside>

        {/* phases as horizontal blocks — each phase shows its weeks underneath */}
        <section className="col-span-12 flex flex-col gap-8">
          {FASE_GROUPS.map((g, idx) => {
            const weeks = Array.from(
              { length: g.range[1] - g.range[0] + 1 },
              (_, i) => g.range[0] + i,
            )
            return (
              <div key={g.fase} className={`glace-reveal glace-stagger-${Math.min(idx + 1, 6)} flex flex-col gap-3`}>
                <div className="flex items-baseline justify-between border-b border-border-subtle pb-2">
                  <div className="flex items-baseline gap-4">
                    <span className="font-display text-3xl text-content-secondary italic leading-none">
                      {g.label}
                    </span>
                    <span className="glace-eyebrow text-content-disabled">
                      semanas {String(g.range[0]).padStart(2, '0')} – {String(g.range[1]).padStart(2, '0')}
                    </span>
                  </div>
                  <span className="glace-eyebrow text-content-disabled">
                    {weeks.length} sem
                  </span>
                </div>

                <div className="grid grid-cols-8 gap-px bg-border-subtle">
                  {weeks.map(semana => {
                    const compName = season.calendario
                      .find(c => c.semana === semana && c.clasificado)?.nombreCompeticion
                    return (
                      <SeasonCell
                        key={semana}
                        semana={semana}
                        fase={getFasePorSemana(semana)}
                        hasCompetition={competitionWeeks.has(semana)}
                        hasEvent={eventWeeks.has(semana)}
                        isCurrent={semana === season.semanaActual}
                        tooltip={compName ? `Semana ${semana} — ${compName}` : `Semana ${semana} — ${g.label}`}
                      />
                    )
                  })}
                </div>

                {/* competition titles within this phase */}
                {season.calendario
                  .filter(c => c.semana >= g.range[0] && c.semana <= g.range[1])
                  .map(c => (
                    <p key={c.nombreCompeticion} className="text-xs text-content-muted">
                      <span className="font-display tabular-nums text-content-secondary mr-2">
                        sem {String(c.semana).padStart(2, '0')}
                      </span>
                      <span className="font-display italic">{c.nombreCompeticion}</span>
                    </p>
                  ))}
              </div>
            )
          })}
        </section>

      </div>
    </div>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2 text-xs text-content-secondary">
      <span className={`h-1 w-1 rounded-full ${dot}`} />
      <span className="uppercase tracking-[0.2em]">{label}</span>
    </span>
  )
}
