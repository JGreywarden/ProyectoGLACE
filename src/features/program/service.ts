// program designer service — pure functions only (no React, no Zustand, no DOM
// except inside extractMusicInfo which probes for AudioContext at runtime).
// constants come from @/lib/balance; scoring uses the pure engine, never the worker.

import {
  JUMP_BASE_VALUES,
  PCS_PROGRAM_FACTOR,
} from '@/lib/balance'
import {
  computeTES as engineComputeTES,
  computePCS as engineComputePCS,
  type RNG,
} from '@/features/competition'
import type { SkaterData } from '@/types'
import type {
  JumpType,
  ProgramData,
  ProgramElement,
  ProgramType,
} from '@/types'
import type { Judge } from '@/services/dataService'
import { getMusicLibraryEntry } from '@/services/dataService'

import type {
  MusicInfo,
  ProjectedScores,
  ValidationResult,
  ValidationViolation,
} from './types'

// ─── constants ────────────────────────────────────────────────────────────────

const SHORT_DURATION_RANGE  = { min: 160, max: 170 } as const  // 2:40–2:50
const FREE_DURATION_RANGE   = { min: 240, max: 270 } as const  // 4:00–4:30

const SHORT_REQUIRED = { saltos: 3, giros: 3, pasos: 1, choreo: 0 } as const
const FREE_REQUIRED  = { saltos: 7, giros: 3, pasos: 1, choreo: 1 } as const

// ISU short-program convention: opening jump is a solo Axel
const SHORT_AXEL_INDEX = 0

// triple repetitions: ISU allows at most 2 of the same jump as triple/quad
const MAX_TRIPLE_REPEATS = 2

// per-element default base values for non-jump elements (level-3 baseline)
const SPIN_LEVEL_3_BASE         = 3.0
const STEP_SEQUENCE_LEVEL_3_BASE = 3.3
const CHOREO_SEQUENCE_BASE       = 3.0

// rng=0.25 makes engine.gaussian collapse to exactly 0 (cos(π/2) = 0):
// projected scores are deterministic AND noise-free, as required for projections.
// the real competition uses a seeded mulberry32 with full variance.
const PROJECTION_RNG: RNG = () => 0.25

// ─── default program builders ─────────────────────────────────────────────────

/** ISU short-program element layout: Axel + 2 triples + 3 spins + 1 step seq */
function defaultShortElements(): ProgramElement[] {
  return [
    makeJump('axel',    2, 1, false),  // 2A — opening Axel (mandatory)
    makeJump('flip',    2, 2, false),  // 2F
    makeJump('lutz',    2, 3, true),   // 2Lz part of a combination
    makeSpin(4),                       // camel position
    makeSpin(5),                       // sit position
    makeSpin(6),                       // upright position
    makeStepSequence(7),
  ]
}

/** ISU free-skate layout: 7 jumps (≥1 Axel, ≥1 combination), 3 spins, steps, choreo */
function defaultFreeElements(): ProgramElement[] {
  return [
    makeJump('axel',    2, 1,  false),
    makeJump('lutz',    2, 2,  true),   // combination
    makeJump('flip',    2, 3,  false),
    makeJump('loop',    2, 4,  false),
    makeJump('salchow', 2, 5,  false),
    makeJump('toeloop', 2, 6,  false),
    makeJump('lutz',    2, 7,  false),
    makeSpin(8),
    makeSpin(9),
    makeSpin(10),
    makeStepSequence(11),
    makeChoreoSequence(12),
  ]
}

function makeJump(
  tipoSalto: JumpType,
  rotaciones: 1 | 2 | 3 | 4,
  posicion: number,
  esCombinacion: boolean,
): ProgramElement {
  return {
    tipo:               'salto',
    tipoSalto,
    dificultadBase:     getJumpBaseValue(tipoSalto, rotaciones),
    posicionEnPrograma: posicion,
    esCombinacion,
    rotaciones,
  }
}

function makeSpin(posicion: number): ProgramElement {
  return {
    tipo:               'giro',
    tipoSalto:          null,
    dificultadBase:     SPIN_LEVEL_3_BASE,
    posicionEnPrograma: posicion,
    esCombinacion:      false,
    rotaciones:         null,
  }
}

