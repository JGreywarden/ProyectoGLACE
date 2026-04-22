import { describe, it, expect } from 'vitest'
import {
  isFiniteNumber,
  isInRange,
  isNonNegative,
  isInteger,
  isIntegerInRange,
  isPlainObject,
  hasFiniteNumberFields,
  hasUnitScoreFields,
  approximatelyEquals,
} from './validation'

describe('isFiniteNumber', () => {
  it('accepts finite numbers', () => {
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(-3.14)).toBe(true)
    expect(isFiniteNumber(100)).toBe(true)
  })

  it('rejects NaN, Infinity, strings, and null', () => {
    expect(isFiniteNumber(NaN)).toBe(false)
    expect(isFiniteNumber(Infinity)).toBe(false)
    expect(isFiniteNumber(-Infinity)).toBe(false)
    expect(isFiniteNumber('5')).toBe(false)
    expect(isFiniteNumber(null)).toBe(false)
    expect(isFiniteNumber(undefined)).toBe(false)
  })
})

describe('isInRange', () => {
  it('accepts values inside [min, max] inclusive', () => {
    expect(isInRange(0, 0, 100)).toBe(true)
    expect(isInRange(100, 0, 100)).toBe(true)
    expect(isInRange(50, 0, 100)).toBe(true)
  })

  it('rejects values outside the range and non-numbers', () => {
    expect(isInRange(-1, 0, 100)).toBe(false)
    expect(isInRange(101, 0, 100)).toBe(false)
    expect(isInRange(NaN, 0, 100)).toBe(false)
    expect(isInRange('50', 0, 100)).toBe(false)
  })
})

describe('isNonNegative', () => {
  it('accepts 0 and positive finite numbers', () => {
    expect(isNonNegative(0)).toBe(true)
    expect(isNonNegative(1e9)).toBe(true)
  })

  it('rejects negatives and non-finite values', () => {
    expect(isNonNegative(-0.1)).toBe(false)
    expect(isNonNegative(NaN)).toBe(false)
    expect(isNonNegative(Infinity)).toBe(false)
  })
})

describe('isInteger / isIntegerInRange', () => {
  it('isInteger rejects fractional and non-finite', () => {
    expect(isInteger(1)).toBe(true)
    expect(isInteger(1.5)).toBe(false)
    expect(isInteger(Infinity)).toBe(false)
  })

  it('isIntegerInRange enforces bounds', () => {
    expect(isIntegerInRange(5, 1, 10)).toBe(true)
    expect(isIntegerInRange(10, 1, 10)).toBe(true)
    expect(isIntegerInRange(11, 1, 10)).toBe(false)
    expect(isIntegerInRange(5.5, 1, 10)).toBe(false)
  })
})

describe('isPlainObject', () => {
  it('accepts plain objects and rejects arrays/null/primitives', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject('str')).toBe(false)
  })
})

describe('hasFiniteNumberFields / hasUnitScoreFields', () => {
  it('hasFiniteNumberFields requires every key to be a finite number', () => {
    expect(hasFiniteNumberFields({ a: 1, b: 2 }, ['a', 'b'])).toBe(true)
    expect(hasFiniteNumberFields({ a: 1, b: 'two' }, ['a', 'b'])).toBe(false)
    expect(hasFiniteNumberFields({ a: 1 }, ['a', 'b'])).toBe(false)
  })

  it('hasUnitScoreFields enforces [0, 100] on every key', () => {
    expect(hasUnitScoreFields({ x: 0, y: 100, z: 50 }, ['x', 'y', 'z'])).toBe(true)
    expect(hasUnitScoreFields({ x: 0, y: 101 }, ['x', 'y'])).toBe(false)
    expect(hasUnitScoreFields({ x: -1, y: 50 }, ['x', 'y'])).toBe(false)
  })
})

describe('approximatelyEquals', () => {
  it('accepts values within tolerance', () => {
    expect(approximatelyEquals(1.0, 1.005, 0.01)).toBe(true)
    expect(approximatelyEquals(0.34 + 0.33 + 0.33, 1.0, 0.01)).toBe(true)
  })

  it('rejects values outside tolerance and non-finite inputs', () => {
    expect(approximatelyEquals(1.0, 1.05, 0.01)).toBe(false)
    expect(approximatelyEquals(NaN, 1, 0.01)).toBe(false)
  })
})
