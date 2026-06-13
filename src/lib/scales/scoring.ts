import type { AnswerMap, ScaleDefinition, ScoreResult, SeverityBand } from "./types"

/** Thrown when an answer map contains an invalid key or value. */
export class ScaleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScaleValidationError"
  }
}

/** Thrown when scoring is attempted on an incomplete answer map. */
export class IncompleteAnswersError extends Error {
  constructor(message = "Respostas incompletas: todas as perguntas devem ser respondidas") {
    super(message)
    this.name = "IncompleteAnswersError"
  }
}

/**
 * Validates an untrusted answer object against a scale definition.
 *  - keys must be a subset of the definition's item ids;
 *  - values must be integers within the option value set.
 * Accepts a subset (partial fills), so it doubles as the autosave validator.
 * Returns a clean {@link AnswerMap}; throws {@link ScaleValidationError} otherwise.
 */
export function validateAnswers(def: ScaleDefinition, answers: unknown): AnswerMap {
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
    throw new ScaleValidationError("Respostas inválidas")
  }
  const itemIds = new Set(def.items.map((i) => i.id))
  const allowedValues = new Set(def.options.map((o) => o.value))
  const result: AnswerMap = {}
  for (const [key, raw] of Object.entries(answers as Record<string, unknown>)) {
    if (!itemIds.has(key)) {
      throw new ScaleValidationError(`Item desconhecido: ${key}`)
    }
    if (typeof raw !== "number" || !Number.isInteger(raw)) {
      throw new ScaleValidationError(`Valor inválido para ${key}`)
    }
    if (!allowedValues.has(raw)) {
      throw new ScaleValidationError(`Valor fora do domínio para ${key}: ${raw}`)
    }
    result[key] = raw
  }
  return result
}

/** Merges a validated patch into the current answers (patch wins). */
export function mergeAnswers(current: AnswerMap, patch: AnswerMap): AnswerMap {
  return { ...current, ...patch }
}

/** True when every item of the definition has an answer. */
export function isComplete(def: ScaleDefinition, answers: AnswerMap): boolean {
  return def.items.every((item) => answers[item.id] !== undefined)
}

/**
 * Progress metadata for the public one-question-per-screen flow.
 * `nextItemIndex` is the index of the first unanswered item, or `items.length`
 * when complete.
 */
export function getProgress(
  def: ScaleDefinition,
  answers: AnswerMap
): { answered: number; total: number; nextItemIndex: number } {
  const total = def.items.length
  let answered = 0
  let nextItemIndex = total
  for (let i = 0; i < def.items.length; i++) {
    const has = answers[def.items[i].id] !== undefined
    if (has) {
      answered++
    } else if (nextItemIndex === total) {
      nextItemIndex = i
    }
  }
  return { answered, total, nextItemIndex }
}

/** The highest option value (used for reverse scoring). */
function maxOptionValue(def: ScaleDefinition): number {
  return Math.max(...def.options.map((o) => o.value))
}

/**
 * Sums a complete answer map, applying reverse scoring (`maxValue - v`) to any
 * item flagged `reverse`. PHQ-9/GAD-7 have no reverse items; the engine
 * supports them for future scales.
 * Throws {@link IncompleteAnswersError} if any item is unanswered.
 */
export function scoreScale(def: ScaleDefinition, answers: AnswerMap): ScoreResult {
  if (!isComplete(def, answers)) {
    throw new IncompleteAnswersError()
  }
  const maxValue = maxOptionValue(def)
  let totalScore = 0
  for (const item of def.items) {
    const v = answers[item.id]
    totalScore += item.reverse ? maxValue - v : v
  }
  const band = getSeverityBand(def, totalScore)
  const { riskFlag, endorsedRiskItemIds } = detectRisk(def, answers)
  return { totalScore, severityLabel: band.label, riskFlag, endorsedRiskItemIds }
}

/**
 * Returns the severity band a total score falls into. Bands are contiguous and
 * cover 0..maxScore; the last band is returned for out-of-range high scores as
 * a defensive fallback.
 */
export function getSeverityBand(def: ScaleDefinition, totalScore: number): SeverityBand {
  for (const band of def.severityBands) {
    if (totalScore >= band.min && totalScore <= band.max) return band
  }
  return def.severityBands[def.severityBands.length - 1]
}

/**
 * Detects endorsement of any risk item (value > 0). Works on partial answers
 * so a risk item answered early can raise an alert before the fill completes.
 */
export function detectRisk(
  def: ScaleDefinition,
  answers: AnswerMap
): { riskFlag: boolean; endorsedRiskItemIds: string[] } {
  const endorsedRiskItemIds = def.riskItemIds.filter((id) => (answers[id] ?? 0) > 0)
  return { riskFlag: endorsedRiskItemIds.length > 0, endorsedRiskItemIds }
}
