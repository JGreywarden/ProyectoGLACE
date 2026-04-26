// smoke tests — every page renders without throwing when given the minimum
// state it needs. these don't exercise interactions; they verify the wiring.

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

import { GameState, useGameStore } from '@/stores/gameStore'
import { useNarrativeStore } from '@/features/narrative'
import { useProgramStore } from '@/features/program'
import { useTrainingStore } from '@/features/training'
import { DEFAULT_SKATER_DATA } from '@/types/skater'
import { DEFAULT_COACH_DATA } from '@/types/coach'
import { DEFAULT_CLUB_DATA } from '@/types/club'
import { DEFAULT_SEASON_DATA } from '@/types/season'
import { DEFAULT_PROGRAM_DATA } from '@/types/program'

import { MainMenu } from './MainMenu'
import { CoachCreation } from './CoachCreation'
import { WeeklyPlanning } from './WeeklyPlanning'
import { FichaPatinador } from './FichaPatinador'
import { NarrativeEvent } from './NarrativeEvent'
import { Calendario } from './Calendario'
import { Competition } from './Competition'

function withRouter(node: React.ReactNode) {
  return (
    <MemoryRouter>
      <Routes>
        <Route path="/" element={node} />
      </Routes>
    </MemoryRouter>
  )
}

function seedActiveGame() {
  const skater = {
    ...DEFAULT_SKATER_DATA,
    id: 'sk',
    name: 'Lina Hartö',
    technical:     { ...DEFAULT_SKATER_DATA.technical },
    psychological: { ...DEFAULT_SKATER_DATA.psychological },
    physical:      { ...DEFAULT_SKATER_DATA.physical },
    weeklyState:   { ...DEFAULT_SKATER_DATA.weeklyState },
    traits: [],
  }
  const coach = {
    ...DEFAULT_COACH_DATA,
    id: 'co', name: 'Coach Test',
    perfilInferido:   { ...DEFAULT_COACH_DATA.perfilInferido },
    legadoTotal:      { ...DEFAULT_COACH_DATA.legadoTotal, medallas: [], eventosDefinitorios: [] },
    reputacion:       { ...DEFAULT_COACH_DATA.reputacion },
    arbolHabilidades: {},
  }
  const club = {
    ...DEFAULT_CLUB_DATA,
    id: 'cl', nombre: 'Club',
    instalaciones: DEFAULT_CLUB_DATA.instalaciones.map(i => ({ ...i })),
    sponsors:      [],
    reputacion:    { ...DEFAULT_CLUB_DATA.reputacion },
  }
  const season = {
    ...DEFAULT_SEASON_DATA,
    calendario:          [{ semana: 14, nombreCompeticion: 'Test Cup', tipo: 'nacional' as const, clasificado: true }],
    resultadosTemporada: [],
    historialSemanas:    [],
  }
  useGameStore.setState({
    currentSkater: skater, currentCoach: coach, currentClub: club, currentSeason: season,
  })
}

beforeEach(() => {
  // reset state between tests
  useGameStore.setState({
    currentSkater: null, currentCoach: null, currentClub: null, currentSeason: null,
    currentState: GameState.MAIN_MENU, stateHistory: [GameState.MAIN_MENU],
  })
  useNarrativeStore.setState({
    availableEvents: [], currentEvent: null, lastContext: null,
    narrativeFlags: {}, emittedEvents: [], lastEmittedBySubtype: {},
  })
  useProgramStore.setState({
    activeType: 'libre',
    drafts: {}, musicInfo: {}, projectedScores: {},
    violations: {}, confirmedPrograms: {},
  })
  useTrainingStore.setState({ schedules: {} })
})

describe('pages — smoke', () => {
  it('MainMenu renders', () => {
    render(withRouter(<MainMenu />))
    expect(screen.getByText('GLACÉ')).toBeInTheDocument()
  })

  it('CoachCreation renders the name step on first mount', () => {
    render(withRouter(<CoachCreation />))
    // initial step asks for pronoun + name; the gendered label matches either form
    expect(screen.getByText(/entrenador(a)?/i, { selector: '.glace-eyebrow' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/tu nombre/i)).toBeInTheDocument()
  })

  it('WeeklyPlanning renders with active game', () => {
    seedActiveGame()
    render(withRouter(<WeeklyPlanning />))
    // skater name shows in the hub header
    expect(screen.getByText('Lina Hartö')).toBeInTheDocument()
    expect(screen.getByText(/— hub semanal/i)).toBeInTheDocument()
  })

  it('WeeklyPlanning shows fallback when there is no game', () => {
    render(withRouter(<WeeklyPlanning />))
    expect(screen.getByText('No hay partida activa.')).toBeInTheDocument()
  })

  it('FichaPatinador renders skater name', () => {
    seedActiveGame()
    render(withRouter(<FichaPatinador />))
    expect(screen.getByText('Lina Hartö')).toBeInTheDocument()
  })

  it('NarrativeEvent shows fallback when no event is active', () => {
    render(withRouter(<NarrativeEvent />))
    expect(screen.getByText(/Sin evento activo/i)).toBeInTheDocument()
  })

  it('Calendario renders the 30-week grid', () => {
    seedActiveGame()
    render(withRouter(<Calendario />))
    // "Temporada" is a single element; the season number sits in a sibling node
    expect(screen.getByText(/Temporada/i)).toBeInTheDocument()
    expect(screen.getByText(/treinta semanas/i)).toBeInTheDocument()
  })

  it('Competition shows a fallback when no result is in season', () => {
    seedActiveGame()
    render(withRouter(<Competition />))
    expect(screen.getByText(/No hay competición lista/i)).toBeInTheDocument()
  })

  it('Competition renders header when a result is present', () => {
    seedActiveGame()
    // seed a result + a confirmed program so the page can mount fully
    const skater = useGameStore.getState().currentSkater!
    const program = {
      ...DEFAULT_PROGRAM_DATA,
      id: `${skater.id}_libre_t1`, skaterId: skater.id, temporada: 1, tipo: 'libre' as const,
      elementos: [
        { tipo: 'salto' as const, tipoSalto: 'toeloop' as const, dificultadBase: 4.2, posicionEnPrograma: 1, esCombinacion: false, rotaciones: 3 as const },
      ],
    }
    useProgramStore.setState({ confirmedPrograms: { [skater.id]: [program] } })

    const season = useGameStore.getState().currentSeason!
    useGameStore.setState({
      currentSeason: {
        ...season,
        resultadosTemporada: [
          { id: `${skater.id}-s1w14`, skaterId: skater.id, semana: 14,
            nombreCompeticion: 'Test Cup', tipo: 'nacional',
            tes: 50, pcs: 40, total: 90, posicion: 1, caidas: 0, deducciones: 0,
            pcsDetalle: { sk: 8, tr: 8, pe: 8, co: 8, in: 8 } },
        ],
      },
    })

    render(withRouter(<Competition />))
    expect(screen.getByText('Test Cup')).toBeInTheDocument()
  })
})
