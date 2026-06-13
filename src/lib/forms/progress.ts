import type { FormAnswers, FormField } from "./types"
import { validateAnswer } from "./validation"
import { getVisibleFields } from "./visibility"

export interface FormProgress {
  answered: number
  total: number
  percent: number
}

/**
 * Computes fill progress over the currently-visible, answerable fields.
 * Section headers are ignored. A field counts as answered when it carries a
 * non-error answer. Percent is rounded to the nearest integer; an empty form
 * reports 100% (nothing left to do).
 */
export function computeProgress(fields: FormField[], answers: FormAnswers): FormProgress {
  const visible = getVisibleFields(fields, answers).filter((f) => f.type !== "section")
  const total = visible.length

  if (total === 0) return { answered: 0, total: 0, percent: 100 }

  let answered = 0
  for (const field of visible) {
    const value = answers[field.id]
    const hasValue =
      value !== undefined &&
      value !== null &&
      !(typeof value === "string" && value.trim().length === 0) &&
      !(Array.isArray(value) && value.length === 0)
    // info_consent counts only when accepted (true).
    const ok = field.type === "info_consent" ? value === true : hasValue && validateAnswer(field, value) === null
    if (ok) answered++
  }

  return { answered, total, percent: Math.round((answered / total) * 100) }
}
