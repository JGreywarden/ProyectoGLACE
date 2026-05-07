// pauta de cleanup del bus mitt: cuando aterricen consumidores reales del bus
// en una feature, este test sirve como precedente del patrón "subscribe →
// devolver off". si un futuro listener añade `bus.on(...)` sin cleanup, este
// archivo describe la forma correcta y el test lo verifica para el wrapper de
// useEventStore (la API pública usada desde componentes).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEventStore } from './eventStore'
import { bus } from '@/lib/events'

beforeEach(() => {
  // mitt no expone "all listeners removed", así que limpiamos a mano por
  // evento conocido. con 12 eventos esto es asumible.
  bus.all.clear()
})

describe('useEventStore.on cleanup contract', () => {
  it('returns a function that detaches the handler from the bus', () => {
    const handler = vi.fn()
    const off = useEventStore.getState().on('week_confirmed', handler)

    bus.emit('week_confirmed', { week: 1, season: 1 })
    expect(handler).toHaveBeenCalledTimes(1)

    off()
    bus.emit('week_confirmed', { week: 2, season: 1 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('is safe to call cleanup more than once', () => {
    const handler = vi.fn()
    const off = useEventStore.getState().on('bond_changed', handler)
    off()
    expect(() => off()).not.toThrow()
    bus.emit('bond_changed', { skaterId: 's1', delta: 1, reason: 'test', newValue: 50 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('multiple subscribers can detach independently', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = useEventStore.getState().on('competition_result', a)
    useEventStore.getState().on('competition_result', b)

    offA()
    bus.emit('competition_result', {
      skaterId: 's1', competitionId: 'c1', tes: 50, pcs: 50, total: 100, placement: 1,
    })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })
})
