// main-thread wrapper around the competition worker.
// owns a single reusable Worker plus a job queue: jobs run sequentially, each
// with its own timeout. on worker error/timeout the worker is terminated and
// respawned for the next job, so a hung simulation never wedges later ones.

import type { SkaterData } from '@/types'
import type { ProgramData } from '@/types'
import type { ElementOutcome, ProgramScore } from '@/types'
import type { Judge } from '@/services/dataService'
import type { CompetitionContextFlags, SimulationResult } from './engine'
import type { WorkerRequest, WorkerResponse } from '@/workers/competitionWorker'

// 5 s is generous for any legitimate simulation (8 elements × 9 judges runs in
// single-digit ms even on a cold worker). anything past it indicates a hang.
const JOB_TIMEOUT_MS = 5000

interface PendingJob {
  request: WorkerRequest
  resolve: (response: WorkerResponse) => void
  reject:  (error: Error) => void
  timer:   ReturnType<typeof setTimeout> | null
}

let worker:     Worker | null   = null
let currentJob: PendingJob | null = null
const queue: PendingJob[] = []

function spawnWorker(): Worker {
  const w = new Worker(
    new URL('../../workers/competitionWorker.ts', import.meta.url),
    { type: 'module' },
  )
  w.onmessage = handleMessage
  w.onerror   = handleError
  return w
}

function handleMessage(event: MessageEvent<WorkerResponse>): void {
  const job = currentJob
  if (!job) return // late message after timeout/error path; drop silently
  if (job.timer) clearTimeout(job.timer)
  currentJob = null
  job.resolve(event.data)
  dispatchNext()
}

function handleError(event: ErrorEvent): void {
  // worker is now in unknown state — terminate and force respawn for next job
  const job = currentJob
  if (worker) {
    worker.terminate()
    worker = null
  }
  if (job) {
    if (job.timer) clearTimeout(job.timer)
    currentJob = null
    const inner = event.error instanceof Error ? event.error : null
    const msg   = inner?.message ?? event.message ?? 'competition worker failed'
    const err   = new Error(msg)
    if (inner?.stack) err.stack = inner.stack
    job.reject(err)
  }
  dispatchNext()
}

function handleTimeout(): void {
  // hard reset: the worker may be stuck mid-loop, so respawn from scratch
  const job = currentJob
  if (worker) {
    worker.terminate()
    worker = null
  }
  if (job) {
    currentJob = null
    job.reject(new Error('competition worker timeout'))
  }
  dispatchNext()
}

function dispatchNext(): void {
  if (currentJob) return
  const next = queue.shift()
  if (!next) return
  currentJob = next
  if (!worker) worker = spawnWorker()
  next.timer = setTimeout(handleTimeout, JOB_TIMEOUT_MS)
  worker.postMessage(next.request)
}

function send(request: WorkerRequest): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    queue.push({ request, resolve, reject, timer: null })
    dispatchNext()
  })
}

/**
 * legacy single-shot simulation: returns the aggregated TES/PCS/total. kept so
 * existing call-sites keep working while we migrate to the per-element pipeline.
 */
export async function runCompetition(
  skater: SkaterData,
  program: ProgramData,
  judges: Judge[],
  contextFlags: CompetitionContextFlags = {},
): Promise<SimulationResult> {
  const response = await send({ type: 'simulate', skater, program, judges, contextFlags })
  if (response.type === 'result') return response.result
  if (response.type === 'error')  throw new Error(response.message)
  throw new Error('competition worker returned an unknown response')
}

/** detailed program simulation: every element + the program's PCS/TES totals */
export interface ProgramSimulation {
  elements: ElementOutcome[]
  score:    ProgramScore
}

/**
 * runs a full program simulation (SP or FS) in the worker and returns both the
 * ElementOutcome[] (so the UI can reveal element-by-element) and the
 * ProgramScore aggregated from those elements + the judging panel.
 */
export async function runProgramSimulation(
  skater: SkaterData,
  program: ProgramData,
  judges: Judge[],
  contextFlags: CompetitionContextFlags = {},
): Promise<ProgramSimulation> {
  const response = await send({ type: 'simulate-program', skater, program, judges, contextFlags })
  if (response.type === 'program') {
    return { elements: response.elements, score: response.score }
  }
  if (response.type === 'error') throw new Error(response.message)
  throw new Error('competition worker returned an unknown response')
}

/**
 * test-only escape hatch: discards the persistent worker and clears the queue.
 * lets unit tests reset module state between cases without leaking workers.
 */
export function __resetWorkerForTesting(): void {
  if (worker) worker.terminate()
  worker = null
  if (currentJob?.timer) clearTimeout(currentJob.timer)
  currentJob = null
  queue.length = 0
}