function makeStepSequence(posicion: number): ProgramElement {
  return {
    tipo:               'secuenciaPasos',
    tipoSalto:          null,
    dificultadBase:     STEP_SEQUENCE_LEVEL_3_BASE,
    posicionEnPrograma: posicion,
    esCombinacion:      false,
    rotaciones:         null,
  }
}

function makeChoreoSequence(posicion: number): ProgramElement {
  return {
    tipo:               'secuenciaCoreografica',
    tipoSalto:          null,
    dificultadBase:     CHOREO_SEQUENCE_BASE,
    posicionEnPrograma: posicion,
    esCombinacion:      false,
    rotaciones:         null,
  }
}

// JumpType in @/types/program is the english name; balance.ts indexes by ISU code
const JUMP_CODE_BY_TYPE: Readonly<Record<JumpType, keyof typeof JUMP_BASE_VALUES>> = {
  axel:    'A',
  lutz:    'Lz',
  flip:    'F',
  loop:    'Lo',
  salchow: 'S',
  toeloop: 'T',
}

/** ISU base value for a given jump type and rotation count */
export function getJumpBaseValue(type: JumpType, rotaciones: 1 | 2 | 3 | 4): number {
  return JUMP_BASE_VALUES[JUMP_CODE_BY_TYPE[type]][rotaciones]
}

/**
 * Builds a default valid program for the requested type.
 * Ids are deterministic (`<skaterId>_<tipo>_t<temporada>`) to ease lookup.
 */
export function createDefaultProgram(
  tipo:      ProgramType,
  skaterId:  string,
  temporada: number,
  musicInfo: MusicInfo,
): ProgramData {
  const elementos = tipo === 'corto' ? defaultShortElements() : defaultFreeElements()
  return {
    id:                 `${skaterId}_${tipo}_t${temporada}`,
    skaterId,
    temporada,
    tipo,
    tituloProgramatico: musicInfo.title,
    musicaGenero:       musicInfo.genero ?? '',
    musicaTempo:        guessMusicaTempo(musicInfo.tempo),
    densidadEmocional:  0.5,
    elementos,
    coreografoNivel:    1,
    cohesion:           50,
    vinculoMusical:     50,
    tesProyectado:      0,
    pcsProyectado:      0,
  }
}

function guessMusicaTempo(bpm: number | null): 'lento' | 'medio' | 'rapido' {
  if (bpm === null || !Number.isFinite(bpm)) return 'medio'
  if (bpm < 90)  return 'lento'
  if (bpm < 130) return 'medio'
  return 'rapido'
}

// ─── ISU validation ───────────────────────────────────────────────────────────

/**
 * Checks the program against simplified ISU rules. Each rule contributes one
 * violation entry; valid is true only when violations is empty.
 */
