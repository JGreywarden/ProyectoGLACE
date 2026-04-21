// core domain types — expand in features/*/types.ts, import shared primitives from here

// ─── primitives ───────────────────────────────────────────────────────────────

export type SkillCategory = 'technical' | 'psychological' | 'physical'

export interface Attribute {
  value: number      // 0–100 current value
  potential: number  // 0–100 genetic ceiling
  category: SkillCategory
}

export type AttributeKey =
  | 'jump'         // technical
  | 'spin'         // technical
  | 'steps'        // technical
  | 'artistry'     // technical
  | 'mentalStrength'  // psychological
  | 'focus'           // psychological
  | 'resilience'      // psychological
  | 'stamina'      // physical
  | 'flexibility'  // physical
  | 'speed'        // physical

// ─── entities ─────────────────────────────────────────────────────────────────

export interface Skater {
  id: string
  name: string
  age: number
  nationality: string
  attributes: Record<AttributeKey, Attribute>
  traitIds: string[]
  bond: number       // 0–100 coach-skater bond
  retiredAt: number | null  // season number, null if active
}

export interface Trait {
  id: string
  name: string
  description: string
  category: SkillCategory
  effect: TraitEffect
  canMutate: boolean
}

export interface TraitEffect {
  attributeKey: AttributeKey
  multiplier: number  // e.g. 1.15 for +15%
}

// ─── game clock ───────────────────────────────────────────────────────────────

export type SeasonPhase = 'preseason' | 'season' | 'postseason'

export interface GameClock {
  week: number    // 1–30
  season: number  // 1+
  phase: SeasonPhase
}

// ─── skater domain ────────────────────────────────────────────────────────────

export * from './skater'
