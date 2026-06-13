import type { AnswerValue, FormAnswers, FormField } from "./types"

/**
 * Whether a single answer matches the `equals` target of a condition.
 * For multiple_choice answers (string[]), matches when the target is one of
 * the selected options.
 */
function answerEquals(answer: AnswerValue | undefined, target: string | number | boolean): boolean {
  if (answer === undefined) return false
  if (Array.isArray(answer)) return answer.includes(target as string)
  return answer === target
}

/**
 * Resolves field visibility honoring conditional chains: a field is visible
 * only when its own condition matches AND the field it depends on is itself
 * visible. Because conditions can only reference earlier fields
 * (enforced by validateFields), a single forward pass is sufficient.
 */
export function getVisibleFields(fields: FormField[], answers: FormAnswers): FormField[] {
  const visibleById = new Map<string, boolean>()
  const visible: FormField[] = []

  for (const field of fields) {
    let isVisible = true
    if (field.visibleWhen) {
      const dependsVisible = visibleById.get(field.visibleWhen.fieldId) ?? false
      isVisible = dependsVisible && answerEquals(answers[field.visibleWhen.fieldId], field.visibleWhen.equals)
    }
    visibleById.set(field.id, isVisible)
    if (isVisible) visible.push(field)
  }

  return visible
}

/** Whether a field is visible given the current answers (chain-aware). */
export function isFieldVisible(field: FormField, answers: FormAnswers, allFields?: FormField[]): boolean {
  if (allFields && allFields.length > 0) {
    return getVisibleFields(allFields, answers).some((f) => f.id === field.id)
  }
  if (!field.visibleWhen) return true
  return answerEquals(answers[field.visibleWhen.fieldId], field.visibleWhen.equals)
}
