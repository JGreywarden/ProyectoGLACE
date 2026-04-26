import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { GameState, useGameStore } from '@/stores/gameStore'
import { DEFAULT_COACH_DATA, type CoachData } from '@/types/coach'
import { DEFAULT_CLUB_DATA } from '@/types/club'
import { DEFAULT_SEASON_DATA, type CompetitionSlot, getFasePorSemana } from '@/types/season'
import { useNarrativeStore } from '@/features/narrative'
import {
  loadProspectPool,
  pickProspects,
  profileToSkater,
  POTENCIAL_LABEL,
} from '@/services/prospectService'
import type { SkaterProfile } from '@/services/dataService'

// ─── gender ──────────────────────────────────────────────────────────────────

type Gender = 'el' | 'ella'

/** picks the right grammatical form for the chosen gender */
const g = (gender: Gender, masc: string, fem: string): string =>
  gender === 'el' ? masc : fem

// ─── coach-defining questions ────────────────────────────────────────────────
//
// each answer pushes one rama up by Q_BRANCH_WEIGHT and bumps a reputacion axis
// by Q_REP_BUMP. Final perfilInferido is renormalised so the three ramas sum
// to 1.0 — required by validateCoachData.
//
// the goal is not to give the player a single "build", but to capture the early
// posture (Acto I, primeros 40 minutos) that the GDD treats as foundational.

type Rama       = 'tecnica' | 'psicologica' | 'directiva'
type RepKey     = keyof CoachData['reputacion']

interface AnswerImpact {
  rama:    Rama
  repBump: { key: RepKey; amount: number }[]
  flag:    string
}

interface QuestionOption {
  id:          string
  label:       (gender: Gender) => string
  description: string
  impact:      AnswerImpact
}

interface Question {
  id:      string
  prompt:  (gender: Gender) => string
  options: QuestionOption[]
}

const Q_BRANCH_WEIGHT = 0.10  // per matching answer; renormalised after all answers
const Q_REP_BUMP_S    = 5
const Q_REP_BUMP_M    = 8

