// club domain types — installations, sponsors, reputation, budget

// ─── installations ────────────────────────────────────────────────────────────

/** the 8 fixed installations of the club; keys used for Record lookups */
export type InstallationId =
  | 'pistaPrincipal'
  | 'gimnasioFuerza'
  | 'fisioterapia'
  | 'salaMental'
  | 'estudioCoreografia'
  | 'vestuarioPro'
  | 'departamentoPR'
  | 'academiaJunior'

/** upgrade tier; 0 = not built, 4 = max level */
export type InstallationLevel = 0 | 1 | 2 | 3 | 4

export interface Installation {
  id:     InstallationId
  nombre: string
  /** current upgrade tier */
  nivel:  InstallationLevel
  /** true while an upgrade is in progress */
  enConstruccion: boolean
  /**
   * week number when the current upgrade completes.
   * -1 when enConstruccion is false.
   */
  semanaFinConstruccion: number
}

/** all 8 installations at level 0 — use as template when creating a new club */
export const DEFAULT_INSTALLATIONS: Installation[] = [
  { id: 'pistaPrincipal',     nombre: 'Pista Principal',         nivel: 0, enConstruccion: false, semanaFinConstruccion: -1 },
  { id: 'gimnasioFuerza',     nombre: 'Gimnasio de Fuerza',      nivel: 0, enConstruccion: false, semanaFinConstruccion: -1 },
  { id: 'fisioterapia',       nombre: 'Centro de Fisioterapia',  nivel: 0, enConstruccion: false, semanaFinConstruccion: -1 },
  { id: 'salaMental',         nombre: 'Sala de Trabajo Mental',  nivel: 0, enConstruccion: false, semanaFinConstruccion: -1 },
  { id: 'estudioCoreografia', nombre: 'Estudio de Coreografía',  nivel: 0, enConstruccion: false, semanaFinConstruccion: -1 },
  { id: 'vestuarioPro',       nombre: 'Vestuario Profesional',   nivel: 0, enConstruccion: false, semanaFinConstruccion: -1 },
  { id: 'departamentoPR',     nombre: 'Departamento de PR',      nivel: 0, enConstruccion: false, semanaFinConstruccion: -1 },
  { id: 'academiaJunior',     nombre: 'Academia Junior',         nivel: 0, enConstruccion: false, semanaFinConstruccion: -1 },
]

// ─── sponsors ─────────────────────────────────────────────────────────────────

export type SponsorType =
  | 'equipamiento'   // blades, boots, apparel
  | 'indumentaria'   // costumes, off-ice branding
  | 'medios'         // streaming, press, media rights
  | 'institucional'  // federation or government body
  | 'tecnologia'     // analytics, wearables, facility tech

/**
 * performance conditions the sponsor requires to maintain the contract.
 * all fields are optional thresholds; failing any triggers a review.
 */
export interface SponsorMetrics {
  /** minimum placement required in tracked competitions (1 = first place) */
  clasificacionMinima?: number
  /** minimum coach-skater bond the skater must maintain */
  vinculoMinimo?: number
  /** minimum PCS the skater must score in competition */
  pcsMinimo?: number
  /** minimum coach reputation dimension value (averaged across all five) */
  reputacionCoachMinima?: number
}

export interface Sponsor {
  id:     string
  nombre: string
  tipo:   SponsorType
  /** weekly income transferred to presupuestoReservas (euros) */
  ingresoSemanal:   number
  metricasExigidas: SponsorMetrics
  /** weeks remaining on the current contract */
  semanasRestantes: number
}

// ─── reputation ───────────────────────────────────────────────────────────────

/** five axes of club-level reputation; each 0–100 */
export interface ClubReputation {
  /** quality of technical output visible to peers and federation */
  tecnica:       number
  /** artistic identity; built through program quality over seasons */
  artistica:     number
  /** track record of athlete development and care */
  pedagogica:    number
  /** standing with ISU, national federations, and organizing bodies */
  institucional: number
  /** press coverage, social presence, public profile */
  mediatica:     number
}

// ─── main entity ──────────────────────────────────────────────────────────────

