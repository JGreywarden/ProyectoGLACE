// runtime validation of a RivalsPool — guards against malformed save files

import {
  isFiniteNumber,
  isInRange,
  isInteger,
  isIntegerInRange,
  isPlainObject,
} from '@/utils/validation'
import type { RivalSkater, RivalTier, RivalsPool } from './types'

const VALID_TIERS: ReadonlySet<number> = new Set<RivalTier>([1, 2, 3, 4, 5])

function validateRival(v: unknown): v is RivalSkater {
  if (!isPlainObject(v)) return false
  if (typeof v['id'] !== 'string' || v['id'].length === 0) return false
  if (typeof v['nombre'] !== 'string' || v['nombre'].length === 0) return false
  if (typeof v['nacionalidad'] !== 'string' || v['nacionalidad'].length === 0) return false
  if (!isIntegerInRange(v['edad'], 10, 50)) return false
  if (!isInteger(v['tier']) || !VALID_TIERS.has(v['tier'] as number)) return false

  const tech = v['technical']
  if (!isPlainObject(tech)) return false
  for (const k of ['saltos', 'giros', 'secuenciaDePasos', 'amplitudLinea']) {
    if (!isInRange(tech[k], 0, 100)) return false
  }

  const psy = v['psychological']
  if (!isPlainObject(psy)) return false
  for (const k of ['confianza', 'resistenciaMental', 'motivacionIntrinseca']) {
    if (!isInRange(psy[k], 0, 100)) return false
  }
  if (!isInRange(psy['presionCompetitiva'], -100, 100)) return false

  const budget = v['difficultyBudget']
  if (!isPlainObject(budget)) return false
  if (!isFiniteNumber(budget['corto']) || !isFiniteNumber(budget['libre'])) return false
  if ((budget['corto'] as number) < 0 || (budget['libre'] as number) < 0) return false
  return true
}

/** type guard for a complete RivalsPool — validates ranges and shape */
export function validateRivalsPool(data: unknown): data is RivalsPool {
  if (!isPlainObject(data)) return false
  if (!isInteger(data['seasonNumber']) || (data['seasonNumber'] as number) < 1) return false
  if (!Array.isArray(data['skaters'])) return false
  return data['skaters'].every(validateRival)
}