export function validateProgramISU(program: ProgramData): ValidationResult {
  const violations: ValidationViolation[] = []
  const required = program.tipo === 'corto' ? SHORT_REQUIRED : FREE_REQUIRED
  const elementos = program.elementos

  const saltos = elementos.filter(e => e.tipo === 'salto')
  const giros  = elementos.filter(e => e.tipo === 'giro')
  const pasos  = elementos.filter(e => e.tipo === 'secuenciaPasos')

  // jump count
  if (saltos.length !== required.saltos) {
    violations.push({
      code:    'saltos_count_invalid',
      mensaje: `El programa ${program.tipo} requiere ${required.saltos} saltos; actualmente hay ${saltos.length}`,
    })
  }

  // short program: opening element must be an Axel
  if (program.tipo === 'corto') {
    const opener = elementos[SHORT_AXEL_INDEX]
    if (!opener || opener.tipo !== 'salto' || opener.tipoSalto !== 'axel') {
      violations.push({
        code:          'axel_missing_corto',
        mensaje:       'El programa corto debe abrir con un Axel en la posición 1.',
        elementoIndex: SHORT_AXEL_INDEX,
      })
    }
  }

  // free skate: at least one combination jump
  if (program.tipo === 'libre') {
    const hasCombo = saltos.some(s => s.esCombinacion)
    if (!hasCombo) {
      violations.push({
        code:    'combination_missing',
        mensaje: 'El programa libre requiere al menos una combinación de saltos.',
      })
    }
  }

  // spin count
  if (giros.length !== required.giros) {
    violations.push({
      code:    'giros_count_invalid',
      mensaje: `El programa ${program.tipo} requiere ${required.giros} giros; actualmente hay ${giros.length}`,
    })
  }

  // step sequence presence
  if (pasos.length < required.pasos) {
    violations.push({
      code:    'steps_missing',
      mensaje: 'Falta la secuencia de pasos obligatoria.',
    })
  }

  // illegal triple repeats — at most MAX_TRIPLE_REPEATS of the same triple jump
  const tripleCounts = new Map<JumpType, number>()
  for (const s of saltos) {
    if (s.tipoSalto && s.rotaciones && s.rotaciones >= 3) {
      tripleCounts.set(s.tipoSalto, (tripleCounts.get(s.tipoSalto) ?? 0) + 1)
    }
  }
  for (const [tipoSalto, count] of tripleCounts) {
    if (count > MAX_TRIPLE_REPEATS) {
      violations.push({
        code:    'illegal_jump_repeat',
        mensaje: `El salto triple ${tipoSalto} aparece ${count} veces; máximo permitido: ${MAX_TRIPLE_REPEATS}`,
      })
    }
  }

  // duration: rough estimate from element count vs. program-type window
  const range = program.tipo === 'corto' ? SHORT_DURATION_RANGE : FREE_DURATION_RANGE
  const expectedElements = program.tipo === 'corto'
    ? SHORT_REQUIRED.saltos + SHORT_REQUIRED.giros + SHORT_REQUIRED.pasos
    : FREE_REQUIRED.saltos + FREE_REQUIRED.giros + FREE_REQUIRED.pasos + FREE_REQUIRED.choreo
  if (elementos.length !== expectedElements) {
    violations.push({
      code:    'duration_out_of_range',
      mensaje: `Número de elementos fuera de rango para ${program.tipo} (${range.min}-${range.max}s): se esperan ${expectedElements}, hay ${elementos.length}`,
    })
  }

  return { valid: violations.length === 0, violations }
}

// ─── projected scoring ────────────────────────────────────────────────────────

/**
 * Returns a synthetic 7-judge panel built by averaging biases of the provided
 * judges. Used when the player hasn't picked a competition context yet — the
 * projection should still be a single, consistent number.
 */
export function averagePanelFrom(judges: readonly Judge[]): Judge[] {
  if (judges.length === 0) return SYNTHETIC_NEUTRAL_PANEL
  const avgTes = judges.reduce((a, j) => a + (j.sesgos.tes ?? 0), 0) / judges.length
  const components: Array<keyof NonNullable<Judge['sesgos']['pcs']>> =
    ['sk', 'tr', 'pe', 'co', 'in']
  const avgPcs: Record<string, number> = {}
  for (const c of components) {
    avgPcs[c] = judges.reduce((a, j) => a + (j.sesgos.pcs?.[c] ?? 0), 0) / judges.length
  }
  // synthesize 7 identical "average judges" so trimmedMean still works
  const template: Judge = {
    id:          'synthetic_avg',
    nombre:      'Panel promedio',
    pais:        '—',
    experiencia: 0,
    sesgos:      {
      tes: avgTes,
      pcs: { sk: avgPcs.sk, tr: avgPcs.tr, pe: avgPcs.pe, co: avgPcs.co, in: avgPcs.in },
    },
  }
  return Array.from({ length: 7 }, (_, i) => ({ ...template, id: `synthetic_avg_${i}` }))
}

const SYNTHETIC_NEUTRAL_PANEL: Judge[] = Array.from({ length: 7 }, (_, i) => ({
  id:          `synthetic_neutral_${i}`,
  nombre:      'Panel neutro',
  pais:        '—',
  experiencia: 0,
  sesgos:      { tes: 0, pcs: { sk: 0, tr: 0, pe: 0, co: 0, in: 0 } },
}))

/**
 * Projects TES and PCS for the program with a fixed RNG so the same input
 * always yields the same projection. The competition itself uses a real RNG.
 */
