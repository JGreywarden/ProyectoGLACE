import { describe, it, expect } from 'vitest'
import {
  createDefaultProgram,
  validateProgramISU,
  computeProjectedScores,
  extractMusicInfo,
} from './service'
import { DEFAULT_SKATER_DATA } from '@/types/skater'
import { validateProgramData } from '@/types/program'
import type { MusicInfo } from './types'

// ─── fixtures ─────────────────────────────────────────────────────────────────

const sampleMusic: MusicInfo = {
  sourceId: 'lib_01',
  title:    'Nocturne in E-flat (placeholder)',
  duration: 260,
  tempo:    null,
  genero:   'clasica_piano',
}

const skater = { ...DEFAULT_SKATER_DATA, id: 'sk_test', name: 'Test' }

// ─── createDefaultProgram ─────────────────────────────────────────────────────

describe('createDefaultProgram', () => {
  it('builds a corto with exactly 7 elements (3 saltos + 3 giros + 1 pasos)', () => {
    const p = createDefaultProgram('corto', 'sk1', 1, sampleMusic)
    expect(p.elementos).toHaveLength(7)
    expect(p.elementos.filter(e => e.tipo === 'salto')).toHaveLength(3)
    expect(p.elementos.filter(e => e.tipo === 'giro')).toHaveLength(3)
    expect(p.elementos.filter(e => e.tipo === 'secuenciaPasos')).toHaveLength(1)
  })

  it('places an Axel at elementos[0] in the corto', () => {
    const p = createDefaultProgram('corto', 'sk1', 1, sampleMusic)
    expect(p.elementos[0].tipo).toBe('salto')
    expect(p.elementos[0].tipoSalto).toBe('axel')
  })

  it('builds a libre with exactly 12 elements (7 + 3 + 1 + 1)', () => {
    const p = createDefaultProgram('libre', 'sk1', 1, sampleMusic)
    expect(p.elementos).toHaveLength(12)
    expect(p.elementos.filter(e => e.tipo === 'salto')).toHaveLength(7)
    expect(p.elementos.filter(e => e.tipo === 'giro')).toHaveLength(3)
    expect(p.elementos.filter(e => e.tipo === 'secuenciaPasos')).toHaveLength(1)
    expect(p.elementos.filter(e => e.tipo === 'secuenciaCoreografica')).toHaveLength(1)
  })

  it('output passes validateProgramData from @/types/program (corto and libre)', () => {
    const corto = createDefaultProgram('corto', 'sk1', 1, sampleMusic)
    const libre = createDefaultProgram('libre', 'sk1', 2, sampleMusic)
    expect(validateProgramData(corto)).toBe(true)
    expect(validateProgramData(libre)).toBe(true)
  })
})

// ─── validateProgramISU ───────────────────────────────────────────────────────

