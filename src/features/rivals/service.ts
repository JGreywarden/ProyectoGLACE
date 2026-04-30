// rivals service — generation, simulation and progression.
// pure: rng injectable, no React, no Zustand.

import type { CompetitionType } from '@/types/season'
import {
  COMPETITION_FIELD_SIZE,
  COMPETITION_TIER_MIN_RIVAL,
  type RivalCompetitionScore,
  type RivalProgramScore,
  type RivalSkater,
  type RivalTier,
  type RivalsPool,
} from './types'

// ─── distribution constants ───────────────────────────────────────────────────

/** how the 50-rival pool splits across tiers (sum = 50) */
const TIER_DISTRIBUTION: Readonly<Record<RivalTier, number>> = {
  5: 5,   // global elite — Worlds podium contenders
  4: 10,  // top international — GP regulars
  3: 14,  // strong nationals + challengers
  2: 13,  // decent nationals
  1: 8,   // local circuit
} as const

/** mean and sigma per tier for the technical attributes (clamped 0–100) */
const TIER_TECHNICAL_MEAN: Readonly<Record<RivalTier, number>> = {
  5: 88, 4: 80, 3: 70, 2: 60, 1: 50,
}
const TIER_TECHNICAL_SIGMA = 6

/** rough total ISU base value for a competitive program at each tier */
const TIER_DIFFICULTY_BUDGET: Readonly<Record<RivalTier, { corto: number; libre: number }>> = {
  5: { corto: 45, libre: 78 },
  4: { corto: 41, libre: 70 },
  3: { corto: 36, libre: 60 },
  2: { corto: 30, libre: 50 },
  1: { corto: 24, libre: 40 },
}

// ─── name & nationality pools (small, evocative, license-safe) ───────────────

const NATIONALITIES: readonly string[] = [
  'JPN', 'USA', 'KOR', 'RUS', 'CAN', 'FRA', 'ITA', 'ESP', 'GER', 'CHN',
  'SUI', 'FIN', 'SWE', 'BEL', 'NED', 'GBR', 'POL', 'CZE', 'EST', 'KAZ',
] as const

const FIRST_NAMES: readonly string[] = [
  'Hana', 'Yuki', 'Aiko', 'Mei', 'Sora', 'Riko', 'Kana', 'Saya',
  'Emma', 'Olivia', 'Mia', 'Ella', 'Ava', 'Lily', 'Chloe', 'Zoe',
  'Yuna', 'Mina', 'Nara', 'Soo',
  'Anna', 'Maria', 'Sofia', 'Lucia', 'Elena', 'Clara', 'Iris', 'Linnea',
  'Camille', 'Léa', 'Chiara', 'Greta', 'Ingrid', 'Saskia',
]

const LAST_NAMES: readonly string[] = [
  'Ito', 'Sato', 'Suzuki', 'Watanabe', 'Tanaka', 'Yamamoto', 'Hayashi',
  'Kim', 'Park', 'Lee', 'Choi',
  'Petrov', 'Volkov', 'Sokolova', 'Mironova',
  'Müller', 'Schmidt', 'Wagner', 'Schneider',
  'Lindqvist', 'Andersen', 'Holm', 'Berg', 'Lehto',
  'Rossi', 'Conti', 'Romano',
  'García', 'López', 'Fernández', 'Martín',
  'Dubois', 'Laurent', 'Moreau',
  'Smith', 'Brown', 'Wilson', 'Carter',
]

// ─── PRNG helpers (deterministic when caller supplies a seeded RNG) ─────────

