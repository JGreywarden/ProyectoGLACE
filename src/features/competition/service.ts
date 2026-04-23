// main-thread wrapper around the competition worker.
// exposes a single Promise-based API; fire-and-forget workers that terminate
// once the result is delivered.

import type { SkaterData } from '@/types/skater'
import type { ProgramData } from '@/types/program'
import type { Judge } from '@/services/dataService'
import type { CompetitionContextFlags, SimulationResult } from './engine'

/**
 * runs a single competition simulation in a dedicated Web Worker and resolves
 * with the TES/PCS breakdown. the worker is terminated as soon as it replies.
 */
export function runCompetition(
  skater: SkaterData,
  program: ProgramData,
  judges: Judge[],
  contextFlags: CompetitionContextFlags = {},
): Promise<SimulationResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../../workers/competitionWorker.ts', import.meta.url),
      { type: 'module' },
    )
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
      reject(new Error(err.message || 'competition worker failed'))
    }
    worker.postMessage({ type: 'simulate', skater, program, judges, contextFlags })
  })
}
