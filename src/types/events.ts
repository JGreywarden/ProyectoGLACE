// event bus contract — every event emitted on `bus` must be declared here
// payload types are the single source of truth for cross-feature communication

import type { TraitLayer } from './skater'

export type GlaceEvents = {
  week_confirmed:             { week: number; season: number }
  week_processed:             { week: number; skaterId: string; gainMap: Record<string, number> }
  bond_changed:               { skaterId: string; delta: number; reason: string; newValue: number }
  attribute_changed:          { skaterId: string; attribute: string; delta: number; newValue: number }
  trait_revealed:             { skaterId: string; traitId: string; layer: TraitLayer }
  trait_mutated:              { skaterId: string; traitId: string; direction: 'positive' | 'negative' }
  skater_injured:             { skaterId: string; injuryType: string; recoveryWeeks: number }
  narrative_event_triggered:  { eventId: string; type: string }
  competition_result:         { skaterId: string; competitionId: string; tes: number; pcs: number; total: number; placement: number }
  financial_pressure_changed: { level: 0 | 1 | 2 | 3; budget: number }
  installation_upgraded:      { facilityId: string; newLevel: 1 | 2 | 3 | 4 }
  season_ended:               { season: number }
}
