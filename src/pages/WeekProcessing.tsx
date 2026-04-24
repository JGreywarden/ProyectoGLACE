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
    // StrictMode mounts effects twice in dev; guard against a double run
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

        // WEEK_PROCESSING only transitions to WEEKLY_PLANNING | NARRATIVE_EVENT |
        // COMPETITION. End-of-season handling lives in WeeklyPlanning, which can
        // dispatch to SEASON_END when it detects the condition.
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xs uppercase tracking-widest text-content-muted">procesando semana</p>
        <h1 className="text-2xl text-content-primary">{error}</h1>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <p className="text-xs uppercase tracking-widest text-content-muted">procesando semana</p>
      <h1 className="text-3xl text-content-primary">Calculando efectos…</h1>
    </div>
  )
}
