import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/shallow'

import { GameState, useGameStore } from '@/stores/gameStore'
import {
  ACTIVITY_DEFINITIONS,
  resolveWeekEffects,
  useTrainingStore,
  type ActivityId,
} from '@/features/training'
import { BondMeter, SaveSlotPicker } from '@/components/ui'
import type { InstallationId, InstallationLevel } from '@/types/club'

const ACTIVITIES: ActivityId[] = ['tecnico', 'fisico', 'mental', 'descanso', 'ensayo', 'dialogo']

// roman numerals up to 5 — slots are abstract trade-offs, not days; the roman
// notation reinforces the "five movements of a week" feel without naming them
const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const

const FASE_LABEL: Record<string, string> = {
  Construccion: 'construcción',
  Activacion:   'activación',
  Pico:         'pico',
  Rearme:       'rearme',
  Cierre:       'cierre',
}

// short subtitle for each activity — adds a flavour line under the activity name
const ACTIVITY_VOICE: Record<ActivityId, string> = {
  tecnico:  'sobre el hielo · saltos, giros, pasos',
  fisico:   'fuera del hielo · resistencia y fuerza',
  mental:   'la cabeza primero',
  descanso: 'no hacer es también una decisión',
  ensayo:   'el programa pide cuerpo',
  dialogo:  'la única vía de revelación',
}

const TENSION_LABEL: Record<string, string> = {
  tecnico_vs_descanso:        'técnico sin descanso',
  ensayo_vs_pre_competicion:  'ensayo escaso antes de competir',
  dialogo_vs_hielo:           'silencio prolongado · vínculo en caída',
  carga_vs_pico:              'carga alta antes de competición',
  ensayo_vs_espontaneidad:    'ensayo en bucle · pierde frescura',
  paradoja_descanso_emocional:'descanso con estrés muy alto',
}

