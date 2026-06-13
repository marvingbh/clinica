/**
 * Pure types for the clinical-scales domain (PHQ-9 / GAD-7).
 *
 * Instrument definitions are versioned TypeScript constants (no DB table):
 * read-only public-domain instruments, total type-safety, and pure testable
 * scoring. A `scaleCode + scaleVersion` pair on each administration preserves
 * interpretability if a definition's text ever changes (version bump).
 */

/** Supported scale codes in v1. */
export type ScaleCode = "PHQ9" | "GAD7"

/** A single answer option (e.g. 0 "Nenhuma vez" .. 3 "Quase todos os dias"). */
export interface ScaleOption {
  value: number
  label: string
}

/** A single scale item (question). `reverse` flips the score (engine support). */
export interface ScaleItem {
  id: string
  text: string
  reverse?: boolean
}

/** A contiguous severity band over the total-score range. */
export interface SeverityBand {
  min: number
  max: number
  label: string
  /** Tailwind utility classes for a colored chip. */
  color: string
}

/** Full, versioned definition of a clinical scale. */
export interface ScaleDefinition {
  code: ScaleCode
  version: number
  /** Full name, e.g. "PHQ-9 — Questionário de Saúde do Paciente". */
  name: string
  /** Short name, e.g. "PHQ-9". */
  shortName: string
  /** Stem / lead-in shown to the patient (e.g. "Nas últimas 2 semanas..."). */
  stem: string
  items: ScaleItem[]
  options: ScaleOption[]
  maxScore: number
  severityBands: SeverityBand[]
  /** Item ids whose endorsement (value > 0) raises a risk flag. */
  riskItemIds: string[]
}

/** Map of itemId -> chosen option value. Partial while a fill is in progress. */
export type AnswerMap = Record<string, number>

/** Result of scoring a complete answer map. */
export interface ScoreResult {
  totalScore: number
  severityLabel: string
  riskFlag: boolean
  endorsedRiskItemIds: string[]
}
