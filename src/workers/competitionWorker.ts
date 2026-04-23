/// <reference lib="webworker" />
// competition worker — runs the ISU TES/PCS engine off the main thread.
// all heavy lifting lives in '@/features/competition/engine'; this file
// only translates messages and builds a deterministic rng from seed.

import { simulate, type CompetitionContextFlags, type SimulationResult } from '@/features/competition/engine'
import type { SkaterData } from '@/types/skater'
import type { ProgramData } from '@/types/program'
import type { Judge } from '@/services/dataService'

export interface SimulateRequest {
  type:         'simulate'
  skater:       SkaterData
  program:      ProgramData
  judges:       Judge[]
  contextFlags: CompetitionContextFlags
}

export type WorkerResponse =
  | { type: 'result'; result: SimulationResult }
  | { type: 'error';  message: string }

// mulberry32: small, fast, deterministic PRNG — good enough for gaussian sampling
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const scope = self as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<SimulateRequest>) => {
  const data = event.data
  if (!data || data.type !== 'simulate') {
    scope.postMessage({ type: 'error', message: 'unknown message type' } satisfies WorkerResponse)
    return
  }
  try {
    const rng = typeof data.contextFlags?.seed === 'number'
      ? mulberry32(data.contextFlags.seed)
      : Math.random
    const result = simulate(data.skater, data.program, data.judges, data.contextFlags ?? {}, rng)
    scope.postMessage({ type: 'result', result } satisfies WorkerResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    scope.postMessage({ type: 'error', message } satisfies WorkerResponse)
  }
}