function gaussian(rng: () => number, sigma: number): number {
  let u = rng()
  while (u === 0) u = rng()
  let v = rng()
  while (v === 0) v = rng()
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function makeName(rng: () => number): string {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`
}

// ─── generation ──────────────────────────────────────────────────────────────

/** builds a single rival at the requested tier with attributes around the tier mean */
function makeRival(
  rng: () => number,
  tier: RivalTier,
  index: number,
  seasonNumber: number,
): RivalSkater {
  const mean = TIER_TECHNICAL_MEAN[tier]
  const tech = (delta: number) => clamp(Math.round(mean + delta + gaussian(rng, TIER_TECHNICAL_SIGMA)), 0, 100)
  return {
    id:           `r-s${seasonNumber}-t${tier}-${index}`,
    nombre:       makeName(rng),
    nacionalidad: pick(rng, NATIONALITIES),
    edad:         16 + Math.floor(rng() * 14),  // 16–29
    tier,
    technical: {
      saltos:           tech(0),
      giros:            tech(-2),
      secuenciaDePasos: tech(-1),
      amplitudLinea:    tech(-3),
    },
    psychological: {
      confianza:            clamp(Math.round(mean + gaussian(rng, 8)),  0, 100),
      resistenciaMental:    clamp(Math.round(mean + gaussian(rng, 8)),  0, 100),
      presionCompetitiva:   clamp(Math.round(gaussian(rng, 30)),     -100, 100),
      motivacionIntrinseca: clamp(Math.round(mean + gaussian(rng, 10)), 0, 100),
    },
    difficultyBudget: { ...TIER_DIFFICULTY_BUDGET[tier] },
  }
}

/**
 * generates the rival pool for a season. distribution sums to 50 across tiers
 * and is deterministic for a given seed (caller seeds the rng).
 */
export function generateRivalPool(
  seasonNumber: number,
  rng: () => number = Math.random,
): RivalsPool {
  const skaters: RivalSkater[] = []
  let runningIndex = 0
  for (const tierStr of Object.keys(TIER_DISTRIBUTION) as Array<`${RivalTier}`>) {
    const tier = Number(tierStr) as RivalTier
    const count = TIER_DISTRIBUTION[tier]
    for (let i = 0; i < count; i++) {
      skaters.push(makeRival(rng, tier, runningIndex, seasonNumber))
      runningIndex += 1
    }
  }
  return { seasonNumber, skaters }
}

// ─── simulation ──────────────────────────────────────────────────────────────

/**
 * scores one program for a rival without invoking the full skater engine.
 * model: TES drifts with technical mix and rival psychology; small chance of
 * a fall scaled by mental resilience and tier; deductions follow ISU rules.
 */
export function simulateRivalProgram(
  rival: RivalSkater,
  programType: 'corto' | 'libre',
  rng: () => number = Math.random,
): RivalProgramScore {
  const t = rival.technical
  const p = rival.psychological
  const techMix = (t.saltos * 0.4 + t.giros * 0.3 + t.secuenciaDePasos * 0.3) / 100  // 0..1
  const lineMix = t.amplitudLinea / 100                                              // 0..1

  // gaussian noise gets larger when resistenciaMental is low
  const sigma = 0.04 + 0.10 * (1 - p.resistenciaMental / 100)
  const noise = gaussian(rng, sigma)

  // GOE multiplier in [-0.5, +0.5] approx
  const goeMult = clamp(
    (techMix - 0.5) * 0.6 + (p.confianza - 50) / 200 + (p.presionCompetitiva / 100) * 0.1 + noise,
    -0.5,
    0.5,
  )

  const baseTes = rival.difficultyBudget[programType]
  let tes = baseTes * (1 + goeMult * 0.10)

  // fall probability: low for top tiers, scales with mental fragility
  const fallChance = clamp(0.10 - p.resistenciaMental / 800 + (programType === 'libre' ? 0.05 : 0), 0, 0.4)
  let caidas = 0
  // up to two falls per program; each independent roll
  if (rng() < fallChance) caidas += 1
  if (caidas > 0 && rng() < fallChance * 0.6) caidas += 1
  const deducciones = caidas * 1.0
  if (caidas > 0) tes *= 0.90  // first-fall propagation

  const pcsBase = (techMix * 0.4 + lineMix * 0.4 + (p.motivacionIntrinseca / 100) * 0.2) * 10
  const pcsNoise = gaussian(rng, 0.25)
  const pcsRaw = clamp(pcsBase + pcsNoise, 0, 10)
  const programFactor = programType === 'corto' ? 2.0 : 4.0
  const pcs = pcsRaw * 4.8 * programFactor  // sum-of-coefficients (1+0.8+1+1+1=4.8)

  return {
    rivalId:    rival.id,
    programType,
    tes,
    pcs,
    caidas,
    deducciones,
    total: tes + pcs - deducciones,
  }
}

/** total combined score for one rival across SP + FS */
export function simulateRivalCompetition(
  rival: RivalSkater,
  rng: () => number = Math.random,
): RivalCompetitionScore {
  const corto = simulateRivalProgram(rival, 'corto', rng)
  const libre = simulateRivalProgram(rival, 'libre',  rng)
  return {
    rivalId:        rival.id,
    scoreCorto:     corto.total,
    scoreLibre:     libre.total,
    totalCombinado: corto.total + libre.total,
  }
}

// ─── eligibility & sampling ──────────────────────────────────────────────────

/** rivals eligible to attend a competition of the given type */
export function eligibleRivals(
  pool: readonly RivalSkater[],
  competitionType: CompetitionType,
): RivalSkater[] {
  const minTier = COMPETITION_TIER_MIN_RIVAL[competitionType]
  return pool.filter(r => r.tier >= minTier)
}

/**
 * samples up to (fieldSize - 1) rivals for a competition. rivals are picked
 * top-down by tier so the prestigious events feature the strongest field.
 * the player occupies the remaining slot — this function does NOT include them.
 */
export function sampleField(
  pool: readonly RivalSkater[],
  competitionType: CompetitionType,
  rng: () => number = Math.random,
): RivalSkater[] {
  const fieldSize = COMPETITION_FIELD_SIZE[competitionType]
  const slots = Math.max(1, fieldSize - 1)
  const candidates = eligibleRivals(pool, competitionType)
  if (candidates.length <= slots) return [...candidates]
  // sort by tier desc, then jitter within tier so the field is varied
  const sorted = [...candidates]
    .map(r => ({ r, key: r.tier * 100 + rng() * 100 }))
    .sort((a, b) => b.key - a.key)
    .slice(0, slots)
    .map(x => x.r)
  return sorted
}

// ─── season progression ──────────────────────────────────────────────────────

/**
 * lightweight end-of-week / end-of-season drift so rivals feel alive across
 * the calendar. younger rivals tend to improve, older rivals to decline.
 * the change is small (±1 point) per call so 30-week seasons stay plausible.
 */
export function applyRivalSeasonProgression(
  pool: RivalsPool,
  rng: () => number = Math.random,
): RivalsPool {
  const skaters = pool.skaters.map(r => {
    const youngBoost = r.edad < 22 ? 1 : 0
    const veteranDrop = r.edad > 27 ? 1 : 0
    const delta = (rng() < 0.25) ? (youngBoost - veteranDrop) : 0
    if (delta === 0) return r
    return {
      ...r,
      technical: {
        saltos:           clamp(r.technical.saltos           + delta, 0, 100),
        giros:            clamp(r.technical.giros            + delta, 0, 100),
        secuenciaDePasos: clamp(r.technical.secuenciaDePasos + delta, 0, 100),
        amplitudLinea:    clamp(r.technical.amplitudLinea    + delta, 0, 100),
      },
    }
  })
  return { ...pool, skaters }
}
