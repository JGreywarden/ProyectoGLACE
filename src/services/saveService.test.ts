import { describe, it, expect, beforeEach } from 'vitest'
import {
  save,
  load,
  deleteSave,
  getMetadata,
  migrateSave,
  CURRENT_SAVE_VERSION,
  type GameStateSnapshot,
} from './saveService'
import {
  DEFAULT_SKATER_DATA,
  DEFAULT_COACH_DATA,
  DEFAULT_CLUB_DATA,
  DEFAULT_SEASON_DATA,
} from '@/types'
import { createDefaultProgram } from '@/features/program'

function snapshot(extra: Partial<GameStateSnapshot> = {}): GameStateSnapshot {
  return {
    currentSkater:   { ...DEFAULT_SKATER_DATA, id: 'sk1', name: 'Ana' },
    currentCoach:    { ...DEFAULT_COACH_DATA,  id: 'c1',  name: 'Eva' },
    currentClub:     { ...DEFAULT_CLUB_DATA,   id: 'cl1', nombre: 'ClubX' },
    currentSeason:   { ...DEFAULT_SEASON_DATA },
    isFirstSession:  false,
    narrativeFlags:  {},
    dialogueHistory: [],
    emittedEvents:   [],
    generatedEvents: [],
    confirmedPrograms: {},
    rivalsPool:        null,
    decisionHistory:   [],
    ...extra,
  }
}

describe('save / load round-trip', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('saves a snapshot and loads it back', () => {
    const result = save(1, snapshot())
    expect(result.ok).toBe(true)

    const { file, reason } = load(1)
    expect(reason).toBe('ok')
    expect(file?.skater?.name).toBe('Ana')
    expect(file?.generatedEvents).toEqual([])
  })

  it('returns not_found when the slot is empty', () => {
    const { file, reason } = load(2)
    expect(file).toBeNull()
    expect(reason).toBe('not_found')
  })
})

describe('load falls back to backup when primary is corrupt', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('falls back to backup when primary has invalid domain data', () => {
    save(1, snapshot())           // creates primary, no backup
    save(1, snapshot())           // previous primary promoted to backup

    // corrupt the primary with an out-of-range saltos value
    const raw = window.localStorage.getItem('glace_save_1')!
    const parsed = JSON.parse(raw)
    parsed.skater.technical.saltos = 999
    window.localStorage.setItem('glace_save_1', JSON.stringify(parsed))

    const { file, reason } = load(1)
    expect(reason).toBe('ok')         // backup was valid
    expect(file?.skater?.technical.saltos).toBe(DEFAULT_SKATER_DATA.technical.saltos)
  })

  it('returns corrupt when both primary and backup are malformed', () => {
    window.localStorage.setItem('glace_save_1',     '{"saveVersion":1,"fechaGuardado":"x","skater":{"technical":{"saltos":"high"}}}')
    window.localStorage.setItem('glace_save_1_bak', 'not json at all')

    const { file, reason } = load(1)
    expect(file).toBeNull()
    expect(reason).toBe('corrupt')
  })
})

describe('migrateSave validation', () => {
  it('rejects saves from a newer client (saveVersion > CURRENT)', () => {
    expect(() => migrateSave({ saveVersion: CURRENT_SAVE_VERSION + 1, fechaGuardado: 'x' }))
      .toThrow(/más nueva que la soportada/)
  })

  it('rejects malformed saveVersion (missing or non-numeric)', () => {
    expect(() => migrateSave({ fechaGuardado: 'x' })).toThrow(/formato no reconocido/)
    expect(() => migrateSave({ saveVersion: '1', fechaGuardado: 'x' })).toThrow(/formato no reconocido/)
  })

  it('rejects saveVersion that is not a positive integer', () => {
    expect(() => migrateSave({ saveVersion: 0, fechaGuardado: 'x' })).toThrow(/saveVersion inválido/)
    expect(() => migrateSave({ saveVersion: 1.5, fechaGuardado: 'x' })).toThrow(/saveVersion inválido/)
  })

  it('rejects saveVersion older than current when no migration is registered', () => {
    // CURRENT is 1 today, so this scenario is hypothetical until v2 lands; the
    // intent is to lock in the contract: an older save without a migration step
    // must throw cleanly instead of silently passing through.
    if (CURRENT_SAVE_VERSION < 2) return
    expect(() => migrateSave({ saveVersion: CURRENT_SAVE_VERSION - 1, fechaGuardado: 'x' }))
      .toThrow(/no hay migración registrada/)
  })

  it('throws when skater fails domain validation', () => {
    const bad = {
      saveVersion:   1,
      fechaGuardado: new Date().toISOString(),
      skater: { ...DEFAULT_SKATER_DATA, technical: { ...DEFAULT_SKATER_DATA.technical, saltos: 200 } },
      coach:  DEFAULT_COACH_DATA,
      club:   DEFAULT_CLUB_DATA,
      season: DEFAULT_SEASON_DATA,
    }
    expect(() => migrateSave(bad)).toThrow(/skater inválido/)
  })

  it('accepts a file with all null entities', () => {
    const file = migrateSave({
      saveVersion:   1,
      fechaGuardado: new Date().toISOString(),
      skater: null, coach: null, club: null, season: null,
    })
    expect(file.skater).toBeNull()
    expect(file.generatedEvents).toEqual([])
  })
})

