import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { GameState, useGameStore } from '@/stores/gameStore'
import { useProgramStore } from '@/features/program'
import type { MusicInfo, ValidationViolation } from '@/features/program'
import type { ProgramData, ProgramType } from '@/types'
import {
  ISUValidationBanner,
  MusicUploader,
  ProgramElementRow,
  ScoreCard,
} from '@/components/ui'
import type { ProgramElement } from '@/types'

const PROGRAM_TYPES: readonly ProgramType[] = ['corto', 'libre']

// stable empty arrays — Zustand selectors must return the SAME reference for
// the same logical value or React's useSyncExternalStore loops trying to
// detect tearing. Returning a fresh `[]` per call triggered the
// "getSnapshot should be cached to avoid an infinite loop" warning AND, in
// practice, cascading re-renders that knocked the player back to /.
const EMPTY_VIOLATIONS: readonly ValidationViolation[] = []
const EMPTY_PROGRAMS:   readonly ProgramData[] = []

export function DisenadorPrograma() {
  const navigate = useNavigate()

  // skater is consumed in many places (id, name, recomputeScores) so we
  // subscribe to the entity. season only contributes its temporadaNumero — a
  // primitive — so we narrow there to skip re-renders for unrelated season changes.
  const skater          = useGameStore(s => s.currentSkater)
  const temporadaNumero = useGameStore(s => s.currentSeason?.temporadaNumero)
  const gameState       = useGameStore(s => s.currentState)

  const activeType = useProgramStore(s => s.activeType)
  const draft      = useProgramStore(s => s.drafts[s.activeType] ?? null)
  const musicInfo  = useProgramStore(s => s.musicInfo[s.activeType] ?? null)
  const violationsRaw = useProgramStore(s => s.violations[s.activeType])
  const violations    = violationsRaw ?? EMPTY_VIOLATIONS
  const projected     = useProgramStore(s => s.projectedScores[s.activeType] ?? null)
  const confirmedRaw  = useProgramStore(s => (skater ? s.confirmedPrograms[skater.id] : undefined))
  const confirmedForSkater = confirmedRaw ?? EMPTY_PROGRAMS

  const setActiveType   = useProgramStore(s => s.setActiveType)
  const ensureDraft     = useProgramStore(s => s.ensureDraft)
  const updateElement   = useProgramStore(s => s.updateElement)
  const addElement      = useProgramStore(s => s.addElement)
  const removeElement   = useProgramStore(s => s.removeElement)
  const reorderElement  = useProgramStore(s => s.reorderElement)
  const setMusicInfo    = useProgramStore(s => s.setMusicInfo)
  const recomputeScores = useProgramStore(s => s.recomputeScores)
  const confirmProgram  = useProgramStore(s => s.confirmProgram)
  const patchDraft      = useProgramStore(s => s.patchDraft)

  const [savedFlash, setSavedFlash] = useState<ProgramType | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // make sure both drafts exist as soon as the screen mounts so the player can
  // freely switch tabs without ever losing in-progress work
  useEffect(() => {
    if (!skater || temporadaNumero === undefined) return
    for (const tipo of PROGRAM_TYPES) {
      const fallback: MusicInfo = {
        sourceId: '',
        title:    `${skater.name} — programa ${tipo}`,
        duration: 0,
        tempo:    null,
      }
      ensureDraft(tipo, skater.id, temporadaNumero, fallback)
    }
  }, [skater, temporadaNumero, ensureDraft])

  // recompute projected scores whenever the active draft changes — recomputeScores
  // only writes into projectedScores so this can safely depend on `draft` itself
  useEffect(() => {
    if (!skater || !draft) return
    recomputeScores(skater)
  }, [skater, draft, recomputeScores])

  // hook MUST run on every render (rules of hooks) — depends on the season number
  // even when we render the loading fallback below
  const confirmedTypes = useMemo(() => {
    const out = new Set<ProgramType>()
    const temporada = temporadaNumero ?? -1
    for (const p of confirmedForSkater) if (p.temporada === temporada) out.add(p.tipo)
    return out
  }, [confirmedForSkater, temporadaNumero])

  if (!skater || temporadaNumero === undefined || !draft) {
    return (
      <div className="flex min-h-screen items-center justify-center glace-vignette">
        <p className="font-display italic text-content-secondary">cargando diseñador…</p>
      </div>
    )
  }

  const valid = violations.length === 0
  const bothConfirmed = confirmedTypes.has('corto') && confirmedTypes.has('libre')

  function handleConfirm() {
    setConfirmError(null)
    if (!valid) return
    try {
      confirmProgram()
      setSavedFlash(activeType)
      window.setTimeout(() => setSavedFlash(null), 1800)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setConfirmError(message)
    }
  }

  function handleStartSeason() {
    if (!bothConfirmed) return
    if (gameState === GameState.SEASON_END) {
      useGameStore.getState().changeState(GameState.WEEKLY_PLANNING)
    } else {
      useGameStore.getState().changeState(GameState.WEEKLY_PLANNING)
    }
    navigate('/semana', { replace: true })
  }

  return (
    <div className="relative flex min-h-screen flex-col glace-vignette glace-grain">

      {/* HEADER */}
      <header className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-12 items-baseline gap-6 px-10 pt-10 pb-6">
        <div className="col-span-12 flex items-baseline gap-4">
          <span className="glace-eyebrow">— diseñador de programa</span>
          <span className="glace-hairline flex-1" />
          <div className="inline-flex items-baseline gap-5 text-xs">
            {PROGRAM_TYPES.map(t => {
              const isActive = activeType === t
              const isConfirmed = confirmedTypes.has(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveType(t)}
                  className={[
                    'font-display text-lg transition-colors uppercase tracking-[0.2em] flex items-baseline gap-2',
                    isActive ? 'text-ice-300' : 'text-content-secondary hover:text-ice-300',
                  ].join(' ')}
                >
                  <span>— {t}</span>
                  {isConfirmed && (
                    <span className="text-[9px] tracking-[0.25em] text-frost-400">guardado</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="col-span-12 md:col-span-8 flex flex-col gap-2">
          <h1 className="glace-reveal-letter font-display text-7xl leading-[0.9] text-content-primary">
            <span className="italic text-content-disabled">programa</span> {activeType === 'corto' ? 'corto' : 'libre'}
          </h1>
          <p className="font-display italic text-lg text-content-secondary">
            de {skater.name} · temporada {temporadaNumero}
          </p>
        </div>
      </header>

      {/* BODY — three columns: music · settings · elements (asymmetric 3/3/6) */}
      <main className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 grid-cols-12 gap-x-8 gap-y-8 px-10 pb-32">

        {/* music */}
        <section className="col-span-12 md:col-span-3 flex flex-col gap-4 glace-reveal glace-stagger-1">
          <div className="flex items-baseline gap-3 border-b border-border-subtle pb-2">
            <span className="glace-eyebrow">— música</span>
          </div>
          <MusicUploader current={musicInfo} onPick={setMusicInfo} />
        </section>

        {/* program meta */}
        <section className="col-span-12 md:col-span-3 flex flex-col gap-5 glace-reveal glace-stagger-2">
          <div className="flex items-baseline gap-3 border-b border-border-subtle pb-2">
            <span className="glace-eyebrow">— firma</span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="glace-eyebrow">título programático</span>
            <input
              value={draft.tituloProgramatico}
              onChange={e => patchDraft({ tituloProgramatico: e.target.value })}
              placeholder="cómo se llamará en el programa"
              className="border-b border-border bg-transparent pb-2 font-display italic text-2xl text-content-primary placeholder:text-content-disabled focus:border-ice-300 focus:outline-none transition-colors"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="glace-eyebrow">género musical</span>
            <input
              value={draft.musicaGenero}
              onChange={e => patchDraft({ musicaGenero: e.target.value })}
              placeholder="clásico · contemporáneo · jazz…"
              className="border-b border-border bg-transparent pb-2 font-display text-base text-content-primary placeholder:italic placeholder:text-content-disabled focus:border-ice-300 focus:outline-none transition-colors"
            />
          </label>

          <RangeRow
            label="coreógrafo"
            min={1} max={5} step={1}
            value={draft.coreografoNivel}
            onChange={v => patchDraft({ coreografoNivel: Math.max(1, Math.min(5, Math.round(v))) as 1|2|3|4|5 })}
            format={v => `nivel ${v}`}
          />
          <RangeRow
            label="densidad emocional"
            min={0} max={1} step={0.05}
            value={draft.densidadEmocional}
            onChange={v => patchDraft({ densidadEmocional: Math.max(0, Math.min(1, v)) })}
            format={v => v.toFixed(2)}
          />
        </section>

        {/* elements */}
        <section className="col-span-12 md:col-span-6 flex flex-col gap-4 glace-reveal glace-stagger-3">
          <div className="flex items-baseline gap-3 border-b border-border-subtle pb-2">
            <span className="glace-eyebrow">— elementos del programa</span>
            <span className="font-display italic text-sm text-content-muted">
              ({draft.elementos.length})
            </span>
          </div>

          <div className="sticky top-0 z-10">
            <ISUValidationBanner violations={violations} />
          </div>

          <div className="flex flex-1 flex-col">
            {draft.elementos.map((el, i) => (
              <ProgramElementRow
                key={`${el.tipo}-${i}-${el.posicionEnPrograma}`}
                index={i}
                total={draft.elementos.length}
                element={el}
                onChange={patch => updateElement(i, patch)}
                onMove={dir => reorderElement(i, i + dir)}
                onRemove={() => removeElement(i)}
              />
            ))}
            <button
              type="button"
              onClick={() => addElement(makeBlankElement(draft.elementos))}
              className="self-start mt-3 font-display italic text-base text-content-secondary hover:text-ice-300 transition-colors"
            >
              + añadir elemento
            </button>
          </div>
        </section>

      </main>

      {/* FOOTER — projection + actions */}
      <footer className="sticky bottom-0 z-20 border-t border-border-subtle bg-bg-deep/95 backdrop-blur-sm">
        <div className="mx-auto grid max-w-7xl grid-cols-12 items-end gap-6 px-10 py-5">
          <div className="col-span-3"><ScoreCard label="tes proyectado"   value={projected?.tes ?? 0}   accent="ice"   narrative size="md" /></div>
          <div className="col-span-3"><ScoreCard label="pcs proyectado"   value={projected?.pcs ?? 0}   accent="frost" narrative size="md" /></div>
          <div className="col-span-3"><ScoreCard label="total proyectado" value={projected?.total ?? 0} accent="gold"  narrative size="md" /></div>
          <div className="col-span-3 flex items-end justify-end gap-6">
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!valid}
                className={[
                  'group flex items-baseline gap-3',
                  valid
                    ? 'text-content-primary hover:text-ice-200'
                    : 'text-content-disabled cursor-not-allowed',
                ].join(' ')}
                title={valid
                  ? `confirmar el programa ${activeType}`
                  : 'corrige las violaciones ISU para confirmar'}
              >
                <span className="font-display text-2xl">
                  confirmar {activeType}
                </span>
                <span className="text-xl">✓</span>
              </button>
              {savedFlash === activeType && (
                <span className="glace-eyebrow text-frost-400">— guardado</span>
              )}
              {confirmError && (
                <span className="glace-eyebrow text-danger max-w-xs text-right normal-case">
                  {confirmError}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleStartSeason}
              disabled={!bothConfirmed}
              className={[
                'group flex items-baseline gap-3',
                bothConfirmed
                  ? 'text-content-primary hover:text-ice-200'
                  : 'text-content-disabled cursor-not-allowed',
              ].join(' ')}
              title={bothConfirmed
                ? 'comenzar la primera semana'
                : 'confirma corto y libre antes de comenzar'}
            >
              <span className="font-display text-2xl">
                {gameState === GameState.SEASON_END ? 'siguiente temporada' : 'comenzar temporada'}
              </span>
              <span className={[
                'transition-transform',
                bothConfirmed ? 'group-hover:translate-x-2' : '',
              ].join(' ')}>→</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function RangeRow({
  label, min, max, step, value, onChange, format,
}: {
  label: string
  min: number; max: number; step: number
  value: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between">
        <span className="glace-eyebrow">{label}</span>
        <span className="font-display tabular-nums text-xl text-content-primary leading-none">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="accent-ice-300"
      />
    </label>
  )
}

function makeBlankElement(existing: readonly ProgramElement[]): ProgramElement {
  return {
    tipo:               'salto',
    tipoSalto:          'toeloop',
    rotaciones:         3,
    dificultadBase:     4.2,
    posicionEnPrograma: existing.length + 1,
    esCombinacion:      false,
  }
}
