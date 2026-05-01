// competition: TES/PCS engine, judging panels, results — runs in web worker

export { runCompetition, runProgramSimulation, type ProgramSimulation } from './service'

// API pública del motor — solo lo que el resto del repo consume vía barrel.
// el worker importa internos del motor por '@/features/competition/engine'
// (excepción documentada en CLAUDE.md, "Regla de dependencias").
export {
  applyMomentToElements,
  summarizeMomentImpact,
  computeTES,
  computePCS,
  type RNG,
} from './engine'
