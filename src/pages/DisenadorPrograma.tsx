import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'

import { GameState, useGameStore } from '@/stores/gameStore'
import { useProgramStore } from '@/features/program'
import type { MusicInfo } from '@/features/program'
import type { ProgramType } from '@/types/program'
import {
  ISUValidationBanner,
  MusicUploader,
  ProgramElementRow,
  ScoreCard,
} from '@/components/ui'
import type { ProgramElement } from '@/types/program'

export function DisenadorPrograma() {
  const navigate = useNavigate()

  const { skater, season, gameState } = useGameStore(
    useShallow(s => ({
      skater:    s.currentSkater,
      season:    s.currentSeason,
      gameState: s.currentState,
    })),
  )

  const draft = useProgramStore(s => s.currentDraft)
  const violations = useProgramStore(s => s.violations)
  const projected = useProgramStore(s => s.projectedScores)
  const musicInfo = useProgramStore(s => s.musicInfo)

  const startNewProgram = useProgramStore(s => s.startNewProgram)
  const updateElement   = useProgramStore(s => s.updateElement)
  const addElement      = useProgramStore(s => s.addElement)
  const removeElement   = useProgramStore(s => s.removeElement)
  const reorderElement  = useProgramStore(s => s.reorderElement)
  const setMusicInfoStore = useProgramStore(s => s.setMusicInfo)
  const recomputeScores = useProgramStore(s => s.recomputeScores)
  const confirmProgram  = useProgramStore(s => s.confirmProgram)
  const discardDraft    = useProgramStore(s => s.discardDraft)

  const [activeType, setActiveType] = useState<ProgramType>('libre')

  useEffect(() => {
    if (!skater || !season) return
    if (draft && draft.tipo === activeType && draft.skaterId === skater.id) return

    const fallbackInfo: MusicInfo = musicInfo ?? {
      sourceId: '',
      title:    `${skater.name} — programa ${activeType === 'corto' ? 'corto' : 'libre'}`,
      duration: 0,
      tempo:    null,
    }
    startNewProgram(activeType, skater.id, season.temporadaNumero, fallbackInfo)
  }, [skater, season, activeType, draft, musicInfo, startNewProgram])

  useEffect(() => {
    if (!skater || !draft) return
    recomputeScores(skater)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skater?.id, draft?.elementos.length, draft?.coreografoNivel, draft?.densidadEmocional])

  if (!skater || !season || !draft) {
    return (
      <div className="flex min-h-screen items-center justify-center glace-vignette">
        <p className="font-display italic text-content-secondary">cargando diseñador…</p>
      </div>
    )
  }

  const valid = violations.length === 0

  function handleConfirm() {
    if (!valid) return
    try { confirmProgram() }
    catch (err) { console.warn('[disenador] confirmProgram fallo:', err); return }
    if (gameState === GameState.SEASON_END) {
      useGameStore.getState().changeState(GameState.WEEKLY_PLANNING)
      navigate('/semana', { replace: true })
    } else {
      useGameStore.getState().changeState(GameState.WEEKLY_PLANNING)
      navigate('/semana', { replace: true })
    }
  }
  function handleDiscard() {
    discardDraft()
    navigate(-1)
  }

  return (
    <div className="relative flex min-h-screen flex-col glace-vignette glace-grain">

      {/* HEADER */}
      <header className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-12 items-baseline gap-6 px-10 pt-10 pb-6">
        <div className="col-span-12 flex items-baseline gap-4">
          <span className="glace-eyebrow">— diseñador de programa</span>
          <span className="glace-hairline flex-1" />
          <div className="inline-flex items-baseline gap-5 text-xs">
            {(['corto', 'libre'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveType(t)}
                className={[
                  'font-display text-lg transition-colors uppercase tracking-[0.2em]',
                  activeType === t ? 'text-ice-300' : 'text-content-secondary hover:text-ice-300',
                ].join(' ')}
              >
                {t === 'corto' ? '— corto' : '— libre'}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-12 md:col-span-8 flex flex-col gap-2">
          <h1 className="glace-reveal-letter font-display text-7xl leading-[0.9] text-content-primary">
            <span className="italic text-content-disabled">programa</span> {activeType === 'corto' ? 'corto' : 'libre'}
          </h1>
          <p className="font-display italic text-lg text-content-secondary">
            de {skater.name} · temporada {season.temporadaNumero}
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
          <MusicUploader current={musicInfo} onPick={setMusicInfoStore} />
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
              onChange={e => useProgramStore.setState({
                currentDraft: { ...draft, tituloProgramatico: e.target.value },
              })}
              placeholder="cómo se llamará en el programa"
              className="border-b border-border bg-transparent pb-2 font-display italic text-2xl text-content-primary placeholder:text-content-disabled focus:border-ice-300 focus:outline-none transition-colors"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="glace-eyebrow">género musical</span>
            <input
              value={draft.musicaGenero}
              onChange={e => useProgramStore.setState({
                currentDraft: { ...draft, musicaGenero: e.target.value },
              })}
              placeholder="clásico · contemporáneo · jazz…"
              className="border-b border-border bg-transparent pb-2 font-display text-base text-content-primary placeholder:italic placeholder:text-content-disabled focus:border-ice-300 focus:outline-none transition-colors"
            />
          </label>

          <RangeRow
            label="coreógrafo"
            min={1} max={5} step={1}
            value={draft.coreografoNivel}
            onChange={v => useProgramStore.setState({
              currentDraft: { ...draft, coreografoNivel: Math.max(1, Math.min(5, Math.round(v))) as 1|2|3|4|5 },
            })}
            format={v => `nivel ${v}`}
          />
          <RangeRow
            label="densidad emocional"
            min={0} max={1} step={0.05}
            value={draft.densidadEmocional}
            onChange={v => useProgramStore.setState({
              currentDraft: { ...draft, densidadEmocional: Math.max(0, Math.min(1, v)) },
            })}
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
            <button
              type="button"
              onClick={handleDiscard}
              className="font-display italic text-base text-content-muted hover:text-danger transition-colors"
            >
              descartar
            </button>
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
            >
              <span className="font-display text-2xl">confirmar</span>
              <span className={[
                'transition-transform',
                valid ? 'group-hover:translate-x-2' : '',
              ].join(' ')}>→</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

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
