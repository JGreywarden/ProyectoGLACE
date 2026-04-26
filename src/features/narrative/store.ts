import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type {
  EventOutcome,
  MomentOutcome,
  MomentoTrigger,
  NarrativeContext,
  NarrativeEvent,
  NarrativeEventType,
} from './types'
import {
  applyEventEffect,
  applyMomentEffect,
  loadEvents,
  selectCompetitionMoment,
  selectWeeklyEvent,
} from './service'

interface NarrativeState {
  availableEvents:      NarrativeEvent[]
  currentEvent:         NarrativeEvent | null
  /** context captured on triggerEvent/triggerMoment — reused by resolveChoice */
  lastContext:          NarrativeContext | null
  narrativeFlags:       Record<string, boolean | number | string>
  emittedEvents:        string[]
  lastEmittedBySubtype: Partial<Record<NarrativeEventType, number>>

  loadPool:      () => Promise<void>
  triggerEvent:  (ctx: NarrativeContext, rng?: () => number) => NarrativeEvent | null
  /** publishes an externally-selected event into the store (used by the week orchestrator,
   *  which selects events through runWeekWithPool but cannot mutate this store directly) */
  commitWeeklyEvent: (event: NarrativeEvent, ctx: NarrativeContext) => void
  triggerMoment: (trigger: MomentoTrigger, ctx: NarrativeContext, rng?: () => number) => NarrativeEvent | null
  resolveChoice: (optionId: string, rng?: () => number) => EventOutcome | MomentOutcome | null
  resetEvent:    () => void
}

export const useNarrativeStore = create<NarrativeState>()(
  devtools(
    (set, get) => ({
      availableEvents:      [],
      currentEvent:         null,
      lastContext:          null,
      narrativeFlags:       {},
      emittedEvents:        [],
      lastEmittedBySubtype: {},

      loadPool: async () => {
        if (get().availableEvents.length > 0) return
        const events = await loadEvents()
        set({ availableEvents: events }, false, 'narrative/loadPool')
      },

      triggerEvent: (ctx, rng = Math.random) => {
        const { availableEvents, lastEmittedBySubtype } = get()
        const event = selectWeeklyEvent(availableEvents, ctx, rng, {
          currentWeek: ctx.season.semanaActual,
          lastEmittedBySubtype,
        })
        if (!event) return null
        set(
          {
            currentEvent:         event,
            lastContext:          ctx,
            emittedEvents:        [...get().emittedEvents, event.id],
            lastEmittedBySubtype: {
              ...lastEmittedBySubtype,
              [event.tipo]: ctx.season.semanaActual,
            },
          },
          false,
          'narrative/triggerEvent',
        )
        return event
      },

      commitWeeklyEvent: (event, ctx) => {
        const { lastEmittedBySubtype, emittedEvents } = get()
        set(
          {
            currentEvent:         event,
            lastContext:          ctx,
            emittedEvents:        [...emittedEvents, event.id],
            lastEmittedBySubtype: {
              ...lastEmittedBySubtype,
              [event.tipo]: ctx.season.semanaActual,
            },
          },
          false,
          'narrative/commitWeeklyEvent',
        )
      },

      triggerMoment: (trigger, ctx, rng = Math.random) => {
        const event = selectCompetitionMoment(get().availableEvents, trigger, ctx, rng)
        if (!event) return null
        set(
          { currentEvent: event, lastContext: ctx },
          false,
          'narrative/triggerMoment',
        )
        return event
      },

      resolveChoice: (optionId, rng = Math.random) => {
        const { currentEvent, lastContext } = get()
        if (!currentEvent) return null

        if (currentEvent.tipo === 'momento_competicion') {
          const outcome = applyMomentEffect(currentEvent, optionId)
          set(
            {
              narrativeFlags: { ...get().narrativeFlags, ...outcome.flagsPatch },
              currentEvent:   null,
              lastContext:    null,
            },
            false,
            'narrative/resolveMoment',
          )
          return outcome
        }

        if (!lastContext) return null
        const outcome = applyEventEffect(lastContext, currentEvent, optionId, rng)
        set(
          {
            narrativeFlags: { ...get().narrativeFlags, ...outcome.flagsPatch },
            currentEvent:   null,
            lastContext:    null,
          },
          false,
          'narrative/resolveEvent',
        )
        return outcome
      },

      resetEvent: () => {
        set({ currentEvent: null, lastContext: null }, false, 'narrative/resetEvent')
      },
    }),
    { name: 'glace/narrative' },
  ),
)
