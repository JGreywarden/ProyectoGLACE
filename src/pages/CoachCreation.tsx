import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { GameState, useGameStore } from '@/stores/gameStore'
import { DEFAULT_SKATER_DATA } from '@/types/skater'
import { DEFAULT_COACH_DATA } from '@/types/coach'
import { DEFAULT_CLUB_DATA } from '@/types/club'
import { DEFAULT_SEASON_DATA, type CompetitionSlot, getFasePorSemana } from '@/types/season'
import { useNarrativeStore } from '@/features/narrative'

function generateDefaultCalendar(): CompetitionSlot[] {
  return [
    { semana: 8,  nombreCompeticion: 'Copa Otoño',         tipo: 'nacional',       clasificado: true },
    { semana: 14, nombreCompeticion: 'Grand Prix Skate',   tipo: 'grandprix',      clasificado: true },
    { semana: 20, nombreCompeticion: 'Final Grand Prix',   tipo: 'finalGrandprix', clasificado: true },
    { semana: 26, nombreCompeticion: 'Campeonato Mundial', tipo: 'mundial',        clasificado: true },
  ]
}

export function CoachCreation() {
  const navigate = useNavigate()
  const [coachName,  setCoachName]  = useState('')
  const [skaterName, setSkaterName] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleStart() {
    if (!coachName.trim() || !skaterName.trim()) {
      setError('Necesito un nombre para el entrenador y otro para la patinadora.')
      return
    }
    const skaterId = `sk_${Date.now()}`
    const coachId  = `co_${Date.now()}`
    const clubId   = `cl_${Date.now()}`

    const skater = {
      ...DEFAULT_SKATER_DATA,
      id: skaterId, name: skaterName.trim(),
      technical:     { ...DEFAULT_SKATER_DATA.technical },
      psychological: { ...DEFAULT_SKATER_DATA.psychological },
      physical:      { ...DEFAULT_SKATER_DATA.physical },
      weeklyState:   { ...DEFAULT_SKATER_DATA.weeklyState },
      traits: [],
    }
    const coach = {
      ...DEFAULT_COACH_DATA,
      id: coachId, name: coachName.trim(),
      perfilInferido:   { ...DEFAULT_COACH_DATA.perfilInferido },
      legadoTotal:      { ...DEFAULT_COACH_DATA.legadoTotal, medallas: [], eventosDefinitorios: [] },
      reputacion:       { ...DEFAULT_COACH_DATA.reputacion },
      arbolHabilidades: {},
    }
    const club = {
      ...DEFAULT_CLUB_DATA,
      id: clubId, nombre: 'Club fundacional',
      instalaciones: DEFAULT_CLUB_DATA.instalaciones.map(i => ({ ...i })),
      sponsors:      [],
      reputacion:    { ...DEFAULT_CLUB_DATA.reputacion },
    }
    const season = {
      ...DEFAULT_SEASON_DATA,
      semanaActual: 1, faseActual: getFasePorSemana(1), temporadaNumero: 1,
      calendario: generateDefaultCalendar(),
      resultadosTemporada: [], historialSemanas: [],
    }

    const gs = useGameStore.getState()
    gs.setCurrentCoach(coach)
    gs.setCurrentSkater(skater)
    gs.setCurrentClub(club)
    gs.setCurrentSeason(season)
    void useNarrativeStore.getState().loadPool()

    gs.changeState(GameState.PROGRAM_DESIGNER)
    navigate('/disenador-programa', { replace: true })
  }

  return (
    <div className="relative min-h-screen glace-vignette glace-grain">
      <div className="relative mx-auto grid min-h-screen max-w-5xl grid-cols-12 gap-8 px-10 py-16">

        <div className="col-span-12 flex items-baseline gap-4">
          <span className="glace-eyebrow">— acto I</span>
          <span className="glace-hairline flex-1" />
          <span className="glace-eyebrow text-content-disabled">primeros 40 minutos</span>
        </div>

        {/* asymmetric: title spans 7 cols, form spans 5 — title sits a bit higher */}
        <div className="col-span-12 md:col-span-7 flex flex-col justify-center gap-6">
          <h1 className="glace-reveal-letter font-display font-light text-7xl leading-[0.9] text-content-primary">
            Antes de
            <br />
            <span className="italic text-ice-300">tener un patinador,</span>
            <br />
            tienes un nombre.
          </h1>
          <p className="glace-reveal glace-stagger-3 font-display italic text-xl leading-relaxed text-content-secondary max-w-md">
            Lo que decidas en estos minutos quedará escrito en cada decisión que
            tomes durante las próximas treinta semanas. No hay neutralidad.
          </p>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); handleStart() }}
          className="col-span-12 md:col-span-5 flex flex-col justify-center gap-8"
        >
          <Field
            label="entrenador"
            value={coachName}
            onChange={setCoachName}
            placeholder="tu nombre"
            autoFocus
            stagger={4}
          />
          <Field
            label="patinadora fundacional"
            value={skaterName}
            onChange={setSkaterName}
            placeholder="quien estará bajo tu mirada"
            stagger={5}
          />

          {error && (
            <p className="glace-eyebrow text-danger">— {error}</p>
          )}

          <button
            type="submit"
            className="group glace-reveal glace-stagger-6 mt-4 flex items-baseline gap-3 self-start text-left"
          >
            <span className="font-display text-3xl text-content-primary group-hover:text-ice-200 transition-colors">
              comenzar la primera temporada
            </span>
            <span className="text-2xl text-ice-300 transition-transform duration-300 group-hover:translate-x-2">→</span>
          </button>
        </form>

      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, autoFocus, stagger,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  stagger: number
}) {
  return (
    <label className={`glace-reveal glace-stagger-${stagger} flex flex-col gap-2`}>
      <span className="glace-eyebrow">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="border-b border-border bg-transparent pb-2 font-display text-3xl text-content-primary placeholder:italic placeholder:text-content-disabled focus:border-ice-300 focus:outline-none transition-colors"
      />
    </label>
  )
}
