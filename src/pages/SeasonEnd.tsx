import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'

import { GameState, useGameStore } from '@/stores/gameStore'
import { useTrainingStore, type ActivityId } from '@/features/training'
import { useNarrativeStore } from '@/features/narrative'
import {
  type CompetitionSlot,
  getFasePorSemana,
} from '@/types/season'

const ORDINAL = ['—', '1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '10º']

const ACTIVITY_LABEL: Record<ActivityId, string> = {
  tecnico:  'técnico',
  fisico:   'físico',
  mental:   'mental',
  descanso: 'descanso',
  ensayo:   'ensayo',
  dialogo:  'diálogo',
}

function generateDefaultCalendar(): CompetitionSlot[] {
  return [
    { semana: 8,  nombreCompeticion: 'Copa Otoño',         tipo: 'nacional',       clasificado: true },
    { semana: 14, nombreCompeticion: 'Grand Prix Skate',   tipo: 'grandprix',      clasificado: true },
    { semana: 20, nombreCompeticion: 'Final Grand Prix',   tipo: 'finalGrandprix', clasificado: true },
    { semana: 26, nombreCompeticion: 'Campeonato Mundial', tipo: 'mundial',        clasificado: true },
  ]
}

export function SeasonEnd() {
  const navigate = useNavigate()
  const { skater, season, club } = useGameStore(
    useShallow((s) => ({
      skater: s.currentSkater,
      season: s.currentSeason,
      club:   s.currentClub,
    })),
  )

  const breakdown = useMemo(() => {
    if (!season) return null
    const counts = {} as Record<ActivityId, number>
    let competiciones = 0
    let podios = 0
    for (const w of season.historialSemanas) {
      for (const a of w.ranuraEjecutadas) {
        const id = a as ActivityId
        counts[id] = (counts[id] ?? 0) + 1
      }
      if (w.competicionResultadoId) competiciones += 1
    }
    const medals = { oro: 0, plata: 0, bronce: 0 }
    for (const r of season.resultadosTemporada) {
      if (r.posicion === 1) medals.oro += 1
      else if (r.posicion === 2) medals.plata += 1
      else if (r.posicion === 3) medals.bronce += 1
      if (r.posicion <= 3) podios += 1
    }
    const totalElegidas = Object.values(counts).reduce((a, b) => a + b, 0)
    return { counts, competiciones, podios, medals, totalElegidas }
  }, [season])

  if (!skater || !season || !club || !breakdown) {
    return (
      <div className="flex min-h-screen items-center justify-center glace-vignette">
        <p className="font-display italic text-content-secondary">cerrando temporada…</p>
      </div>
    )
  }

  function startNextSeason(skipDesigner: boolean) {
    const gs = useGameStore.getState()
    const cur = gs.currentSeason!
    const nextSkater = {
      ...gs.currentSkater!,
      age: gs.currentSkater!.age + 1,
      weeklyState: {
        ...gs.currentSkater!.weeklyState,
        // intersession: fatiga y estrés bajan; vínculo decae un poco; semanasEntrenadas reset
        fatigaAcumulada:   Math.max(0, gs.currentSkater!.weeklyState.fatigaAcumulada - 30),
        estres:            Math.max(0, gs.currentSkater!.weeklyState.estres - 20),
        vinculo:           Math.max(0, gs.currentSkater!.weeklyState.vinculo - 5),
        semanasEntrenadas: 0,
      },
    }
    const nextSeason = {
      ...cur,
      semanaActual:        1,
      faseActual:          getFasePorSemana(1),
      temporadaNumero:     cur.temporadaNumero + 1,
      calendario:          generateDefaultCalendar(),
      resultadosTemporada: [],
      historialSemanas:    [],
    }
    gs.setCurrentSkater(nextSkater)
    gs.setCurrentSeason(nextSeason)
    // narrative: clear emitted log so events can re-fire next season
    useNarrativeStore.setState({
      currentEvent: null, lastContext: null,
      emittedEvents: [], lastEmittedBySubtype: {},
    })
    // training: reset weekly schedule for the new skater state
    useTrainingStore.getState().clearSchedule(nextSkater.id)

    if (skipDesigner) {
      gs.changeState(GameState.WEEKLY_PLANNING)
      navigate('/semana', { replace: true })
    } else {
      gs.changeState(GameState.PROGRAM_DESIGNER)
      navigate('/disenador-programa', { replace: true })
    }
  }

  // sort competitions by semana for chronological display
  const competicionesOrdenadas = [...season.resultadosTemporada].sort((a, b) => a.semana - b.semana)

  // top three most-used activities
  const actividadesMasUsadas = (Object.entries(breakdown.counts) as [ActivityId, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <div className="relative min-h-screen glace-vignette glace-grain">
      <div className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-12 gap-x-10 gap-y-8 px-10 py-16">

        {/* topline */}
        <div className="col-span-12 flex items-baseline gap-4">
          <span className="glace-eyebrow">— fin de temporada</span>
          <span className="glace-hairline flex-1" />
          <span className="glace-eyebrow text-content-disabled">
            temporada {String(season.temporadaNumero).padStart(2, '0')}
          </span>
        </div>

        {/* hero */}
        <header className="col-span-12 md:col-span-7 flex flex-col justify-center gap-4">
          <h1 className="glace-reveal-letter font-display font-light text-7xl leading-[0.9] text-content-primary">
            La temporada
            <br />
            <span className="italic text-ice-300">se cierra</span>
          </h1>
          <p className="font-display italic text-xl text-content-secondary max-w-md">
            Lo que llevas de {skater.name} en este punto es la suma de todo lo
            que decidiste cada semana. Lo bueno y lo otro.
          </p>
        </header>

        {/* medals + counters */}
        <aside className="col-span-12 md:col-span-5 flex flex-col gap-6 self-center">
          <div className="grid grid-cols-3 gap-px bg-border-subtle">
            <Tile label="oro"    value={breakdown.medals.oro}    accent="text-gold" />
            <Tile label="plata"  value={breakdown.medals.plata}  accent="text-content-primary" />
            <Tile label="bronce" value={breakdown.medals.bronce} accent="text-frost-400" />
          </div>
          <div className="grid grid-cols-2 gap-px bg-border-subtle">
            <Tile label="competiciones" value={breakdown.competiciones} />
            <Tile label="podios"        value={breakdown.podios} />
          </div>
        </aside>

        {/* competitions */}
        <section className="col-span-12 md:col-span-7 flex flex-col gap-4">
          <div className="flex items-baseline gap-3 border-b border-border-subtle pb-2">
            <span className="glace-eyebrow">— calendario competido</span>
          </div>
          {competicionesOrdenadas.length === 0 ? (
            <p className="font-display italic text-content-muted">No se compitió esta temporada.</p>
          ) : (
            <ul className="flex flex-col">
              {competicionesOrdenadas.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[3.5rem_1fr_auto_auto] items-baseline gap-4 border-b border-border-subtle py-3"
                >
                  <span className="font-display tabular-nums text-2xl text-content-disabled leading-none">
                    s{String(r.semana).padStart(2, '0')}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-display text-xl text-content-primary leading-tight">
                      {r.nombreCompeticion}
                    </span>
                    <span className="font-display italic text-sm text-content-muted">
                      tes {r.tes.toFixed(1)} · pcs {r.pcs.toFixed(1)} · {r.caidas} caída{r.caidas === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span className="font-display tabular-nums text-2xl text-content-primary">
                    {r.total.toFixed(1)}
                  </span>
                  <span className={[
                    'font-display tabular-nums text-2xl tracking-tight',
                    r.posicion === 1 ? 'text-gold' : r.posicion <= 3 ? 'text-frost-400' : 'text-content-secondary',
                  ].join(' ')}>
                    {ORDINAL[r.posicion] ?? `${r.posicion}º`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* skater + economy + activities */}
        <aside className="col-span-12 md:col-span-5 flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <span className="glace-eyebrow">— estado al cerrar</span>
            <StatRow label="vínculo"  value={skater.weeklyState.vinculo} suffix="/100" />
            <StatRow label="fatiga"   value={skater.weeklyState.fatigaAcumulada} suffix="/100" />
            <StatRow label="estrés"   value={skater.weeklyState.estres} suffix="/100" />
            <StatRow label="semanas entrenadas" value={skater.weeklyState.semanasEntrenadas} />
          </div>

          <div className="flex flex-col gap-3">
            <span className="glace-eyebrow">— club</span>
            <StatRow label="presupuesto" value={Math.round(club.presupuestoReservas)} suffix=" €" />
          </div>

          <div className="flex flex-col gap-3">
            <span className="glace-eyebrow">— actividades más usadas</span>
            {actividadesMasUsadas.length === 0 ? (
              <p className="font-display italic text-content-muted">Sin entrenamientos registrados.</p>
            ) : (
              <ul className="flex flex-col">
                {actividadesMasUsadas.map(([id, count]) => (
                  <li key={id} className="flex items-baseline justify-between border-b border-border-subtle/60 py-1.5">
                    <span className="font-display text-base text-content-secondary">{ACTIVITY_LABEL[id]}</span>
                    <span className="font-display tabular-nums text-base text-content-primary">
                      {count}<span className="text-content-disabled"> ranuras</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* actions */}
        <footer className="col-span-12 mt-6 flex items-baseline justify-between border-t border-border-subtle pt-6">
          <p className="font-display italic text-base text-content-muted max-w-md">
            La temporada {season.temporadaNumero + 1} empieza con la patinadora un año mayor,
            algo más recuperada, y los programas pendientes de revisar.
          </p>
          <div className="flex items-baseline gap-8">
            <button
              type="button"
              onClick={() => startNextSeason(true)}
              className="font-display italic text-base text-content-muted hover:text-ice-200 transition-colors"
              title="reutiliza los programas de esta temporada"
            >
              saltar diseñador
            </button>
            <button
              type="button"
              onClick={() => startNextSeason(false)}
              className="group flex items-baseline gap-3 text-content-primary hover:text-ice-200 transition-colors"
            >
              <span className="font-display text-3xl">
                comenzar temporada {String(season.temporadaNumero + 1).padStart(2, '0')}
              </span>
              <span className="text-2xl text-ice-300 transition-transform duration-300 group-hover:translate-x-2">→</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function Tile({
  label, value, accent = 'text-content-primary',
}: {
  label: string
  value: number
  accent?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 bg-bg-deep px-4 py-5">
      <span className={`font-display tabular-nums text-4xl leading-none ${accent}`}>
        {value}
      </span>
      <span className="glace-eyebrow text-content-disabled">{label}</span>
    </div>
  )
}

function StatRow({
  label, value, suffix = '',
}: {
  label: string
  value: number
  suffix?: string
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-border-subtle/60 py-1.5">
      <span className="font-display italic text-base text-content-secondary">{label}</span>
      <span className="font-display tabular-nums text-xl text-content-primary leading-none">
        {Math.round(value).toLocaleString('es-ES')}{suffix}
      </span>
    </div>
  )
}
