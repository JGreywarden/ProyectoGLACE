import { runCompetition } from '@/features/competition'

// re-exported so the worker chunk is anchored in the build graph;
// Tarea 5 will invoke it directly from @/features/competition
export { runCompetition }

export function Competition() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <p className="text-xs uppercase tracking-widest text-content-muted">competición</p>
      <h1 className="text-3xl text-content-primary">Simulación TES/PCS</h1>
    </div>
  )
}
