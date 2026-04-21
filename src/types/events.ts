// event bus contract — every event emitted on `bus` must be declared here
// payload types are the single source of truth for cross-feature communication

export type GlaceEvents = {
  'week:advance':        { week: number; season: number }
  'training:complete':   { skaterId: string; activityId: string; gainMap: Record<string, number> }
  'competition:result':  { skaterId: string; tes: number; pcs: number; total: number }
  'bond:change':         { skaterId: string; delta: number; reason: string }
  'trait:mutate':        { skaterId: string; traitId: string; direction: 'positive' | 'negative' }
  'facility:upgrade':    { facilityId: string; newLevel: 1 | 2 | 3 | 4 }
  'sponsor:signed':      { sponsorId: string; contractWeeks: number }
  'athlete:retire':      { skaterId: string; season: number }
}