export function WeeklyPlanning() {
  const navigate = useNavigate()
  const { skater, club, season } = useGameStore(
    useShallow(s => ({
      skater: s.currentSkater,
      club:   s.currentClub,
      season: s.currentSeason,
    })),
  )
  const schedule = useTrainingStore(s =>
    skater ? s.schedules[skater.id] : undefined,
  )
  const setSlot       = useTrainingStore(s => s.setSlot)
  const clearSchedule = useTrainingStore(s => s.clearSchedule)

  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const [saveOpen,    setSaveOpen]   = useState(false)
  const [loadOpen,    setLoadOpen]   = useState(false)

  useEffect(() => {
    if (skater && !schedule) clearSchedule(skater.id)
  }, [skater, schedule, clearSchedule])

  const slots = schedule?.slots ?? Array.from({ length: 5 }, (_, i) => ({ index: i, activityId: null }))

  const installationLevels = useMemo<Partial<Record<InstallationId, InstallationLevel>>>(() => {
    if (!club) return {}
    return Object.fromEntries(club.instalaciones.map(i => [i.id, i.nivel]))
  }, [club])
  const projection = useMemo(() => {
    if (!skater || !season || !schedule) return null
    return resolveWeekEffects(schedule, skater, season, installationLevels, () => 0.5)
  }, [skater, season, schedule, installationLevels])

  if (!skater || !club || !season) {
    return (
      <div className="flex min-h-screen items-center justify-center glace-vignette">
        <p className="font-display italic text-content-secondary">No hay partida activa.</p>
      </div>
    )
  }

  function pickActivity(slotIndex: number, activityId: ActivityId) {
    setSlot(skater!.id, slotIndex, activityId)
    setPickerSlot(null)
  }
  function clearActivity(slotIndex: number) {
    setSlot(skater!.id, slotIndex, null)
    setPickerSlot(null)
  }
  function advanceWeek() {
    // end-of-season catch: once 30 weeks are in the history we can't process
    // a 31st (validators forbid semana > 30). Route straight to SEASON_END.
    // Also covers the case where a comp/event week wrapped up at week 30 and
    // would otherwise re-process week 30 forever.
    if (season!.semanaActual > 30 || season!.historialSemanas.length >= 30) {
      useGameStore.getState().changeState(GameState.SEASON_END)
      navigate('/fin-temporada', { replace: true })
      return
    }
    useGameStore.getState().changeState(GameState.WEEK_PROCESSING)
    navigate('/procesando', { replace: true })
  }

  const fatigueProj = (skater.weeklyState.fatigaAcumulada ?? 0) + (projection?.fatigueDelta ?? 0)
  const stressProj  = (skater.weeklyState.estres ?? 0) + (projection?.stressDelta ?? 0)
  const isCompetitionWeek = season.calendario.some(
    c => c.semana === season.semanaActual && c.clasificado,
  )
  const nextComp = season.calendario
    .filter(c => c.clasificado && c.semana >= season.semanaActual)
    .sort((a, b) => a.semana - b.semana)[0]
  const filledCount = slots.filter(s => s.activityId !== null).length

  return (
    <div className="relative min-h-screen glace-vignette glace-grain">

      {/* ─── decorative side margin: vertical numeration like a play programme ── */}
      <div className="pointer-events-none fixed left-6 top-0 hidden h-screen flex-col items-center justify-center gap-3 lg:flex">
        <span className="glace-eyebrow [writing-mode:vertical-rl] rotate-180 text-content-disabled">
          glacé · acto i · escena {String(season.semanaActual).padStart(2, '0')} de 30
        </span>
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl grid-cols-12 gap-x-10 px-12 lg:pl-20 pt-10 pb-44">

        {/* ─── topline ──────────────────────────────────────────────────────── */}
        <div className="col-span-12 mb-8 flex items-baseline gap-4">
          <span className="glace-eyebrow">— hub semanal</span>
          <span className="glace-hairline flex-1" />
          <span className="glace-eyebrow text-content-disabled">
            temporada {String(season.temporadaNumero).padStart(2, '0')} · {FASE_LABEL[season.faseActual] ?? season.faseActual}
          </span>
          {isCompetitionWeek && (
            <span className="glace-eyebrow text-gold">— hoy se compite</span>
          )}
        </div>

        {/* ─── HERO: week number stage — number bleeds across cols 1-7,
              skater name and standfirst sit on cols 7-12, slightly higher ──── */}
        <header className="col-span-12 mb-16 grid grid-cols-12 items-end gap-x-8">
          <div className="col-span-12 md:col-span-7 relative">
            <span className="glace-eyebrow absolute -top-3 left-1 text-content-disabled">
              semana
            </span>
            <span
              className="glace-number glace-reveal-letter block text-content-primary"
              style={{ fontSize: 'clamp(10rem, 22vw, 22rem)' }}
            >
              {String(season.semanaActual).padStart(2, '0')}
            </span>
            {/* tiny ornament under the number */}
            <div className="mt-2 flex items-baseline gap-3 text-content-disabled">
              <span className="font-display tabular-nums text-base italic">
                de {String(30).padStart(2, '0')}
              </span>
              <span className="glace-hairline w-24" />
              <span className="font-display italic text-base">
                {season.semanaActual <= 8 ? 'el cuerpo aún se asienta' :
                 season.semanaActual <= 14 ? 'los programas comienzan a sostenerse' :
                 season.semanaActual <= 22 ? 'lo que importa empieza a medirse' :
                 season.semanaActual <= 26 ? 'entre el último gran resultado y la temporada que viene' :
                 'la temporada ya solo se cierra'}
              </span>
            </div>
          </div>

          <div className="col-span-12 md:col-span-5 flex flex-col gap-3 pb-2">
            <span className="glace-eyebrow">— bajo tu mirada</span>
            <h1 className="glace-reveal font-display text-6xl leading-[0.92] text-content-primary">
              {skater.name}
            </h1>
            <p className="glace-reveal glace-stagger-1 font-display italic text-lg leading-snug text-content-secondary">
              {isCompetitionWeek ? (
                <>esta semana se sale a la pista. lo construido las semanas anteriores se mide hoy.</>
              ) : nextComp ? (
                <>la próxima competición — <span className="text-ice-300">{nextComp.nombreCompeticion.toLowerCase()}</span> — está a {nextComp.semana - season.semanaActual} {nextComp.semana - season.semanaActual === 1 ? 'semana' : 'semanas'}.</>
              ) : (
                <>cinco ranuras. seis tensiones posibles. lo que decidas hoy se ve en la pista en quince días.</>
              )}
            </p>
          </div>
        </header>

        {/* ─── BODY: 8/4 split. Itinerary on left, side rail on right. ──────── */}

        {/* itinerary */}
        <section className="col-span-12 md:col-span-8 flex flex-col">
          <div className="mb-3 flex items-baseline justify-between border-b border-border-subtle pb-2">
            <span className="glace-eyebrow">— itinerario de la semana</span>
            <span className="font-display italic text-sm text-content-muted">
              {filledCount}<span className="text-content-disabled"> / 5 asignadas</span>
            </span>
          </div>

          <ol className="flex flex-col">
            {slots.map((slot, i) => {
              const open = pickerSlot === slot.index
              const empty = slot.activityId === null
              return (
                <li
                  key={slot.index}
                  className={`glace-reveal glace-stagger-${Math.min(i + 1, 6)}`}
                >
                  <button
                    type="button"
                    onClick={() => setPickerSlot(open ? null : slot.index)}
                    className={[
                      'group grid w-full grid-cols-[3.5rem_1fr_auto] items-baseline gap-6',
                      'border-b py-5 text-left transition-all duration-300',
                      open
                        ? 'border-b-ice-300 bg-ice-500/[0.04]'
                        : 'border-b-border-subtle hover:border-b-ice-500',
                    ].join(' ')}
                  >
                    <span className={[
                      'font-display text-3xl tracking-wider leading-none transition-colors',
                      empty ? 'text-content-disabled' : open ? 'text-ice-300' : 'text-content-secondary group-hover:text-ice-300',
                    ].join(' ')}>
                      {ROMAN[i]}
                    </span>

                    <div className="flex flex-col gap-1">
                      <span className={[
                        'font-display text-3xl leading-none',
                        empty ? 'italic text-content-muted' : 'text-content-primary',
                      ].join(' ')}>
                        {empty ? 'sin asignar' : ACTIVITY_DEFINITIONS[slot.activityId!].label.toLowerCase()}
                      </span>
                      <span className="font-display italic text-sm text-content-muted">
                        {empty
                          ? 'elige una de las seis actividades'
                          : ACTIVITY_VOICE[slot.activityId!]}
                      </span>
                    </div>

                    <span className={[
                      'font-display text-2xl leading-none transition-all duration-300',
                      open ? 'text-ice-300 rotate-90' : 'text-content-disabled group-hover:text-ice-400',
                    ].join(' ')}>
                      ›
                    </span>
                  </button>

                  {/* expanded picker */}
                  {open && (
                    <div className="overflow-hidden border-b border-border-subtle bg-bg-base/40 px-14 py-5">
                      <span className="glace-eyebrow">— elige</span>
                      <div className="mt-3 grid grid-cols-2 gap-x-12 gap-y-2 md:grid-cols-3">
                        {ACTIVITIES.map(a => (
                          <button
                            key={a}
                            type="button"
                            onClick={() => pickActivity(slot.index, a)}
                            className="group flex flex-col gap-0.5 text-left"
                          >
                            <span className="font-display text-2xl text-content-secondary group-hover:text-ice-200 transition-colors">
                              {ACTIVITY_DEFINITIONS[a].label.toLowerCase()}
                            </span>
                            <span className="font-display italic text-xs text-content-muted">
                              {ACTIVITY_VOICE[a]}
                            </span>
                          </button>
                        ))}
                      </div>
                      {!empty && (
                        <button
                          type="button"
                          onClick={() => clearActivity(slot.index)}
                          className="mt-4 glace-eyebrow text-content-muted hover:text-danger transition-colors"
                        >
                          — vaciar esta ranura
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        {/* side rail */}
        <aside className="col-span-12 md:col-span-4 flex flex-col gap-12 md:pl-10 md:border-l md:border-border-subtle md:-ml-px">

          {/* projection */}
          <div className="flex flex-col gap-4 glace-reveal glace-stagger-2">
            <span className="glace-eyebrow">— proyección semanal</span>
            <ProjRow label="fatiga"   value={projection?.fatigueDelta ?? 0} />
            <ProjRow label="estrés"   value={projection?.stressDelta ?? 0} />
            <ProjRow label="vínculo"  value={projection?.bondDelta ?? 0} />
            <ProjRow label="cohesión" value={projection?.cohesionDelta ?? 0} />
          </div>

          {/* tensions, only when present — empty state is silence (no UI) */}
          {projection && projection.tensionsTriggered.length > 0 && (
            <div className="flex flex-col gap-3 border-l-2 border-l-gold pl-5 -ml-5 glace-reveal glace-stagger-3">
              <span className="glace-eyebrow text-gold">
                — {projection.tensionsTriggered.length} tensión{projection.tensionsTriggered.length > 1 ? 'es' : ''} detectada{projection.tensionsTriggered.length > 1 ? 's' : ''}
              </span>
              <ul className="flex flex-col gap-1.5 font-display italic text-base text-content-secondary leading-snug">
                {projection.tensionsTriggered.map(t => (
                  <li key={t} className="flex items-baseline gap-2">
                    <span className="text-content-disabled">·</span>
                    <span>{TENSION_LABEL[t] ?? t.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* nav */}
          <nav className="flex flex-col gap-2 glace-reveal glace-stagger-4">
            <span className="glace-eyebrow">— consultar</span>
            <NavLine label="ficha del patinador" onClick={() => navigate('/ficha')} />
            <NavLine label="calendario isu" onClick={() => navigate('/calendario')} />
          </nav>

          {/* persistence */}
          <nav className="flex flex-col gap-2 glace-reveal glace-stagger-5">
            <span className="glace-eyebrow">— partida</span>
            <NavLine label="guardar partida" onClick={() => setSaveOpen(true)} />
            <NavLine label="cargar partida" onClick={() => setLoadOpen(true)} />
          </nav>

        </aside>

      </div>

      {/* ─── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-border-subtle bg-bg-deep/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-7xl grid-cols-12 items-end gap-x-8 px-12 lg:pl-20 py-5">

          <Vital label="fatiga" value={fatigueProj} max={100} accent="ice"  className="col-span-2" />
          <Vital label="estrés" value={stressProj}  max={100} accent="gold" className="col-span-2" />
          <div className="col-span-3">
            <BondMeter value={skater.weeklyState.vinculo} compact />
          </div>
          <Vital
            label="presupuesto"
            value={club.presupuestoReservas}
            max={100_000}
            accent="frost"
            formatter={n => `${Math.round(n).toLocaleString('es-ES')} €`}
            className="col-span-2"
          />

          <button
            type="button"
            onClick={advanceWeek}
            className="group col-span-3 flex items-baseline justify-end gap-3 self-end pb-1"
          >
            <span className="flex flex-col items-end gap-0.5">
              <span className="glace-eyebrow text-ice-300 group-hover:text-ice-200 transition-colors">
                — avanzar a la semana
              </span>
              <span className="font-display tabular-nums text-4xl text-content-primary group-hover:text-ice-200 transition-colors leading-none">
                {String((season.semanaActual ?? 0) + 1).padStart(2, '0')}
              </span>
            </span>
            <span className="text-2xl text-ice-300 transition-transform duration-300 group-hover:translate-x-2">→</span>
          </button>

        </div>
      </footer>

      {saveOpen && (
        <SaveSlotPicker
          mode="save"
          onClose={() => setSaveOpen(false)}
          onSaved={() => { /* keep open so the player sees the confirmation chip */ }}
        />
      )}
      {loadOpen && (
        <SaveSlotPicker
          mode="load"
          onClose={() => setLoadOpen(false)}
          onLoaded={() => navigate('/sesion', { replace: true })}
        />
      )}
    </div>
  )
}

// ─── helpers ───────────────────────────────────────────────────────────────

function ProjRow({ label, value }: { label: string; value: number }) {
  const sign = value > 0 ? '+' : value < 0 ? '' : '±'
  const color = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-content-disabled'
  return (
    <div className="flex items-baseline justify-between border-b border-border-subtle/60 py-2">
      <span className="font-display italic text-base text-content-secondary">{label}</span>
      <span className={`font-display tabular-nums text-3xl leading-none ${color}`}>
        {sign}{Math.round(value)}
      </span>
    </div>
  )
}

function NavLine({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-baseline justify-between border-b border-border-subtle py-2 text-left"
    >
      <span className="font-display text-xl italic text-content-secondary group-hover:text-ice-300 transition-colors">
        {label}
      </span>
      <span className="text-content-disabled group-hover:text-ice-300 group-hover:translate-x-1 transition-all">
        →
      </span>
    </button>
  )
}

function Vital({
  label, value, max, accent = 'ice', formatter, className = '',
}: {
  label: string
  value: number
  max: number
  accent?: 'ice' | 'gold' | 'frost'
  formatter?: (n: number) => string
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const color = { ice: 'bg-ice-300', gold: 'bg-gold', frost: 'bg-frost-400' }[accent]
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline justify-between">
        <span className="glace-eyebrow">{label}</span>
        <span className="font-display tabular-nums text-3xl text-content-primary leading-none">
          {formatter ? formatter(value) : Math.round(value)}
        </span>
      </div>
      <div className="relative h-px w-full bg-border-subtle">
        <div className={`absolute left-0 top-0 h-px ${color}`} style={{ width: `${pct}%` }} />
        <span className={`absolute top-1/2 -translate-y-1/2 h-2 w-px ${color}`} style={{ left: `calc(${pct}% - 0.5px)` }} />
      </div>
    </div>
  )
}
