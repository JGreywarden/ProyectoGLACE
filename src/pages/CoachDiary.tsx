// Diario del entrenador — chronological log of every player decision so the
// player can see how their choices have shaped the relationship with the skater.
// reads from useNarrativeStore.decisionHistory; selectors target specific fields
// to avoid re-renders when unrelated narrative state mutates (norm D4).

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useGameStore } from '@/stores/gameStore'
import { useNarrativeStore } from '@/features/narrative'
import type { DecisionRecord, NarrativeEventType } from '@/features/narrative'

// ─── filters ────────────────────────────────────────────────────────────────

type SeasonFilter = number | 'all'
type TipoFilter   = NarrativeEventType | 'all'
type SkaterFilter = string | 'all'

const TIPO_LABEL: Record<NarrativeEventType, string> = {
  revelacion:           'revelación',
  crisis:               'crisis',
  decision_moral:       'decisión moral',
  terceros:             'terceros',
  cotidiano:            'cotidiano',
  logro_compartido:     'logro compartido',
  momento_competicion:  'momento de competición',
}

// ─── component ──────────────────────────────────────────────────────────────

export function CoachDiary() {
  const navigate = useNavigate()
  // only the skater name is consumed in this view; subscribe to the primitive
  // so that any other mutation on currentSkater (fatiga, vínculo…) skips this render
  const skaterName = useGameStore(s => s.currentSkater?.name)
  // narrow selectors so unrelated narrative mutations (currentEvent, lastContext)
  // do not re-render the diary while the player is reviewing it
  const decisionHistory = useNarrativeStore(s => s.decisionHistory)

  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('all')
  const [tipoFilter,   setTipoFilter]   = useState<TipoFilter>('all')
  const [skaterFilter, setSkaterFilter] = useState<SkaterFilter>('all')

  const seasons = useMemo(() => {
    const set = new Set<number>()
    for (const d of decisionHistory) set.add(d.season)
    return [...set].sort((a, b) => a - b)
  }, [decisionHistory])

  const skaterIds = useMemo(() => {
    const set = new Set<string>()
    for (const d of decisionHistory) set.add(d.skaterId)
    return [...set]
  }, [decisionHistory])

  const filtered = useMemo(() => {
    return decisionHistory
      .filter(d =>
        (seasonFilter === 'all' || d.season   === seasonFilter) &&
        (tipoFilter   === 'all' || d.eventTipo === tipoFilter)   &&
        (skaterFilter === 'all' || d.skaterId  === skaterFilter),
      )
      // newest first — the player usually wants to see what just happened
      .slice()
      .sort((a, b) => b.season - a.season || b.week - a.week)
  }, [decisionHistory, seasonFilter, tipoFilter, skaterFilter])

  // chain detection: a record "ramificó" if its flagsAlterados appear later
  const branchesByDecisionId = useMemo(() => {
    const result = new Map<string, number>()
    for (let i = 0; i < decisionHistory.length; i++) {
      const d = decisionHistory[i]
      if (d.flagsAlterados.length === 0) continue
      let count = 0
      for (let j = i + 1; j < decisionHistory.length; j++) {
        const later = decisionHistory[j]
        if (later.skaterId !== d.skaterId) continue
        if (later.flagsAlterados.some(f => d.flagsAlterados.includes(f))) count++
      }
      if (count > 0) result.set(d.id, count)
    }
    return result
  }, [decisionHistory])

  return (
    <div className="relative min-h-screen glace-vignette glace-grain">
      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl grid-cols-12 gap-x-10 px-12 pt-10 pb-32">

        {/* topline */}
        <div className="col-span-12 mb-8 flex items-baseline gap-4">
          <span className="glace-eyebrow">— diario del entrenador</span>
          <span className="glace-hairline flex-1" />
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="glace-eyebrow text-content-disabled hover:text-ice-300 transition-colors"
          >
            volver →
          </button>
        </div>

        {/* hero */}
        <header className="col-span-12 mb-12 flex flex-col gap-3">
          <h1 className="glace-reveal-letter font-display text-6xl text-content-primary leading-[0.9]">
            Lo que has decidido
          </h1>
          <p className="font-display italic text-lg text-content-secondary max-w-2xl">
            Cada conversación, cada elección bajo presión.
            {skaterName && <> {skaterName} recuerda más de lo que crees.</>}
          </p>
        </header>

        {/* filters */}
        <section className="col-span-12 mb-8 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-border-subtle py-4">
          <FilterRow label="temporada">
            <FilterChip active={seasonFilter === 'all'} onClick={() => setSeasonFilter('all')}>todas</FilterChip>
            {seasons.map(s => (
              <FilterChip key={s} active={seasonFilter === s} onClick={() => setSeasonFilter(s)}>
                {String(s).padStart(2, '0')}
              </FilterChip>
            ))}
          </FilterRow>

          <FilterRow label="tipo">
            <FilterChip active={tipoFilter === 'all'} onClick={() => setTipoFilter('all')}>todos</FilterChip>
            {(Object.keys(TIPO_LABEL) as NarrativeEventType[]).map(t => (
              <FilterChip key={t} active={tipoFilter === t} onClick={() => setTipoFilter(t)}>
                {TIPO_LABEL[t]}
              </FilterChip>
            ))}
          </FilterRow>

          {skaterIds.length > 1 && (
            <FilterRow label="patinador">
              <FilterChip active={skaterFilter === 'all'} onClick={() => setSkaterFilter('all')}>todos</FilterChip>
              {skaterIds.map(id => (
                <FilterChip key={id} active={skaterFilter === id} onClick={() => setSkaterFilter(id)}>
                  {id}
                </FilterChip>
              ))}
            </FilterRow>
          )}
        </section>

        {/* body */}
        <section className="col-span-12 flex flex-col">
          {filtered.length === 0
            ? <EmptyState totalDecisions={decisionHistory.length} />
            : (
              <ol className="flex flex-col">
                {filtered.map(d => (
                  <DecisionRow
                    key={d.id}
                    decision={d}
                    branched={branchesByDecisionId.get(d.id) ?? 0}
                  />
                ))}
              </ol>
            )
          }
        </section>
      </div>
    </div>
  )
}

