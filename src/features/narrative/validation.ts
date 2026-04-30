// runtime validation for persisted narrative state — guards SaveFile imports

import {
  isInteger,
  isIntegerInRange,
  isPlainObject,
} from '@/utils/validation'
import type { DecisionRecord, NarrativeEventType } from './types'

const VALID_TYPES: ReadonlySet<string> = new Set<NarrativeEventType>([
  'revelacion',
  'crisis',
  'decision_moral',
  'terceros',
  'cotidiano',
  'logro_compartido',
  'momento_competicion',
])

function validateDecisionRecord(v: unknown): v is DecisionRecord {
  if (!isPlainObject(v)) return false
  if (typeof v['id'] !== 'string' || v['id'].length === 0) return false
  if (!isInteger(v['season']) || (v['season'] as number) < 1) return false
  if (!isIntegerInRange(v['week'], 1, 30)) return false
  if (typeof v['eventId']     !== 'string' || v['eventId'].length     === 0) return false
  if (typeof v['eventTitulo'] !== 'string') return false
  if (typeof v['eventTipo']   !== 'string' || !VALID_TYPES.has(v['eventTipo'] as string)) return false
  if (typeof v['optionId']    !== 'string' || v['optionId'].length    === 0) return false
  if (typeof v['optionTexto'] !== 'string') return false
  if (typeof v['consecuenciasResumidas'] !== 'string') return false
  if (typeof v['skaterId']    !== 'string') return false
  if (!Array.isArray(v['flagsAlterados'])) return false
  if (!v['flagsAlterados'].every(f => typeof f === 'string')) return false
  return true
}

/** type guard for an array of DecisionRecord — narrows from unknown safely */
export function validateDecisionHistory(v: unknown): v is DecisionRecord[] {
  if (!Array.isArray(v)) return false
  return v.every(validateDecisionRecord)
}