describe('validateProgramISU', () => {
  it('accepts the default corto', () => {
    const p = createDefaultProgram('corto', 'sk1', 1, sampleMusic)
    const result = validateProgramISU(p)
    expect(result.valid).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('accepts the default libre', () => {
    const p = createDefaultProgram('libre', 'sk1', 1, sampleMusic)
    const result = validateProgramISU(p)
    expect(result.valid).toBe(true)
  })

  it('rejects a corto with no Axel (axel_missing_corto)', () => {
    const p = createDefaultProgram('corto', 'sk1', 1, sampleMusic)
    const noAxel = {
      ...p,
      elementos: p.elementos.filter(e => !(e.tipo === 'salto' && e.tipoSalto === 'axel')),
    }
    const result = validateProgramISU(noAxel)
    expect(result.valid).toBe(false)
    expect(result.violations.some(v => v.code === 'axel_missing_corto')).toBe(true)
  })

  it('rejects a libre with 6 jumps (saltos_count_invalid with exact message)', () => {
    const p = createDefaultProgram('libre', 'sk1', 1, sampleMusic)
    const saltos = p.elementos.filter(e => e.tipo === 'salto')
    const removed = saltos[saltos.length - 1]
    const sixJumps = { ...p, elementos: p.elementos.filter(e => e !== removed) }

    const result = validateProgramISU(sixJumps)
    const v = result.violations.find(x => x.code === 'saltos_count_invalid')
    expect(v).toBeDefined()
    expect(v!.mensaje).toBe('El programa libre requiere 7 saltos; actualmente hay 6')
  })
})

// ─── computeProjectedScores ───────────────────────────────────────────────────

describe('computeProjectedScores', () => {
  it('returns total > 0 for a valid program with the default skater', () => {
    const p = createDefaultProgram('libre', 'sk1', 1, sampleMusic)
    const scores = computeProjectedScores(p, skater)
    expect(scores.total).toBeGreaterThan(0)
    expect(scores.tes).toBeGreaterThan(0)
    expect(scores.pcs).toBeGreaterThan(0)
    expect(Number.isFinite(scores.total)).toBe(true)
  })

  it('is deterministic — same input yields same output', () => {
    const p = createDefaultProgram('corto', 'sk1', 1, sampleMusic)
    const a = computeProjectedScores(p, skater)
    const b = computeProjectedScores(p, skater)
    expect(a.total).toBe(b.total)
    expect(a.tes).toBe(b.tes)
    expect(a.pcs).toBe(b.pcs)
    expect(a.pcsDetalle).toEqual(b.pcsDetalle)
  })
})

// ─── extractMusicInfo ─────────────────────────────────────────────────────────

describe('extractMusicInfo', () => {
  it('does not throw on a File and returns MusicInfo (fallback in jsdom)', async () => {
    const blob = new Uint8Array([0, 0, 0, 0])
    const file = new File([blob], 'piano-piece.mp3', { type: 'audio/mpeg' })
    const info = await extractMusicInfo(file)
    expect(info.sourceId).toBe('upload:piano-piece.mp3')
    expect(info.title).toBe('piano-piece')
    expect(typeof info.duration).toBe('number')
    expect(info.tempo).toBeNull()
  })

  it('does not throw when AudioContext.decodeAudioData rejects (corrupt file)', async () => {
    const w = window as unknown as { AudioContext?: unknown }
    const original = w.AudioContext
    class FailingAudioContext {
      async decodeAudioData(): Promise<never> {
        throw new Error('EncodingError: corrupt audio')
      }
      async close(): Promise<void> { /* noop */ }
    }
    w.AudioContext = FailingAudioContext
    try {
      const file = new File([new Uint8Array([1, 2, 3])], 'broken.mp3', { type: 'audio/mpeg' })
      const info = await extractMusicInfo(file)
      expect(info.title).toBe('broken')
      expect(info.tempo).toBeNull()
      expect(typeof info.duration).toBe('number')
    } finally {
      w.AudioContext = original
    }
  })

  it('looks up library entries by sourceId', async () => {
    // mock fetch for the library JSON
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string | URL) => {
      const path = typeof url === 'string' ? url : url.toString()
      if (path.endsWith('/data/music_library.json')) {
        return new Response(JSON.stringify([{
          id: 'lib_01',
          title: 'Nocturne in E-flat (placeholder)',
          composer: 'F. Chopin',
          url: '/assets/music/placeholder_01.mp3',
          genero: 'clasica_piano',
          duracionSegundos: 260,
          licencia: 'CC0',
        }]), { status: 200 })
      }
      throw new Error(`unexpected fetch: ${path}`)
    }) as typeof fetch

    try {
      const info = await extractMusicInfo('lib_01')
      expect(info.sourceId).toBe('lib_01')
      expect(info.title).toContain('Nocturne')
      expect(info.duration).toBe(260)
      expect(info.genero).toBe('clasica_piano')
    } finally {
      globalThis.fetch = original
    }
  })
})
