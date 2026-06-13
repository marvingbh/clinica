import {
  LONG_TEXT_MAX,
  SHORT_TEXT_MAX,
  type AnswerValue,
  type FormAnswers,
  type FormField,
} from "./types"
import { getVisibleFields } from "./visibility"

const MSG = {
  required: "Campo obrigatório",
  invalidDate: "Data inválida (use DD/MM/AAAA)",
  pickOption: "Selecione uma opção",
  mustAccept: "É necessário aceitar para continuar",
  scaleRange: "Escolha um valor entre 0 e 10",
  tooLong: "Texto muito longo",
} as const

/** Returns true when the answer is empty (for required checks). */
function isEmpty(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** Strict DD/MM/YYYY parse with real calendar-day check (rejects 31/02). */
export function isValidBrDate(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return false
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/**
 * Validates a single answer against its field. Returns a pt-BR error string or
 * null when the answer is acceptable. Section fields never error.
 */
export function validateAnswer(field: FormField, value: AnswerValue | undefined): string | null {
  if (field.type === "section") return null

  const empty = isEmpty(value)

  if (field.type === "info_consent") {
    // Required consent must be explicitly accepted (true).
    if (field.required && value !== true) return MSG.mustAccept
    return null
  }

  if (empty) {
    return field.required ? MSG.required : null
  }

  switch (field.type) {
    case "short_text": {
      if (typeof value !== "string") return MSG.required
      if (value.length > SHORT_TEXT_MAX) return MSG.tooLong
      return null
    }
    case "long_text": {
      if (typeof value !== "string") return MSG.required
      if (value.length > LONG_TEXT_MAX) return MSG.tooLong
      return null
    }
    case "single_choice":
    case "dropdown": {
      if (typeof value !== "string") return MSG.pickOption
      if (!field.options?.includes(value)) return MSG.pickOption
      return null
    }
    case "multiple_choice": {
      if (!Array.isArray(value)) return MSG.pickOption
      const allowed = new Set(field.options ?? [])
      if (value.some((v) => !allowed.has(v))) return MSG.pickOption
      return null
    }
    case "scale_0_10": {
      const num = typeof value === "number" ? value : Number(value)
      if (!Number.isInteger(num) || num < 0 || num > 10) return MSG.scaleRange
      return null
    }
    case "date": {
      if (typeof value !== "string" || !isValidBrDate(value)) return MSG.invalidDate
      return null
    }
    case "yes_no": {
      if (typeof value !== "boolean") return MSG.required
      return null
    }
    default:
      return null
  }
}

export interface SubmissionValidationResult {
  valid: boolean
  errors: Record<string, string>
}

/**
 * Validates a full submission. Only visible, answerable fields are checked —
 * conditionally-hidden fields never block a submit.
 */
export function validateSubmission(
  fields: FormField[],
  answers: FormAnswers
): SubmissionValidationResult {
  const errors: Record<string, string> = {}
  const visible = getVisibleFields(fields, answers)

  for (const field of visible) {
    const error = validateAnswer(field, answers[field.id])
    if (error) errors[field.id] = error
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Coerces and prunes incoming answers: drops unknown ids, drops answers of
 * fields that aren't visible under the resulting answer set, and discards
 * type-mismatched values. Used by both autosave (partial) and submit.
 */
export function sanitizeAnswers(fields: FormField[], answers: FormAnswers): FormAnswers {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const cleaned: FormAnswers = {}

  // First pass: keep only well-typed answers for known answerable fields.
  for (const [id, raw] of Object.entries(answers)) {
    const field = byId.get(id)
    if (!field || field.type === "section") continue
    const coerced = coerceValue(field, raw)
    if (coerced !== undefined) cleaned[id] = coerced
  }

  // Second pass: drop answers for fields that are not visible given `cleaned`.
  const visibleIds = new Set(getVisibleFields(fields, cleaned).map((f) => f.id))
  const result: FormAnswers = {}
  for (const [id, value] of Object.entries(cleaned)) {
    if (visibleIds.has(id)) result[id] = value
  }
  return result
}

/** Coerces a raw value to the field's expected type, or undefined if invalid. */
function coerceValue(field: FormField, raw: unknown): AnswerValue | undefined {
  switch (field.type) {
    case "short_text":
    case "long_text":
    case "date":
    case "single_choice":
    case "dropdown":
      return typeof raw === "string" ? raw : undefined
    case "multiple_choice": {
      if (!Array.isArray(raw)) return undefined
      const strings = raw.filter((v): v is string => typeof v === "string")
      const allowed = new Set(field.options ?? [])
      return strings.filter((v) => allowed.has(v))
    }
    case "scale_0_10": {
      const num = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
      return Number.isInteger(num) ? num : undefined
    }
    case "yes_no":
    case "info_consent":
      return typeof raw === "boolean" ? raw : undefined
    default:
      return undefined
  }
}