export interface ClubData {
  id:     string
  nombre: string
  /** liquid reserves available for upgrades, staff, emergencies (euros) */
  presupuestoReservas: number
  instalaciones:       Installation[]
  sponsors:            Sponsor[]
  reputacion:          ClubReputation
}

// ─── default data ─────────────────────────────────────────────────────────────

/** baseline ClubData for a new club at career start */
export const DEFAULT_CLUB_DATA: ClubData = {
  id:     '',
  nombre: '',
  presupuestoReservas: 50_000,
  instalaciones: DEFAULT_INSTALLATIONS.map(i => ({ ...i })),
  sponsors:   [],
  reputacion: {
    tecnica:       15,
    artistica:     10,
    pedagogica:    20,
    institucional: 10,
    mediatica:      5,
  },
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** find an installation by id; returns undefined if not in the list */
export function getInstallation(
  club: ClubData,
  id: InstallationId,
): Installation | undefined {
  return club.instalaciones.find(i => i.id === id)
}

/** true if the installation is currently being upgraded */
export function isUnderConstruction(
  club: ClubData,
  id: InstallationId,
): boolean {
  return getInstallation(club, id)?.enConstruccion ?? false
}

// ─── runtime validation ───────────────────────────────────────────────────────

import {
  isFiniteNumber,
  isInRange,
  isIntegerInRange,
  isNonNegative,
  isPlainObject,
  hasUnitScoreFields,
} from '@/utils/validation'

const CLUB_REPUTATION_KEYS = [
  'tecnica', 'artistica', 'pedagogica', 'institucional', 'mediatica',
] as const

const VALID_SPONSOR_TYPES: ReadonlySet<string> = new Set<SponsorType>([
  'equipamiento', 'indumentaria', 'medios', 'institucional', 'tecnologia',
])

/** type guard for a single Sponsor — validates SponsorType, finite income, non-negative weeks */
export function validateSponsor(v: unknown): v is Sponsor {
  if (!isPlainObject(v)) return false
  if (typeof v['id'] !== 'string' || v['id'].length === 0) return false
  if (typeof v['nombre'] !== 'string') return false
  if (typeof v['tipo'] !== 'string' || !VALID_SPONSOR_TYPES.has(v['tipo'])) return false
  if (!isFiniteNumber(v['ingresoSemanal']) || !isNonNegative(v['ingresoSemanal'])) return false
  if (!isIntegerInRange(v['semanasRestantes'], 0, 520)) return false  // hard cap ~10 seasons

  const m = v['metricasExigidas']
  if (!isPlainObject(m)) return false
  // each metric is optional; when present must be a finite number in its expected range
  if (m['clasificacionMinima']     !== undefined && (!isFiniteNumber(m['clasificacionMinima'])     || (m['clasificacionMinima'] as number) < 1)) return false
  if (m['vinculoMinimo']           !== undefined && !isInRange(m['vinculoMinimo'],           0, 100)) return false
  if (m['pcsMinimo']               !== undefined && !isFiniteNumber(m['pcsMinimo'])) return false
  if (m['reputacionCoachMinima']   !== undefined && !isInRange(m['reputacionCoachMinima'], 0, 100)) return false

  return true
}

/**
 * type guard for complete ClubData.
 * validates installation level 0–4, reputation 0–100, and recurses into sponsors.
 * presupuestoReservas can be negative (deuda) but must be finite.
 */
export function validateClubData(data: unknown): data is ClubData {
  if (!isPlainObject(data)) return false

  if (typeof data['id'] !== 'string') return false
  if (typeof data['nombre'] !== 'string') return false
  if (!isFiniteNumber(data['presupuestoReservas'])) return false

  if (!Array.isArray(data['instalaciones'])) return false
  for (const inst of data['instalaciones'] as unknown[]) {
    if (!isPlainObject(inst)) return false
    if (!isIntegerInRange(inst['nivel'], 0, 4)) return false
  }

  if (!Array.isArray(data['sponsors'])) return false
  if (!data['sponsors'].every(validateSponsor)) return false

  if (!isPlainObject(data['reputacion'])) return false
  if (!hasUnitScoreFields(data['reputacion'], CLUB_REPUTATION_KEYS)) return false

  return true
}
