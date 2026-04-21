import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { WeekSchedule, ActivityId } from './types'

interface TrainingState {
  schedules: Record<string, WeekSchedule>  // keyed by skaterId
  setSlot: (skaterId: string, slotIndex: number, activityId: ActivityId | null) => void
  clearSchedule: (skaterId: string) => void
}

const emptySchedule = (skaterId: string): WeekSchedule => ({
  skaterId,
  slots: Array.from({ length: 5 }, (_, i) => ({ index: i, activityId: null })),
})

export const useTrainingStore = create<TrainingState>()(
  devtools(
    (set, get) => ({
      schedules: {},

      setSlot: (skaterId, slotIndex, activityId) => {
        const existing = get().schedules[skaterId] ?? emptySchedule(skaterId)
        const slots = existing.slots.map((s) =>
          s.index === slotIndex ? { ...s, activityId } : s,
        )
        set(
          (state) => ({ schedules: { ...state.schedules, [skaterId]: { ...existing, slots } } }),
          false,
          'training/setSlot',
        )
      },

      clearSchedule: (skaterId) => {
        set(
          (state) => ({ schedules: { ...state.schedules, [skaterId]: emptySchedule(skaterId) } }),
          false,
          'training/clearSchedule',
        )
      },
    }),
    { name: 'glace/training' },
  ),
)
