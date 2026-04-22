// runtime validation helpers — reused by every validateXxxData guard.
// keep this module free of domain imports: it must be safe to use in types/*.

/** true when v is a finite number (rejects NaN, Infinity, strings, etc.) */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** true when v is a finite number in the inclusive range [min, max] */
export function isInRange(v: unknown, min: number, max: number): v is number {
  return isFiniteNumber(v) && v >= min && v <= max
}

/** true when v is a finite number >= 0 */
export function isNonNegative(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0
}

/** true when v is a finite integer (rejects 1.5, NaN, Infinity) */
export function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

/** true when v is an integer in the inclusive range [min, max] */
export function isIntegerInRange(v: unknown, min: number, max: number): v is number {
  return isInteger(v) && v >= min && v <= max
}

/** true when v is a plain object (not array, not null) */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** true when every named key of obj is a finite number */
export function hasFiniteNumberFields(
  obj: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.every(k => isFiniteNumber(obj[k]))
}

/** true when every named key of obj is a number in [0, 100] */
export function hasUnitScoreFields(
  obj: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.every(k => isInRange(obj[k], 0, 100))
}

/** true when |a - b| <= tolerance; guards against float drift in invariants */
export function approximatelyEquals(a: number, b: number, tolerance: number): boolean {
  return isFiniteNumber(a) && isFiniteNumber(b) && Math.abs(a - b) <= tolerance
}