// ─── child views ─────────────────────────────────────────────────────────────

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="glace-eyebrow text-content-disabled">{label}</span>
      <div className="flex flex-wrap items-baseline gap-2">{children}</div>
    </div>
  )
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'font-display italic text-sm transition-colors',
        active
          ? 'text-ice-300 border-b border-ice-300'
          : 'text-content-muted hover:text-ice-200',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function EmptyState({ totalDecisions }: { totalDecisions: number }) {
  if (totalDecisions === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <span className="glace-eyebrow text-content-disabled">— diario en blanco —</span>
        <p className="font-display italic text-2xl text-content-secondary max-w-xl">
          aún no has tomado ninguna decisión. la primera la encontrarás cuando salte el primer evento.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <span className="glace-eyebrow text-content-disabled">— sin resultados —</span>
      <p className="font-display italic text-2xl text-content-secondary max-w-xl">
        ningún registro encaja con los filtros activos.
      </p>
    </div>
  )
}

function DecisionRow({
  decision, branched,
}: { decision: DecisionRecord; branched: number }) {
  return (
    <li className="grid grid-cols-12 items-baseline gap-6 border-b border-border-subtle py-5">
      <div className="col-span-1 flex flex-col gap-0.5">
        <span className="glace-eyebrow text-content-disabled">s{decision.season}</span>
        <span className="font-display tabular-nums text-3xl text-ice-300 leading-none">
          {String(decision.week).padStart(2, '0')}
        </span>
      </div>

      <div className="col-span-11 flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <span className="glace-eyebrow text-gold">{TIPO_LABEL[decision.eventTipo]}</span>
          {branched > 0 && (
            <span className="glace-eyebrow text-frost-400">— ramificó {branched}</span>
          )}
        </div>
        <h2 className="font-display text-3xl text-content-primary leading-tight">
          {decision.eventTitulo}
        </h2>
        <p className="font-display italic text-lg text-content-secondary leading-snug">
          tu elección · «{decision.optionTexto}»
        </p>
        {decision.consecuenciasResumidas && (
          <p className="font-display italic text-sm text-content-muted leading-snug">
            consecuencias · {decision.consecuenciasResumidas}
          </p>
        )}
      </div>
    </li>
  )
}
