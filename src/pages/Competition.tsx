import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'

import { GameState, useGameStore } from '@/stores/gameStore'
import { useNarrativeStore } from '@/features/narrative'
import type { MomentOutcome, MomentoTrigger, NarrativeEvent } from '@/features/narrative'
import { useProgramStore } from '@/features/program'
import { applyMomentToResult } from '@/features/competition'
import type { CompetitionResult } from '@/types/season'
import { MomentOverlay, ScoreCard } from '@/components/ui'
import type { ProgramElement } from '@/types/program'

const REVEAL_DELAY_MS = 600

export function Competition() {
  const navigate = useNavigate()
  const { skater, season } = useGameStore(
    useShallow(s => ({ skater: s.currentSkater, season: s.currentSeason })),
  )
  const triggerMoment = useNarrativeStore(s => s.triggerMoment)
  const resolveChoice = useNarrativeStore(s => s.resolveChoice)

  const program = useMemo(() => {
    if (!skater || !season) return null
    return useProgramStore.getState().getProgram(skater.id, 'libre', season.temporadaNumero)
        ?? useProgramStore.getState().getProgram(skater.id, 'corto', season.temporadaNumero)
  }, [skater, season])

  const initialResult = useMemo<CompetitionResult | null>(() => {
    if (!season || !skater) return null
    const owned = season.resultadosTemporada.filter(r => r.skaterId === skater.id)
    return owned[owned.length - 1] ?? null
  }, [season, skater])

  const [liveResult, setLiveResult] = useState<CompetitionResult | null>(initialResult)
  const [revealedIndex, setRevealedIndex] = useState(0)
  const [moment, setMoment] = useState<NarrativeEvent | null>(null)
  const triggeredFor = useRef<Set<MomentoTrigger>>(new Set())
  const elementCount = program?.elementos.length ?? 0

  useEffect(() => {
    if (!program || moment) return
    if (revealedIndex >= elementCount) return
    const id = window.setTimeout(() => {
      const trigger = pickTriggerForIndex(revealedIndex, elementCount)
      if (trigger && !triggeredFor.current.has(trigger) && skater && season) {
        triggeredFor.current.add(trigger)
        const ev = triggerMoment(trigger, {
          skater, season,
          narrativeFlags: useNarrativeStore.getState().narrativeFlags,
          emittedEvents:  useNarrativeStore.getState().emittedEvents,
        })
        if (ev) {
          setMoment(ev)
          return
        }
      }
      setRevealedIndex(i => i + 1)
    }, REVEAL_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [revealedIndex, elementCount, moment, program, skater, season, triggerMoment])

  function handleMomentChoice(optionId: string) {
    const outcome = resolveChoice(optionId)
    setMoment(null)
    if (!outcome || !('goeBonusCurrent' in outcome)) {
      setRevealedIndex(i => i + 1)
      return
    }
    applyMomentMechanics(outcome as MomentOutcome, revealedIndex, program?.elementos ?? [], setLiveResult)
    setRevealedIndex(i => i + 1)
  }

  function handleContinue() {
    const gs = useGameStore.getState()
    if (liveResult && season) {
      const list = season.resultadosTemporada.map(r =>
        r.id === liveResult.id ? liveResult : r,
      )
      gs.applyWeekTransition({ season: { resultadosTemporada: list } })
    }
    gs.changeState(GameState.WEEKLY_PLANNING)
    navigate('/semana', { replace: true })
  }

  if (!skater || !season || !program || !liveResult) {
    return (
      <div className="flex min-h-screen items-center justify-center glace-vignette">
        <p className="font-display italic text-content-secondary">No hay competición lista.</p>
      </div>
    )
  }

  const elements = program.elementos
  const revealedCount = Math.min(revealedIndex, elements.length)
  const finished = revealedCount >= elements.length

  return (
    <div className="relative flex min-h-screen flex-col bg-bg-deep glace-grain">

      {/* HEADER — competition name as the protagonist */}
      <header className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-12 items-end gap-6 px-10 pt-10 pb-6">
        <div className="col-span-12 flex items-baseline gap-4">
          <span className="glace-eyebrow text-gold">— competición</span>
          <span className="glace-hairline flex-1" />
          <span className="glace-eyebrow text-content-disabled">
            semana {String(season.semanaActual).padStart(2, '0')} · {liveResult.tipo}
          </span>
        </div>
        <div className="col-span-12 md:col-span-9 flex flex-col gap-1">
          <h1 className="glace-reveal-letter font-display text-7xl leading-[0.9] text-content-primary">
            {liveResult.nombreCompeticion}
          </h1>
          <p className="font-display italic text-lg text-content-secondary">
            {skater.name} sale a la pista
          </p>
        </div>
      </header>

      {/* MAIN — rink (8 cols) + element list (4 cols) */}
      <main className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 grid-cols-12 gap-x-8 gap-y-6 px-10 pb-32">

        <section className="col-span-12 md:col-span-8 flex flex-col">
          <RinkView progress={revealedCount / Math.max(1, elements.length)} muted={moment !== null} />
        </section>

        <section className="col-span-12 md:col-span-4 flex flex-col gap-3 border-l border-border-subtle pl-6">
          <span className="glace-eyebrow">— ejecución</span>
          <ol className="flex flex-col gap-px bg-border-subtle">
            {elements.map((el, i) => (
              <li key={i}>
                <ElementCard element={el} revealed={i < revealedCount} index={i} />
              </li>
            ))}
          </ol>
        </section>

      </main>

      {/* FOOTER — gigantic scores */}
      <footer className="relative z-10 border-t border-border-subtle bg-bg-deep">
        <div className="mx-auto grid max-w-7xl grid-cols-12 items-end gap-x-8 gap-y-6 px-10 py-6">
          <div className="col-span-3"><ScoreCard label="tes"      value={liveResult.tes}    narrative accent="ice"   size="lg" /></div>
          <div className="col-span-3"><ScoreCard label="pcs"      value={liveResult.pcs}    narrative accent="frost" size="lg" /></div>
          <div className="col-span-3"><ScoreCard label="total"    value={liveResult.total}  narrative accent="gold"  size="xl" /></div>
          <div className="col-span-3 flex flex-col items-end gap-3">
            <ScoreCard label="posición" value={`${liveResult.posicion}º`} narrative size="lg" />
          </div>

          <div className="col-span-12 grid grid-cols-12 items-baseline gap-6 border-t border-border-subtle pt-4">
            <p className="col-span-9 font-display italic text-lg text-content-secondary">
              {flavorComment(liveResult)}
            </p>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!finished || moment !== null}
              className="group col-span-3 flex items-baseline justify-end gap-3 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className={[
                'glace-eyebrow transition-colors',
                finished && !moment ? 'text-ice-300 group-hover:text-ice-200' : '',
              ].join(' ')}>
                {finished && !moment ? 'continuar' : 'esperando…'}
              </span>
              <span className="font-display text-3xl text-content-primary group-hover:text-ice-200 transition-colors">
                <span className="ml-2 inline-block transition-transform duration-300 group-hover:translate-x-2">→</span>
              </span>
            </button>
          </div>
        </div>
      </footer>

      {moment && <MomentOverlay event={moment} onChoose={handleMomentChoice} />}
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function pickTriggerForIndex(index: number, total: number): MomentoTrigger | null {
  if (total === 0) return null
  if (index === 0) return 'early'
  if (index === Math.floor(total / 2)) return 'mid'
  if (index === Math.max(0, total - 2)) return 'late'
  return null
}

function applyMomentMechanics(
  outcome: MomentOutcome,
  fromIndex: number,
  elements: readonly ProgramElement[],
  setLiveResult: React.Dispatch<React.SetStateAction<CompetitionResult | null>>,
) {
  const gs = useGameStore.getState()
  setLiveResult(prev => prev ? applyMomentToResult(prev, outcome, fromIndex, elements) : prev)
  if (outcome.bondDelta !== 0 && gs.currentSkater) {
    gs.applyWeekTransition({
      skater: {
        weeklyState: {
          ...gs.currentSkater.weeklyState,
          vinculo: clamp(gs.currentSkater.weeklyState.vinculo + outcome.bondDelta),
        },
      },
    })
  }
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

function flavorComment(result: CompetitionResult): string {
  if (result.caidas > 1) return 'una actuación irregular: el público nota que algo no fluyó.'
  if (result.total > 200) return 'un programa que dejó marca. se nota el oficio.'
  if (result.total > 150) return 'una actuación sólida: lo construido en la pista paga.'
  return 'hay materia para revisar al volver al hielo.'
}

// ─── child views ─────────────────────────────────────────────────────────────

function RinkView({ progress, muted }: { progress: number; muted: boolean }) {
  const pct = Math.max(0, Math.min(1, progress))
  const theta = pct * Math.PI * 2
  const cx = 50 + 38 * Math.cos(theta)
  const cy = 50 + 22 * Math.sin(theta)

  // tail trail — a small set of fading points behind the leading point
  const trail = Array.from({ length: 8 }, (_, k) => {
    const t = theta - (k + 1) * 0.08
    return {
      x: 50 + 38 * Math.cos(t),
      y: 50 + 22 * Math.sin(t),
      o: 0.6 - k * 0.07,
    }
  })

  return (
    <div className={[
      'flex aspect-[2/1] items-center justify-center transition-opacity duration-500',
      muted ? 'opacity-40' : 'opacity-100',
    ].join(' ')}>
      <svg viewBox="0 0 100 50" className="h-full w-full">
        <defs>
          <radialGradient id="rink-glow" cx="50%" cy="50%">
            <stop offset="0%"   stopColor="rgba(78,159,200,0.10)" />
            <stop offset="100%" stopColor="rgba(78,159,200,0)" />
          </radialGradient>
        </defs>
        {/* atmospheric backdrop */}
        <rect x="0" y="0" width="100" height="50" fill="url(#rink-glow)" />
        {/* outer rink */}
        <ellipse cx={50} cy={25} rx={42} ry={20} fill="none" stroke="var(--c-border)" strokeWidth={0.25} />
        {/* skater path */}
        <ellipse cx={50} cy={25} rx={38} ry={11} fill="none" stroke="var(--c-ice-600)" strokeOpacity={0.4} strokeWidth={0.2} strokeDasharray="0.8 1.4" />
        {/* trail */}
        {trail.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y / 2 + 12.5}
            r={1.0 - i * 0.1}
            fill="var(--c-ice-400)"
            opacity={p.o}
          />
        ))}
        {/* skater */}
        <circle cx={cx} cy={cy / 2 + 12.5} r={1.4} fill="var(--c-ice-300)">
          <animate attributeName="r" values="1.2;1.8;1.2" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  )
}

function ElementCard({
  element, revealed, index,
}: { element: ProgramElement; revealed: boolean; index: number }) {
  return (
    <div
      className={[
        'flex items-baseline justify-between gap-4 bg-bg-deep px-3 py-3 transition-opacity duration-500',
        revealed ? 'opacity-100' : 'opacity-30',
      ].join(' ')}
    >
      <span className="font-display tabular-nums text-2xl text-content-disabled leading-none w-7">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex-1">
        <p className="font-display text-base text-content-primary leading-tight">
          {element.tipo === 'salto'
            ? `${element.rotaciones}T ${element.tipoSalto}`
            : element.tipo}
          {element.esCombinacion && (
            <span className="ml-2 text-xs uppercase tracking-widest text-ice-300">combo</span>
          )}
        </p>
      </div>
      <span className="font-display tabular-nums text-sm text-content-muted leading-none">
        {element.dificultadBase.toFixed(1)}
      </span>
    </div>
  )
}
