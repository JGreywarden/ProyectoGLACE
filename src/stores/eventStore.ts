import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { bus } from '@/lib/events'
import type { GlaceEvents } from '@/types/events'

type EventKey = keyof GlaceEvents

interface EventStoreState {
  emissionCount: Partial<Record<EventKey, number>>
  debugEvents:   boolean
  emit:        <K extends EventKey>(event: K, payload: GlaceEvents[K]) => void
  on:          <K extends EventKey>(event: K, handler: (payload: GlaceEvents[K]) => void) => () => void
  off:         <K extends EventKey>(event: K, handler: (payload: GlaceEvents[K]) => void) => void
  toggleDebug: () => void
  resetCount:  () => void
}

export const useEventStore = create<EventStoreState>()(
  devtools(
    (set, get) => ({
      emissionCount: {},
      debugEvents:   false,

      emit: (event, payload) => {
        const { debugEvents, emissionCount } = get()
        if (debugEvents) {
          console.log(`[${new Date().toISOString()}] ${event}`, payload)
        }
        bus.emit(event, payload)
        // emissionCount is a dev-only aid; writing on every emit in prod churns
        // references for any subscriber (re-renders, devtools noise) with no benefit
        if (debugEvents) {
          set(
            { emissionCount: { ...emissionCount, [event]: (emissionCount[event] ?? 0) + 1 } },
            false,
            `events/emit:${event}`,
          )
        }
      },

      on: (event, handler) => {
        bus.on(event, handler)
        return () => bus.off(event, handler)
      },

      off: (event, handler) => bus.off(event, handler),

      toggleDebug: () =>
        set((s) => ({ debugEvents: !s.debugEvents }), false, 'events/toggleDebug'),

      resetCount: () =>
        set({ emissionCount: {} }, false, 'events/resetCount'),
    }),
    { name: 'glace/events' },
  ),
)