describe('confirmedPrograms persistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('round-trip preserves confirmedPrograms with a valid corto program', () => {
    const program = createDefaultProgram(
      'corto',
      'sk1',
      1,
      { sourceId: 'lib_01', title: 'Nocturne', duration: 260, tempo: null, genero: 'clasica_piano' },
    )
    const result = save(1, snapshot({ confirmedPrograms: { sk1: [program] } }))
    expect(result.ok).toBe(true)

    const { file, reason } = load(1)
    expect(reason).toBe('ok')
    expect(file?.confirmedPrograms.sk1).toHaveLength(1)
    expect(file?.confirmedPrograms.sk1[0].id).toBe(program.id)
    expect(file?.confirmedPrograms.sk1[0].elementos).toHaveLength(7)
  })

  it('migrateSave initializes confirmedPrograms to {} when missing (Fase 0 saves)', () => {
    const file = migrateSave({
      saveVersion:   1,
      fechaGuardado: new Date().toISOString(),
      skater: null, coach: null, club: null, season: null,
      // confirmedPrograms field intentionally absent
    })
    expect(file.confirmedPrograms).toEqual({})
  })

  it('migrateSave rejects malformed confirmedPrograms entries', () => {
    expect(() => migrateSave({
      saveVersion:   1,
      fechaGuardado: new Date().toISOString(),
      skater: null, coach: null, club: null, season: null,
      confirmedPrograms: { sk1: [{ id: 'broken', notAProgram: true }] },
    })).toThrow(/confirmedPrograms/)
  })
})

describe('slot isolation', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('corrupting both primary and backup of slot 1 does not affect slot 2', () => {
    save(2, snapshot({ currentSkater: { ...DEFAULT_SKATER_DATA, id: 'sk2', name: 'Bea' } }))

    window.localStorage.setItem('glace_save_1',     'not json at all')
    window.localStorage.setItem('glace_save_1_bak', '{"saveVersion":1,"fechaGuardado":"x","skater":{"technical":{"saltos":"high"}}}')

    expect(load(1).reason).toBe('corrupt')

    const meta2 = getMetadata(2)
    expect(meta2?.nombrePatinador).toBe('Bea')

    const result2 = load(2)
    expect(result2.reason).toBe('ok')
    expect(result2.file?.skater?.name).toBe('Bea')
  })
})

describe('getMetadata sanitization', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns null when nothing is stored at the slot', () => {
    expect(getMetadata(1)).toBeNull()
  })

  it('clamps out-of-range semanaActual / temporadaNumero to defaults', () => {
    // a partially-corrupt save passes the minimal guards (saveVersion + fechaGuardado)
    // but carries garbage in season fields. metadata must NOT surface those values.
    window.localStorage.setItem('glace_save_1', JSON.stringify({
      saveVersion:   1,
      fechaGuardado: '2026-05-07T00:00:00Z',
      season: { semanaActual: 999, temporadaNumero: -3 },
      skater: { name: 'Ana' },
    }))
    const meta = getMetadata(1)
    expect(meta).not.toBeNull()
    expect(meta!.semanaActual).toBe(1)
    expect(meta!.temporadaNumero).toBe(1)
    expect(meta!.nombrePatinador).toBe('Ana')
  })
})

describe('deleteSave', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('removes both primary and backup', () => {
    save(1, snapshot())
    save(1, snapshot())
    deleteSave(1)
    expect(window.localStorage.getItem('glace_save_1')).toBeNull()
    expect(window.localStorage.getItem('glace_save_1_bak')).toBeNull()
  })
})
