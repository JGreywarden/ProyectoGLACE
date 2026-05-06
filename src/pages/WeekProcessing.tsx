import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { GameState, useGameStore } from '@/stores/gameStore'
import { useTrainingStore } from '@/features/training'
import { useNarrativeStore } from '@/features/narrative'
import { useProgramStore } from '@/features/program'
import { useRivalsStore } from '@/features/rivals'
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

    const { availableEvents, narrativeFlags, emittedEvents, decisionHistory } =
      useNarrativeStore.getState()
    const programLibre = useProgramStore
      .getState()
      .getProgram(currentSkater.id, 'libre', currentSeason.temporadaNumero)
    const programCorto = useProgramStore
      .getState()
      .getProgram(currentSkater.id, 'corto', currentSeason.temporadaNumero)

    const competitionSlot = currentSeason.calendario.find(
      c => c.semana === currentSeason.semanaActual && c.clasificado,
    )

    // ensure a rival pool exists for the current season; regenerated only on
    // first invocation per season so the field stays consistent across events
    const rivalsPool = useRivalsStore
      .getState()
      .ensurePool(currentSeason.temporadaNumero)

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
            decisionHistory,
          },
          allTraits,
          allJudges,
          program:      programLibre,
          programCorto,
          programLibre,
          rivalsPool,
        }

        const result = await runWeekWithPool(ctx, availableEvents)

        useGameStore.getState().applyWeekTransition({
          skater: result.skater,
          club:   result.club,
          season: result.season,
        })
        useGameStore.getState().setLastEconomy(result.economyBreakdown, result.pressureState)
        // persist narrative flags emitted during the week (seeds + economic/injury
        // signals) so future event-condition checks see them — see auditoría B4 (C1)
        useNarrativeStore.getState().mergeWeeklyFlags(result.narrativeFlags)

        // persist the cohesion / vínculo-musical updates on each program so
        // they accumulate week after week (consumed by next week's PCS).
        const programStore = useProgramStore.getState()
        if (result.programaCortoActualizado) {
          programStore.updateConfirmedProgram(result.programaCortoActualizado)
        }
        if (result.programaLibreActualizado) {
          programStore.updateConfirmedProgram(result.programaLibreActualizado)
        }

        if (result.competitionResult) {
          useGameStore.getState().changeState(GameState.COMPETITION)
          navigate('/competicion', { replace: true })
          return
        }
        if (result.triggeredEvent) {
          // commit the externally-selected event so the NarrativeEvent screen
          // finds it on mount (otherwise the player lands on "Sin evento activo")
          useNarrativeStore.getState().commitWeeklyEvent(result.triggeredEvent, {
            skater:         result.skater,
            season:         result.season,
            narrativeFlags: result.narrativeFlags,
            emittedEvents,
            decisionHistory,
          })
          useGameStore.getState().changeState(GameState.NARRATIVE_EVENT)
          navigate('/evento', { replace: true })
          return
        }
        if (result.seasonEndReached) {
          useGameStore.getState().changeState(GameState.SEASON_END)
          navigate('/fin-temporada', { replace: true })
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 glace-vignette px-6 text-center">
        <span className="glace-eyebrow text-danger">— procesando semana</span>
        <p className="font-display italic text-2xl text-content-primary max-w-lg">{error}</p>
        <div className="flex items-baseline gap-6">
          <button
            type="button"
            onClick={() => {
              const gs = useGameStore.getState()
              if (gs.currentSkater && gs.currentSeason) {
                gs.changeState(GameState.WEEKLY_PLANNING)
                navigate('/semana', { replace: true })
              } else {
                // bypass changeState() — there's no legal transition from
                // WEEK_PROCESSING back to MAIN_MENU, but we need to reset to
                // a clean entry point for the player to start over
                useGameStore.setState({
                  currentState: GameState.MAIN_MENU,
                  stateHistory: [GameState.MAIN_MENU],
                })
                navigate('/', { replace: true })
              }
            }}
            className="group flex items-baseline gap-3 text-content-primary hover:text-ice-200"
          >
            <span className="font-display text-2xl">volver</span>
            <span className="transition-transform group-hover:translate-x-2">→</span>
          </button>
        </div>
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