const QUESTIONS: readonly Question[] = [
  {
    id: 'background',
    prompt: (gender) => `¿De dónde vienes como ${g(gender, 'entrenador', 'entrenadora')}?`,
    options: [
      {
        id: 'atleta',
        label: (gender) => `Atleta de élite ${g(gender, 'reconvertido', 'reconvertida')}`,
        description: 'Sabes lo que cuesta un cuádruple porque lo intentaste mil veces.',
        impact: {
          rama: 'tecnica',
          repBump: [{ key: 'repResultados', amount: Q_REP_BUMP_M }],
          flag: 'background:atleta',
        },
      },
      {
        id: 'psicologa',
        label: (gender) => `${g(gender, 'Psicólogo', 'Psicóloga')} ${g(gender, 'deportivo', 'deportiva')} que se cruzó con el hielo`,
        description: 'Trabajaste años con la cabeza antes de pisar una pista.',
        impact: {
          rama: 'psicologica',
          repBump: [{ key: 'repCuidado', amount: Q_REP_BUMP_M }],
          flag: 'background:psicologa',
        },
      },
      {
        id: 'gestora',
        label: (gender) => `${g(gender, 'Gestor', 'Gestora')} ${g(gender, 'deportivo', 'deportiva')} que vio una oportunidad`,
        description: 'Llegaste por la administración. Aprendiste el resto en el camino.',
        impact: {
          rama: 'directiva',
          repBump: [{ key: 'repInstitucional', amount: Q_REP_BUMP_M }],
          flag: 'background:gestora',
        },
      },
    ],
  },
  {
    id: 'noche-uno',
    prompt: () => '¿Qué te quita el sueño la primera noche?',
    options: [
      {
        id: 'cuerpo',
        label: () => 'Que el cuerpo no aguante el plan',
        description: 'Tu primera obligación es proteger lo que entrenas.',
        impact: {
          rama: 'tecnica',
          repBump: [{ key: 'repCuidado', amount: Q_REP_BUMP_S }],
          flag: 'noche:cuerpo',
        },
      },
      {
        id: 'cabeza',
        label: () => 'Que el carácter no aparezca cuando importe',
        description: 'Sabes que la pista solo dice lo que la cabeza permite decir.',
        impact: {
          rama: 'psicologica',
          repBump: [],
          flag: 'noche:cabeza',
        },
      },
      {
        id: 'numeros',
        label: () => 'Que el club no llegue a fin de mes',
        description: 'Sin estructura no hay deporte. Lo entendiste hace tiempo.',
        impact: {
          rama: 'directiva',
          repBump: [{ key: 'repInstitucional', amount: Q_REP_BUMP_S }],
          flag: 'noche:numeros',
        },
      },
    ],
  },
  {
    id: 'primera-comp',
    prompt: () => '¿Qué prefieres en la primera competición?',
    options: [
      {
        id: 'solvente',
        label: () => 'Resultado solvente, aunque conservador',
        description: 'Hay temporadas que se ganan no perdiendo.',
        impact: {
          rama: 'tecnica',
          repBump: [{ key: 'repResultados', amount: Q_REP_BUMP_S }],
          flag: 'comp:solvente',
        },
      },
      {
        id: 'memorable',
        label: () => 'Programa que se recuerde, aunque arriesgue',
        description: 'Que los jueces hablen de él de camino al hotel.',
        impact: {
          rama: 'psicologica',
          repBump: [{ key: 'repArtistica', amount: Q_REP_BUMP_S }],
          flag: 'comp:memorable',
        },
      },
      {
        id: 'limpia',
        label: () => 'Logística impecable y federación contenta',
        description: 'Si todo sale bien fuera del hielo, se nota dentro.',
        impact: {
          rama: 'directiva',
          repBump: [{ key: 'repInstitucional', amount: Q_REP_BUMP_S }],
          flag: 'comp:limpia',
        },
      },
    ],
  },
  {
    id: 'error-grave',
    prompt: () => '¿Cómo gestionas un error grave de tu patinador o patinadora?',
    options: [
      {
        id: 'repetir',
        label: () => 'Volver al hielo y repetir hasta que salga',
        description: 'El cuerpo aprende cuando la mente todavía está caliente.',
        impact: {
          rama: 'tecnica',
          repBump: [],
          flag: 'error:repetir',
        },
      },
      {
        id: 'hablar',
        label: () => 'Sentarse a hablar de qué pasó',
        description: 'Antes de corregir hay que entender desde dónde se cae.',
        impact: {
          rama: 'psicologica',
          repBump: [{ key: 'repCuidado', amount: Q_REP_BUMP_S }],
          flag: 'error:hablar',
        },
      },
      {
        id: 'plan',
        label: () => 'Revisar el plan y ajustar lo que haga falta',
        description: 'Si vuelve a pasar, es responsabilidad del sistema, no de la persona.',
        impact: {
          rama: 'directiva',
          repBump: [{ key: 'repHonestidad', amount: Q_REP_BUMP_S }],
          flag: 'error:plan',
        },
      },
    ],
  },
] as const

// ─── derived coach builder ───────────────────────────────────────────────────

