// program designer store — holds the in-progress draft and confirmed catalogue.
// business logic lives in service.ts; the store only persists state and dispatches actions.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ProgramData, ProgramElement, ProgramType } from '@/types/program'
import type { SkaterData } from '@/types/skater'
import type { Judge } from '@/services/dataService'
import {
  computeProjectedScores,
  createDefaultProgram,
  validateProgramISU,
} from './service'
import type {
  MusicInfo,
  ProjectedScores,
  ValidationViolation,
} from './types'

// ─── store interface ──────────────────────────────────────────────────────────

interface ProgramState {
  currentDraft:       ProgramData | null
  musicInfo:          MusicInfo | null
  projectedScores:    ProjectedScores | null
  violations:         ValidationViolation[]
  /** confirmed programs indexed by skaterId; one corto + one libre per season */
  confirmedPrograms:  Record<string, ProgramData[]>

  startNewProgram:    (tipo: ProgramType, skaterId: string, temporada: number, musicInfo: MusicInfo) => void
  updateElement:      (index: number, patch: Partial<ProgramElement>) => void
  addElement:         (element: ProgramElement) => void
  removeElement:      (index: number) => void
  reorderElement:     (from: number, to: number) => void
  setMusicInfo:       (info: MusicInfo) => void
  recomputeScores:    (skater: SkaterData, judges?: readonly Judge[]) => void
  /** validates the draft, appends it to confirmedPrograms[skaterId], clears the draft. throws when invalid. */
  confirmProgram:     () => ProgramData
  discardDraft:       () => void
  /** finds a confirmed program by (skaterId, tipo, temporada) — null when missing */
  getProgram:         (skaterId: string, tipo: ProgramType, temporada: number) => ProgramData | null
  /** rehydrate from a loaded SaveFile; resets the draft */
  hydrateConfirmedPrograms: (programs: Record<string, ProgramData[]>) => void
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function reorderArray<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function withRenumberedPositions(elementos: readonly ProgramElement[]): ProgramElement[] {
  return elementos.map((e, i) => ({ ...e, posicionEnPrograma: i + 1 }))
}

function refreshDraftDerivatives(draft: ProgramData): {
  draft:      ProgramData
  violations: ValidationViolation[]
} {
  const violations = validateProgramISU(draft).violations
  return { draft, violations }
}

// ─── store ────────────────────────────────────────────────────────────────────

export const useProgramStore = create<ProgramState>()(
  devtools(
    (set, get) => ({
      currentDraft:      null,
      musicInfo:         null,
      projectedScores:   null,
      violations:        [],
      confirmedPrograms: {},

      startNewProgram: (tipo, skaterId, temporada, musicInfo) => {
        const draft = createDefaultProgram(tipo, skaterId, temporada, musicInfo)
        const { violations } = refreshDraftDerivatives(draft)
        set(
          { currentDraft: draft, musicInfo, projectedScores: null, violations },
          false,
          'program/startNewProgram',
        )
      },

      updateElement: (index, patch) => {
        const draft = get().currentDraft
        if (!draft) return
        const elementos = draft.elementos.map((e, i) => i === index ? { ...e, ...patch } : e)
        const next = { ...draft, elementos }
        const { violations } = refreshDraftDerivatives(next)
        set(
          { currentDraft: next, violations, projectedScores: null },
          false,
          'program/updateElement',
        )
      },

      addElement: (element) => {
        const draft = get().currentDraft
        if (!draft) return
        const elementos = withRenumberedPositions([...draft.elementos, element])
        const next = { ...draft, elementos }
        const { violations } = refreshDraftDerivatives(next)
        set(
          { currentDraft: next, violations, projectedScores: null },
          false,
          'program/addElement',
        )
      },

      removeElement: (index) => {
        const draft = get().currentDraft
        if (!draft) return
        const filtered = draft.elementos.filter((_, i) => i !== index)
        const elementos = withRenumberedPositions(filtered)
        const next = { ...draft, elementos }
        const { violations } = refreshDraftDerivatives(next)
        set(
          { currentDraft: next, violations, projectedScores: null },
          false,
          'program/removeElement',
        )
      },

      reorderElement: (from, to) => {
        const draft = get().currentDraft
        if (!draft) return
        if (from === to) return
        if (from < 0 || from >= draft.elementos.length) return
        if (to   < 0 || to   >= draft.elementos.length) return
        const reordered = reorderArray(draft.elementos, from, to)
        const elementos = withRenumberedPositions(reordered)
        const next = { ...draft, elementos }
        const { violations } = refreshDraftDerivatives(next)
        set(
          { currentDraft: next, violations, projectedScores: null },
          false,
          'program/reorderElement',
        )
      },

      setMusicInfo: (info) => {
        const draft = get().currentDraft
        if (!draft) {
          set({ musicInfo: info }, false, 'program/setMusicInfo')
          return
        }
        const next = {
          ...draft,
          tituloProgramatico: info.title,
          musicaGenero:       info.genero ?? draft.musicaGenero,
        }
        set({ musicInfo: info, currentDraft: next }, false, 'program/setMusicInfo')
      },

      recomputeScores: (skater, judges) => {
        const draft = get().currentDraft
        if (!draft) return
        const projected = computeProjectedScores(draft, skater, judges)
        const next = {
          ...draft,
          tesProyectado: projected.tes,
          pcsProyectado: projected.pcs,
        }
        set(
          { currentDraft: next, projectedScores: projected },
          false,
          'program/recomputeScores',
        )
      },

      confirmProgram: () => {
        const draft = get().currentDraft
        if (!draft) throw new Error('confirmProgram: no hay borrador activo')
        const result = validateProgramISU(draft)
        if (!result.valid) {
          throw new Error(
            `confirmProgram: programa inválido — ${result.violations.map(v => v.mensaje).join('; ')}`,
          )
        }
        const skaterId = draft.skaterId
        const existing = get().confirmedPrograms[skaterId] ?? []
        // replace any existing program of the same (tipo, temporada); otherwise append
        const filtered = existing.filter(
          p => !(p.tipo === draft.tipo && p.temporada === draft.temporada),
        )
        const updated = [...filtered, draft]
        set(
          {
            confirmedPrograms: { ...get().confirmedPrograms, [skaterId]: updated },
            currentDraft:      null,
            musicInfo:         null,
            projectedScores:   null,
            violations:        [],
          },
          false,
          'program/confirmProgram',
        )
        return draft
      },

      discardDraft: () => {
        set(
          { currentDraft: null, musicInfo: null, projectedScores: null, violations: [] },
          false,
          'program/discardDraft',
        )
      },

      getProgram: (skaterId, tipo, temporada) => {
        const list = get().confirmedPrograms[skaterId] ?? []
        return list.find(p => p.tipo === tipo && p.temporada === temporada) ?? null
      },

      hydrateConfirmedPrograms: (programs) => {
        set({ confirmedPrograms: programs }, false, 'program/hydrateConfirmedPrograms')
      },
    }),
    { name: 'glace/program' },
  ),
)
