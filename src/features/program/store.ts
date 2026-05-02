// program designer store — drafts, music info, projected scores and violations
// are kept independently for each program type ('corto' / 'libre') so the player
// can edit both in parallel without one wiping the other.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ProgramData, ProgramElement, ProgramType } from '@/types'
import type { SkaterData } from '@/types'
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

// ─── per-tipo dictionaries ────────────────────────────────────────────────────

type PerType<T> = Partial<Record<ProgramType, T>>

interface ProgramState {
  /** which tipo is currently being edited; mutators target this slot */
  activeType:        ProgramType
  drafts:            PerType<ProgramData>
  musicInfo:         PerType<MusicInfo>
  projectedScores:   PerType<ProjectedScores>
  violations:        PerType<ValidationViolation[]>
  /** confirmed programs indexed by skaterId; one corto + one libre per season */
  confirmedPrograms: Record<string, ProgramData[]>

  setActiveType:    (tipo: ProgramType) => void
  /** lazily creates a draft for the given tipo if one doesn't exist; never overwrites */
  ensureDraft:      (tipo: ProgramType, skaterId: string, temporada: number, musicInfo: MusicInfo) => void
  /** discards any draft for the given tipo and rebuilds it from defaults */
  resetDraft:       (tipo: ProgramType, skaterId: string, temporada: number, musicInfo: MusicInfo) => void

  // mutators — operate on drafts[activeType]
  patchDraft:       (patch: Partial<ProgramData>) => void
  updateElement:    (index: number, patch: Partial<ProgramElement>) => void
  addElement:       (element: ProgramElement) => void
  removeElement:    (index: number) => void
  reorderElement:   (from: number, to: number) => void
  setMusicInfo:     (info: MusicInfo) => void
  /** computes projected scores for activeType — does NOT mutate the draft */
  recomputeScores:  (skater: SkaterData, judges?: readonly Judge[]) => void

  /** validates and confirms the activeType draft; throws when invalid. returns the saved program. */
  confirmProgram:   () => ProgramData
  /** drops only the activeType draft (and its derived state) */
  discardDraft:     () => void

