import { describe, it, expect } from 'vitest'
import { calcGain, resolveWeekGains } from './service'
import type { Activity, WeekSchedule } from './types'
import type { Attribute, AttributeKey } from '@/types'

// smoke tests — validates vitest wiring + public surface of training service.
// full per-formula coverage lands with Fase 1 progression curves.

function attr(value: number, potential: number): Attribute {
  return { value, potential, category: 'technical' }
}

const jumpsActivity: Activity = {
  id:               'technical',
  label:            'Técnico',
  targetAttributes: ['jump'],
  bondDelta:        0,
  energyCost:       60,
}

describe('calcGain', () => {
  it('returns 0 when the skater is at potential', () => {
    expect(calcGain(attr(80, 80), jumpsActivity, 'jump')).toBe(0)
  })

  it('returns 0 when the activity does not target this attribute', () => {
    const offTarget: Activity = { ...jumpsActivity, targetAttributes: ['spin'] }
    expect(calcGain(attr(40, 80), offTarget, 'jump')).toBe(0)
  })
})

describe('resolveWeekGains', () => {
  it('aggregates gains across the 5 weekly slots', () => {
    const schedule: WeekSchedule = {
      skaterId: 's1',
      slots: [
        { index: 0, activityId: 'technical' },
        { index: 1, activityId: 'technical' },
        { index: 2, activityId: null },
        { index: 3, activityId: null },
        { index: 4, activityId: null },
      ],
    }
    const attributes = { jump: attr(40, 80) } as Record<AttributeKey, Attribute>
    const activityMap = { technical: jumpsActivity }

    const gains = resolveWeekGains(schedule, attributes, activityMap)

    expect(gains.jump).toBeGreaterThan(0)
  })

  it('returns an empty object when no slots have activities', () => {
    const schedule: WeekSchedule = {
      skaterId: 's1',
      slots: [0, 1, 2, 3, 4].map(i => ({ index: i, activityId: null })),
    }
    const attributes = {} as Record<AttributeKey, Attribute>
    const gains = resolveWeekGains(schedule, attributes, {})
    expect(Object.keys(gains)).toHaveLength(0)
  })
})