function buildCoach(
  name: string,
  gender: Gender,
  answers: Record<string, AnswerImpact>,
): CoachData {
  // start from defaults, accumulate weight per rama and reputation bumps
  const weights: Record<Rama, number> = { tecnica: 1, psicologica: 1, directiva: 1 }
  const reputacion = { ...DEFAULT_COACH_DATA.reputacion }
  const flags: string[] = [`genero:${gender}`]

  for (const ans of Object.values(answers)) {
    weights[ans.rama] += Q_BRANCH_WEIGHT
    for (const r of ans.repBump) {
      reputacion[r.key] = clamp(reputacion[r.key] + r.amount, 0, 100)
    }
    flags.push(ans.flag)
  }

  const sum = weights.tecnica + weights.psicologica + weights.directiva
  const perfilInferido = {
    ramaTecnica:     weights.tecnica     / sum,
    ramaPsicologica: weights.psicologica / sum,
    ramaDirectiva:   weights.directiva   / sum,
  }

  return {
    ...DEFAULT_COACH_DATA,
    id:   `co_${Date.now().toString(36)}`,
    name: name.trim(),
    perfilInferido,
    legadoTotal: {
      ...DEFAULT_COACH_DATA.legadoTotal,
      medallas: [],
      eventosDefinitorios: [],
    },
    reputacion,
    arbolHabilidades:             {},
    flagsDecisionesFundacionales: flags,
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function generateDefaultCalendar(): CompetitionSlot[] {
  return [
    { semana: 8,  nombreCompeticion: 'Copa Otoño',         tipo: 'nacional',       clasificado: true },
    { semana: 14, nombreCompeticion: 'Grand Prix Skate',   tipo: 'grandprix',      clasificado: true },
    { semana: 20, nombreCompeticion: 'Final Grand Prix',   tipo: 'finalGrandprix', clasificado: true },
    { semana: 26, nombreCompeticion: 'Campeonato Mundial', tipo: 'mundial',        clasificado: true },
  ]
}

// ─── component ───────────────────────────────────────────────────────────────

type Step = 'name' | 'questions' | 'prospects'

export function CoachCreation() {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('name')
  const [coachName, setCoachName] = useState('')
  const [gender, setGender] = useState<Gender>('ella')
  const [answers, setAnswers] = useState<Record<string, AnswerImpact>>({})
  const [questionIdx, setQuestionIdx] = useState(0)
  const [prospects, setProspects] = useState<SkaterProfile[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // bootstrap prospects once we leave the name step. loadProspectPool is now
  // synchronous (compile-time JSON) so this can never fail with "Failed to fetch".
  useEffect(() => {
    if (step === 'name') return
    if (prospects) return
    setProspects(pickProspects(loadProspectPool(), 3))
  }, [step, prospects])

  const allAnswered = useMemo(
    () => QUESTIONS.every((q) => answers[q.id] !== undefined),
    [answers],
  )

  function commitName() {
    if (!coachName.trim()) {
      setError('Necesito un nombre para el entrenador o entrenadora.')
      return
    }
    setError(null)
    setStep('questions')
  }

  function answer(question: Question, optionIdx: number) {
    const opt = question.options[optionIdx]
    setAnswers((prev) => ({ ...prev, [question.id]: opt.impact }))
    if (questionIdx < QUESTIONS.length - 1) {
      setQuestionIdx((i) => i + 1)
    } else {
      setStep('prospects')
    }
  }

  function pickProspect(profile: SkaterProfile) {
    if (!allAnswered) {
      setError('Faltan respuestas en el cuestionario.')
      setStep('questions')
      return
    }
    const skater = profileToSkater(profile)
    const coach  = buildCoach(coachName, gender, answers)

    const club = {
      ...DEFAULT_CLUB_DATA,
      id:            `cl_${Date.now().toString(36)}`,
      nombre:        'Club fundacional',
      instalaciones: DEFAULT_CLUB_DATA.instalaciones.map((i) => ({ ...i })),
      sponsors:      [],
      reputacion:    { ...DEFAULT_CLUB_DATA.reputacion },
    }
    const season = {
      ...DEFAULT_SEASON_DATA,
      semanaActual:        1,
      faseActual:          getFasePorSemana(1),
      temporadaNumero:     1,
      calendario:          generateDefaultCalendar(),
      resultadosTemporada: [],
      historialSemanas:    [],
    }

    const gs = useGameStore.getState()
    gs.setCurrentCoach(coach)
    gs.setCurrentSkater(skater)
    gs.setCurrentClub(club)
    gs.setCurrentSeason(season)
    void useNarrativeStore.getState().loadPool()

    gs.changeState(GameState.PROGRAM_DESIGNER)
    navigate('/disenador-programa', { replace: true })
  }

  return (
    <div className="relative min-h-screen glace-vignette glace-grain">
      <div className="relative mx-auto grid min-h-screen max-w-5xl grid-cols-12 gap-8 px-10 py-16">

        <div className="col-span-12 flex items-baseline gap-4">
          <span className="glace-eyebrow">— acto I</span>
          <span className="glace-hairline flex-1" />
          <span className="glace-eyebrow text-content-disabled">primeros 40 minutos</span>
        </div>

        {step === 'name' && (
          <NameStep
            coachName={coachName}
            onChange={setCoachName}
            gender={gender}
            onGenderChange={setGender}
            onSubmit={commitName}
            error={error}
          />
        )}

        {step === 'questions' && (
          <QuestionStep
            question={QUESTIONS[questionIdx]}
            gender={gender}
            index={questionIdx}
            total={QUESTIONS.length}
            onAnswer={(optionIdx) => answer(QUESTIONS[questionIdx], optionIdx)}
            coachName={coachName.trim()}
          />
        )}

        {step === 'prospects' && (
          <ProspectStep
            prospects={prospects}
            error={error}
            onPick={pickProspect}
            coachName={coachName.trim()}
          />
        )}
      </div>
    </div>
  )
}

// ─── step views ──────────────────────────────────────────────────────────────

function NameStep({
  coachName, onChange, gender, onGenderChange, onSubmit, error,
}: {
  coachName: string
  onChange: (v: string) => void
  gender: Gender
  onGenderChange: (g: Gender) => void
  onSubmit: () => void
  error: string | null
}) {
  return (
    <>
      <div className="col-span-12 md:col-span-7 flex flex-col justify-center gap-6">
        <h1 className="glace-reveal-letter font-display font-light text-7xl leading-[0.9] text-content-primary">
          Antes de
          <br />
          <span className="italic text-ice-300">tener un patinador,</span>
          <br />
          tienes un nombre.
        </h1>
        <p className="glace-reveal glace-stagger-3 font-display italic text-xl leading-relaxed text-content-secondary max-w-md">
          Lo que decidas en estos minutos quedará escrito en cada decisión que
          tomes durante las próximas treinta semanas. No hay neutralidad.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit() }}
        className="col-span-12 md:col-span-5 flex flex-col justify-center gap-8"
      >
        <fieldset className="glace-reveal glace-stagger-3 flex flex-col gap-2">
          <legend className="glace-eyebrow mb-2">— pronombre</legend>
          <div className="flex items-baseline gap-6">
            <GenderToggle
              label="él"
              value="el"
              current={gender}
              onSelect={onGenderChange}
            />
            <GenderToggle
              label="ella"
              value="ella"
              current={gender}
              onSelect={onGenderChange}
            />
          </div>
          <p className="font-display italic text-sm text-content-muted">
            ajusta cómo te hablan las preguntas y los textos
          </p>
        </fieldset>

        <label className="glace-reveal glace-stagger-4 flex flex-col gap-2">
          <span className="glace-eyebrow">{g(gender, 'entrenador', 'entrenadora')}</span>
          <input
            value={coachName}
            onChange={(e) => onChange(e.target.value)}
            placeholder="tu nombre"
            autoFocus
            className="border-b border-border bg-transparent pb-2 font-display text-3xl text-content-primary placeholder:italic placeholder:text-content-disabled focus:border-ice-300 focus:outline-none transition-colors"
          />
        </label>

        {error && (
          <p className="glace-eyebrow text-danger">— {error}</p>
        )}

        <button
          type="submit"
          className="group glace-reveal glace-stagger-6 mt-4 flex items-baseline gap-3 self-start text-left"
        >
          <span className="font-display text-3xl text-content-primary group-hover:text-ice-200 transition-colors">
            seguir
          </span>
          <span className="text-2xl text-ice-300 transition-transform duration-300 group-hover:translate-x-2">→</span>
        </button>
      </form>
    </>
  )
}

function GenderToggle({
  label, value, current, onSelect,
}: {
  label: string
  value: Gender
  current: Gender
  onSelect: (g: Gender) => void
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={[
        'font-display text-3xl transition-colors border-b pb-1',
        active
          ? 'text-ice-300 border-ice-300'
          : 'text-content-secondary border-transparent hover:text-ice-300',
      ].join(' ')}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function QuestionStep({
  question, gender, index, total, onAnswer, coachName,
}: {
  question: Question
  gender: Gender
  index: number
  total: number
  onAnswer: (optionIdx: number) => void
  coachName: string
}) {
  return (
    <>
      <div className="col-span-12 md:col-span-12 flex flex-col gap-3">
        <span className="glace-eyebrow text-content-disabled">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} · {coachName || 'sin nombre'}
        </span>
        <h2 className="glace-reveal-letter font-display text-5xl leading-[1] text-content-primary max-w-3xl">
          {question.prompt(gender)}
        </h2>
      </div>

      <ul className="col-span-12 flex flex-col gap-px bg-border-subtle">
        {question.options.map((opt, i) => (
          <li key={opt.id}>
            <button
              type="button"
              onClick={() => onAnswer(i)}
              className="group flex w-full items-baseline gap-6 bg-bg-deep px-6 py-5 text-left transition-all duration-300 hover:bg-bg-base hover:-translate-y-[2px]"
            >
              <span className="font-display tabular-nums text-3xl text-content-disabled group-hover:text-ice-300 transition-colors w-8">
                {String.fromCharCode(65 + i)}
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <span className="font-display text-2xl text-content-primary group-hover:text-ice-200 transition-colors">
                  {opt.label(gender)}
                </span>
                <span className="font-display italic text-base text-content-secondary">
                  {opt.description}
                </span>
              </div>
              <span className="text-content-disabled group-hover:text-ice-300 group-hover:translate-x-1 transition-all">→</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function ProspectStep({
  prospects, error, onPick, coachName,
}: {
  prospects: SkaterProfile[] | null
  error: string | null
  onPick: (profile: SkaterProfile) => void
  coachName: string
}) {
  return (
    <>
      <div className="col-span-12 flex flex-col gap-3">
        <span className="glace-eyebrow text-content-disabled">
          {coachName || 'sin nombre'} · patinador o patinadora fundacional
        </span>
        <h2 className="glace-reveal-letter font-display text-6xl leading-[0.95] text-content-primary max-w-4xl">
          Tres prospectos. <span className="italic text-ice-300">Una elegirá tu temporada.</span>
        </h2>
        <p className="font-display italic text-lg text-content-secondary max-w-2xl">
          No hay prospecto correcto. Hay aquel con el que vas a tener que aprender
          lo tuyo. Mira los rasgos visibles. El resto se descubre con vínculo.
        </p>
      </div>

      {error && (
        <p className="col-span-12 glace-eyebrow text-danger">— {error}</p>
      )}

      {!prospects && !error && (
        <p className="col-span-12 font-display italic text-content-secondary">
          buscando prospectos disponibles…
        </p>
      )}

      {prospects && prospects.length > 0 && (
        <div className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-px bg-border-subtle">
          {prospects.map((p) => (
            <ProspectCard key={p.id} profile={p} onPick={() => onPick(p)} />
          ))}
        </div>
      )}
    </>
  )
}

function ProspectCard({
  profile, onPick,
}: {
  profile: SkaterProfile
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex flex-col items-stretch gap-4 bg-bg-deep p-6 text-left transition-all duration-300 hover:bg-bg-base hover:-translate-y-[2px]"
    >
      <div className="flex items-baseline justify-between">
        <span className="glace-eyebrow text-content-disabled">{profile.nacionalidad}</span>
        <span className="glace-eyebrow text-frost-400">{POTENCIAL_LABEL[profile.potencial]}</span>
      </div>
      <h3 className="font-display text-3xl leading-tight text-content-primary group-hover:text-ice-200 transition-colors">
        {profile.nombre}
      </h3>
      <span className="font-display italic text-sm text-content-secondary">
        {profile.edad} años
      </span>

      <dl className="mt-2 flex flex-col gap-1 font-display tabular-nums text-sm text-content-secondary">
        <StatRow label="saltos"        value={profile.nivelVisible.saltos} />
        <StatRow label="giros"         value={profile.nivelVisible.giros} />
        <StatRow label="pasos"         value={profile.nivelVisible.secuenciaDePasos} />
        <StatRow label="línea"         value={profile.nivelVisible.amplitudLinea} />
      </dl>

      {profile.rasgosVisibles.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          <span className="glace-eyebrow">— rasgos visibles</span>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 font-display italic text-base text-content-primary">
            {profile.rasgosVisibles.map((id) => (
              <li key={id}>· {id.replace(/-/g, ' ')}</li>
            ))}
          </ul>
        </div>
      )}

      <span className="mt-3 self-end font-display text-sm text-ice-300 group-hover:translate-x-1 transition-transform">
        elegir →
      </span>
    </button>
  )
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border-subtle/60 py-1">
      <span>{label}</span>
      <span className="text-content-primary">{value}</span>
    </div>
  )
}
