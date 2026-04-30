// main-thread wrapper around the competition worker.
// exposes Promise-based APIs; fire-and-forget workers that terminate
// once the result is delivered.

import type { SkaterData } from '@/types/skater'
import type { ProgramData } from '@/types/program'
import type { ElementOutcome, ProgramScore } from '@/types/season'
import type { Judge } from '@/services/dataService'
import type { CompetitionContextFlags, SimulationResult } from './engine'

interface WorkerLike {
  postMessage: (msg: unknown) => void
  terminate:   () => void
  onmessage:   ((event: MessageEvent) => void) | null
  onerror:     ((event: { message?: string }) => void) | null
}

function spawnWorker(): WorkerLike {
  return new Worker(
    new URL('../../workers/competitionWorker.ts', import.meta.url),
    { type: 'module' },
  ) as unknown as WorkerLike
}

/**
 * legacy single-shot simulation: fires-and-forgets a worker that returns the
 * aggregated TES/PCS/total. kept so existing call-sites keep working while we
 * migrate to the per-element pipeline.
 */
export function runCompetition(
  skater: SkaterData,
  program: ProgramData,
  judges: Judge[],
  contextFlags: CompetitionContextFlags = {},
): Promise<SimulationResult> {
  return new Promise((resolve, reject) => {
    const worker = spawnWorker()
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data
      worker.terminate()
      if (data?.type === 'result') {
        resolve(data.result as SimulationResult)
      } else {
        reject(new Error(data?.message ?? 'competition worker returned an unknown response'))
      }
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(new Error(err.message ?? 'competition worker failed'))
    }
    worker.postMessage({ type: 'simulate', skater, program, judges, contextFlags })
  })
}

/** detailed program simulation: every element + the program's PCS/TES totals */
export interface ProgramSimulation {
  elements: ElementOutcome[]
  score:    ProgramScore
}

/**
 * runs a full program simulation (SP or FS) in the worker and returns both the
 * ElementOutcome[] (so the UI can reveal element-by-element) and the
 * ProgramScore aggregated from those elements + the judging panel. Moments may
 * later mutate the elements; the caller re-finalizes the score on the main
 * thread (cheap) instead of round-tripping the worker again.
 */
export function runProgramSimulation(
  skater: SkaterData,
  program: ProgramData,
  judges: Judge[],
  contextFlags: CompetitionContextFlags = {},
): Promise<ProgramSimulation> {
  return new Promise((resolve, reject) => {
    const worker = spawnWorker()
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data
      worker.terminate()
      if (data?.type === 'program') {
        resolve({
          elements: data.elements as ElementOutcome[],
          score:    data.score    as ProgramScore,
        })
      } else {
        reject(new Error(data?.message ?? 'competition worker returned an unknown response'))
      }
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(new Error(err.message ?? 'competition worker failed'))
    }
    worker.postMessage({ type: 'simulate-program', skater, program, judges, contextFlags })
  })
}