export function computeProjectedScores(
  program: ProgramData,
  skater:  SkaterData,
  judges?: readonly Judge[],
): ProjectedScores {
  const panel = judges && judges.length > 0 ? averagePanelFrom(judges) : SYNTHETIC_NEUTRAL_PANEL

  const tesResult = engineComputeTES(program, skater, {}, PROJECTION_RNG)
  const pcsResult = engineComputePCS(skater, program, panel)

  // computeTES already includes deductions tracking; the projection ignores caídas
  // because no fall has happened yet — it's a best-effort estimate.
  const tes = tesResult.tes
  const pcs = pcsResult.total

  return {
    tes,
    pcs,
    pcsDetalle: { ...pcsResult.detalle },
    total:      tes + pcs,
  }
}

// re-export so callers know the program-factor mapping is available
export { PCS_PROGRAM_FACTOR }

// ─── music extraction ────────────────────────────────────────────────────────

interface AudioContextLike {
  decodeAudioData: (buffer: ArrayBuffer) => Promise<AudioBufferLike>
  close?: () => Promise<void>
}

interface AudioBufferLike {
  duration:    number
  sampleRate:  number
  numberOfChannels: number
  getChannelData: (channel: number) => Float32Array
}

interface AudioContextCtor {
  new (): AudioContextLike
}

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?:        AudioContextCtor
    webkitAudioContext?:  AudioContextCtor
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** estimates BPM with naive energy autocorrelation; null when input is too short */
function estimateBpm(buffer: AudioBufferLike): number | null {
  try {
    const samples = buffer.getChannelData(0)
    if (samples.length < buffer.sampleRate * 2) return null

    // window into ~50ms energy frames
    const frameSize = Math.floor(buffer.sampleRate * 0.05)
    const frameCount = Math.floor(samples.length / frameSize)
    if (frameCount < 40) return null

    const energies = new Float32Array(frameCount)
    for (let f = 0; f < frameCount; f++) {
      let e = 0
      const start = f * frameSize
      for (let i = 0; i < frameSize; i++) {
        const s = samples[start + i]
        e += s * s
      }
      energies[f] = e
    }

    // autocorrelate energy series for lags corresponding to 60–200 BPM
    const framesPerSecond = buffer.sampleRate / frameSize
    const minLag = Math.max(1, Math.floor(framesPerSecond * (60 / 200)))
    const maxLag = Math.min(frameCount - 1, Math.floor(framesPerSecond * (60 /  60)))
    if (minLag >= maxLag) return null

    let bestLag = minLag
    let bestCorr = -Infinity
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0
      for (let i = 0; i < frameCount - lag; i++) corr += energies[i] * energies[i + lag]
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag }
    }
    const bpm = (60 * framesPerSecond) / bestLag
    if (!Number.isFinite(bpm) || bpm < 50 || bpm > 220) return null
    return Math.round(bpm)
  } catch {
    return null
  }
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

/**
 * Extracts duration/tempo/title from either:
 *  - a File (uploaded by the player) — decoded with AudioContext when available
 *  - a sourceId string — looked up in music_library.json
 *
 * Never throws: any failure surfaces as fallback fields (tempo: null, etc.).
 */
export async function extractMusicInfo(source: File | string): Promise<MusicInfo> {
  if (typeof source === 'string') {
    const entry = await getMusicLibraryEntry(source)
    if (entry) {
      return {
        sourceId: entry.id,
        title:    entry.title,
        duration: entry.duracionSegundos,
        tempo:    null,
        genero:   entry.genero,
      }
    }
    // unknown sourceId — return a minimal fallback so the caller can still proceed
    return { sourceId: source, title: source, duration: 0, tempo: null }
  }

  const file = source
  const baseTitle = stripExtension(file.name)
  const sourceId  = `upload:${file.name}`

  const Ctor = getAudioContextCtor()
  if (!Ctor) {
    // jsdom / SSR / disabled audio — graceful fallback
    return { sourceId, title: baseTitle, duration: 0, tempo: null }
  }

  let ctx: AudioContextLike | null = null
  try {
    const buffer = await file.arrayBuffer()
    ctx = new Ctor()
    const decoded = await ctx.decodeAudioData(buffer)
    const tempo = estimateBpm(decoded)
    return {
      sourceId,
      title:    baseTitle,
      duration: decoded.duration,
      tempo,
    }
  } catch {
    return { sourceId, title: baseTitle, duration: 0, tempo: null }
  } finally {
    if (ctx?.close) {
      try { await ctx.close() } catch { /* ignore close errors */ }
    }
  }
}
