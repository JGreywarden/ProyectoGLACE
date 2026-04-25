import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { GameState, useGameStore } from '@/stores/gameStore'
import { useTrainingStore } from '@/features/training'
import { useNarrativeStore } from '@/features/narrative'
import { useProgramStore } from '@/features/program'
import { getAllTraits, getJudgePanel } from '@/services/dataService'
import { runWeekWithPool } from '@/services/weekService'
import type { WeekContext } from '@/services/weekService'

export function WeekProcessing() {
  const navigate  = useNavigate()
  const fired     = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    const { currentSkater, currentCoach, currentClub, currentSeason } =
      useGameStore.getState()
    if (!currentSkater || !currentCoach || !currentClub || !currentSeason) {
      setError('No hay partida activa. Vuelve al menú principal.')
      return
    }

    const schedule = useTrainingStore.getState().schedules[currentSkater.id]
    if (!schedule) {
      setError('No hay plan semanal. Configura las ranuras antes de avanzar.')
      return
    }

    const { availableEvents, narrativeFlags, emittedEvents } =
      useNarrativeStore.getState()
    const program = useProgramStore
      .getState()
      .getProgram(currentSkater.id, 'libre', currentSeason.temporadaNumero)

    const competitionSlot = currentSeason.calendario.find(
      c => c.semana === currentSeason.semanaActual && c.clasificado,
    )

    ;(async () => {
      try {
        const allTraits = await getAllTraits()
        const allJudges = competitionSlot
          ? await getJudgePanel(
              `${currentSeason.temporadaNumero}-${competitionSlot.nombreCompeticion}`,
            )
          : []

        const ctx: WeekContext = {
          skater: currentSkater,
          coach:  currentCoach,
          club:   currentClub,
          season: currentSeason,
          schedule,
          narrativeContext: {
            skater: currentSkater,
            season: currentSeason,
            narrativeFlags,
            emittedEvents,
          },
          allTraits,
          allJudges,
          program,
        }

        const result = await runWeekWithPool(ctx, availableEvents)

        useGameStore.getState().applyWeekTransition({
          skater: result.skater,
          club:   result.club,
          season: result.season,
        })

        if (result.competitionResult) {
          useGameStore.getState().changeState(GameState.COMPETITION)
          navigate('/competicion', { replace: true })
          return
        }
        if (result.triggeredEvent) {
          useGameStore.getState().changeState(GameState.NARRATIVE_EVENT)
          navigate('/evento', { replace: true })
          return
        }
        useGameStore.getState().changeState(GameState.WEEKLY_PLANNING)
        navigate('/semana', { replace: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(`Error procesando la semana: ${message}`)
      }
    })()
  }, [navigate])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 glace-vignette px-6 text-center">
        <span className="glace-eyebrow text-danger">— procesando semana</span>
        <p className="font-display italic text-2xl text-content-primary max-w-lg">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 glace-vignette glace-grain px-6">
      <span className="glace-eyebrow">— procesando semana</span>
      <h1 className="glace-reveal-letter font-display text-5xl text-content-primary text-center">
        Calculando los efectos del hielo
      </h1>
      <div className="glace-hairline w-32" />
      <p className="font-display italic text-content-secondary">
        atributos · vínculo · fatiga · narrativa
      </p>
    </div>
  )
}
