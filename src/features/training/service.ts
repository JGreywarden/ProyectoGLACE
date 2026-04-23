import type { Attribute, AttributeKey } from '@/types'
import type { Activity, WeekSchedule } from './types'

const BASE_GAIN = 2
const POTENTIAL_DAMPENING = 0.015  // gain slows as value approaches potential

// calculate attribute gain for one session of an activity
export function calcGain(attr: Attribute, activity: Activity, key: AttributeKey): number {
  if (!activity.targetAttributes.includes(key)) return 0
  const headroom = attr.potential - attr.value
  if (headroom <= 0) return 0
  // gain tapers off as value approaches potential
  return Math.round(BASE_GAIN * (1 - Math.exp(-POTENTIAL_DAMPENING * headroom)))
}

// resolve a full week schedule into a map of attribute gains
export function resolveWeekGains(
  schedule: WeekSchedule,
  attributes: Record<AttributeKey, Attribute>,
  activityMap: Record<string, Activity>,
): Record<AttributeKey, number> {
  const gains = {} as Record<AttributeKey, number>

  for (const slot of schedule.slots) {
    if (!slot.activityId) continue
    const activity = activityMap[slot.activityId]
    if (!activity) continue

    for (const key of activity.targetAttributes) {
      const attr = attributes[key]
      if (!attr) continue
      gains[key] = (gains[key] ?? 0) + calcGain(attr, activity, key)
    }
  }

  return gains
}