  /** finds a confirmed program by (skaterId, tipo, temporada) — null when missing */
  getProgram:       (skaterId: string, tipo: ProgramType, temporada: number) => ProgramData | null
  /**
   * replaces the matching confirmed program (same skaterId, tipo, temporada).
   * used by the week pipeline to persist cohesion / vínculo musical updates
   * after each week without re-confirming the draft.
   */
  updateConfirmedProgram: (program: ProgramData) => void
  /** rehydrate from a loaded SaveFile; resets all drafts */
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

// ─── store ────────────────────────────────────────────────────────────────────

export const useProgramStore = create<ProgramState>()(
  devtools(
    (set, get) => {
      // applies a draft mutation for the active tipo and refreshes its violations.
      // projectedScores is intentionally preserved here — recomputeScores is the
      // single writer for that field, called from a useEffect with skater context.
      function commitDraft(next: ProgramData) {
        const tipo = get().activeType
        set(
          (s) => ({
            drafts:     { ...s.drafts,     [tipo]: next },
            violations: { ...s.violations, [tipo]: validateProgramISU(next).violations },
          }),
          false,
          'program/commitDraft',
        )
      }

      function activeDraft(): ProgramData | null {
        return get().drafts[get().activeType] ?? null
      }

      return {
        activeType:        'libre',
        drafts:            {},
        musicInfo:         {},
        projectedScores:   {},
        violations:        {},
        confirmedPrograms: {},

        setActiveType: (tipo) => {
          set({ activeType: tipo }, false, 'program/setActiveType')
        },

        ensureDraft: (tipo, skaterId, temporada, musicInfo) => {
          if (get().drafts[tipo]) return
          const draft = createDefaultProgram(tipo, skaterId, temporada, musicInfo)
          set(
            (s) => ({
              drafts:     { ...s.drafts,     [tipo]: draft },
              musicInfo:  { ...s.musicInfo,  [tipo]: musicInfo },
              violations: { ...s.violations, [tipo]: validateProgramISU(draft).violations },
            }),
            false,
            'program/ensureDraft',
          )
        },

        resetDraft: (tipo, skaterId, temporada, musicInfo) => {
          const draft = createDefaultProgram(tipo, skaterId, temporada, musicInfo)
          set(
            (s) => ({
              drafts:          { ...s.drafts,          [tipo]: draft },
              musicInfo:       { ...s.musicInfo,       [tipo]: musicInfo },
              violations:      { ...s.violations,      [tipo]: validateProgramISU(draft).violations },
              projectedScores: { ...s.projectedScores, [tipo]: undefined },
            }),
            false,
            'program/resetDraft',
          )
        },

        patchDraft: (patch) => {
          const draft = activeDraft()
          if (!draft) return
          commitDraft({ ...draft, ...patch })
        },

        updateElement: (index, patch) => {
          const draft = activeDraft()
          if (!draft) return
          const elementos = draft.elementos.map((e, i) => i === index ? { ...e, ...patch } : e)
          commitDraft({ ...draft, elementos })
        },

        addElement: (element) => {
          const draft = activeDraft()
          if (!draft) return
          const elementos = withRenumberedPositions([...draft.elementos, element])
          commitDraft({ ...draft, elementos })
        },

        removeElement: (index) => {
          const draft = activeDraft()
          if (!draft) return
          const elementos = withRenumberedPositions(draft.elementos.filter((_, i) => i !== index))
          commitDraft({ ...draft, elementos })
        },

        reorderElement: (from, to) => {
          const draft = activeDraft()
          if (!draft) return
          if (from === to) return
          if (from < 0 || from >= draft.elementos.length) return
          if (to   < 0 || to   >= draft.elementos.length) return
          const elementos = withRenumberedPositions(reorderArray(draft.elementos, from, to))
          commitDraft({ ...draft, elementos })
        },

        setMusicInfo: (info) => {
          const tipo = get().activeType
          const draft = activeDraft()
          if (!draft) {
            set(
              (s) => ({ musicInfo: { ...s.musicInfo, [tipo]: info } }),
              false,
              'program/setMusicInfo',
            )
            return
          }
          const next: ProgramData = {
            ...draft,
            tituloProgramatico: info.title,
            musicaGenero:       info.genero ?? draft.musicaGenero,
          }
          set(
            (s) => ({
              musicInfo:  { ...s.musicInfo,  [tipo]: info },
              drafts:     { ...s.drafts,     [tipo]: next },
              violations: { ...s.violations, [tipo]: validateProgramISU(next).violations },
            }),
            false,
            'program/setMusicInfo',
          )
        },

        recomputeScores: (skater, judges) => {
          const tipo = get().activeType
          const draft = activeDraft()
          if (!draft) return
          const projected = computeProjectedScores(draft, skater, judges)
          set(
            (s) => ({ projectedScores: { ...s.projectedScores, [tipo]: projected } }),
            false,
            'program/recomputeScores',
          )
        },

        confirmProgram: () => {
          const tipo = get().activeType
          const draft = activeDraft()
          if (!draft) throw new Error('confirmProgram: no hay borrador activo')
          const result = validateProgramISU(draft)
          if (!result.valid) {
            throw new Error(
              `confirmProgram: programa inválido — ${result.violations.map(v => v.mensaje).join('; ')}`,
            )
          }
          // bake the latest projected scores into the persisted snapshot
          const projected = get().projectedScores[tipo]
          const snapshot: ProgramData = projected
            ? { ...draft, tesProyectado: projected.tes, pcsProyectado: projected.pcs }
            : draft

          const skaterId = snapshot.skaterId
          const existing = get().confirmedPrograms[skaterId] ?? []
          // replace any existing program of the same (tipo, temporada); otherwise append
          const filtered = existing.filter(
            p => !(p.tipo === snapshot.tipo && p.temporada === snapshot.temporada),
          )
          set(
            (s) => ({
              confirmedPrograms: { ...s.confirmedPrograms, [skaterId]: [...filtered, snapshot] },
              // keep the draft alive so the player can keep iterating after saving
              drafts:            { ...s.drafts, [tipo]: snapshot },
            }),
            false,
            'program/confirmProgram',
          )
          return snapshot
        },

        discardDraft: () => {
          const tipo = get().activeType
          set(
            (s) => ({
              drafts:          { ...s.drafts,          [tipo]: undefined },
              musicInfo:       { ...s.musicInfo,       [tipo]: undefined },
              violations:      { ...s.violations,      [tipo]: undefined },
              projectedScores: { ...s.projectedScores, [tipo]: undefined },
            }),
            false,
            'program/discardDraft',
          )
        },

        getProgram: (skaterId, tipo, temporada) => {
          const list = get().confirmedPrograms[skaterId] ?? []
          return list.find(p => p.tipo === tipo && p.temporada === temporada) ?? null
        },

        updateConfirmedProgram: (program) => {
          const skaterId = program.skaterId
          const existing = get().confirmedPrograms[skaterId] ?? []
          const idx = existing.findIndex(
            p => p.tipo === program.tipo && p.temporada === program.temporada,
          )
          if (idx === -1) return
          const next = [...existing]
          next[idx] = program
          set(
            (s) => ({
              confirmedPrograms: { ...s.confirmedPrograms, [skaterId]: next },
            }),
            false,
            'program/updateConfirmedProgram',
          )
        },

        hydrateConfirmedPrograms: (programs) => {
          set(
            {
              confirmedPrograms: programs,
              drafts:            {},
              musicInfo:         {},
              violations:        {},
              projectedScores:   {},
            },
            false,
            'program/hydrateConfirmedPrograms',
          )
        },
      }
    },
    { name: 'glace/program' },
  ),
)
