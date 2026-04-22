import { describe, it, expect, beforeEach } from 'vitest'
import { safeStorage } from './safeStorage'

// jsdom provides a functional localStorage, so `available` is true here.
// full unavailable-storage coverage requires module reload under a mocked
// window.localStorage — covered indirectly by the saveService tests.

describe('safeStorage (jsdom: storage available)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('reports available when localStorage works', () => {
    expect(safeStorage.available).toBe(true)
  })

  it('round-trips get/set', () => {
    const ok = safeStorage.set('k', 'v')
    expect(ok).toBe(true)
    expect(safeStorage.get('k')).toBe('v')
  })

  it('returns null for missing key', () => {
    expect(safeStorage.get('missing')).toBeNull()
  })

  it('remove deletes the key silently', () => {
    safeStorage.set('k', 'v')
    safeStorage.remove('k')
    expect(safeStorage.get('k')).toBeNull()
  })
})
