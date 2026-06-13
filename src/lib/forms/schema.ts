import { z } from "zod"
import { randomUUID } from "crypto"
import { CHOICE_TYPES, type FormField, type FormFieldType } from "./types"

/** Generates a stable, unique field id for a new field within a template. */
export function makeFieldId(): string {
  return `f_${randomUUID().replace(/-/g, "").slice(0, 16)}`
}

const FIELD_TYPES: [FormFieldType, ...FormFieldType[]] = [
  "section",
  "short_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "scale_0_10",
  "date",
  "yes_no",
  "info_consent",
]

const conditionSchema = z.object({
  fieldId: z.string().min(1),
  equals: z.union([z.string(), z.number(), z.boolean()]),
})

/**
 * Per-field zod schema. Structural shape only — cross-field rules (unique ids,
 * forward references) are enforced by {@link validateFields}.
 */
export const formFieldSchema: z.ZodType<FormField> = z.object({
  id: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  label: z.string().trim().min(1, "O título do campo não pode ficar vazio"),
  description: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1)).optional(),
  infoText: z.string().optional(),
  visibleWhen: conditionSchema.optional(),
}) as z.ZodType<FormField>

export type ValidateFieldsResult =
  | { ok: true; fields: FormField[] }
  | { ok: false; error: string }

/**
 * Validates a draft/published field array.
 *
 * Rules:
 * - each field passes the structural schema;
 * - ids are unique;
 * - choice types carry at least one non-empty option;
 * - info_consent carries non-empty infoText;
 * - visibleWhen references a field that exists AND appears earlier in the list.
 */
export function validateFields(input: unknown): ValidateFieldsResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Estrutura do formulário inválida" }
  }

  const fields: FormField[] = []
  const seenIds = new Set<string>()

  for (let i = 0; i < input.length; i++) {
    const parsed = formFieldSchema.safeParse(input[i])
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Campo inválido"
      return { ok: false, error: `Campo ${i + 1}: ${msg}` }
    }
    const field = parsed.data

    if (seenIds.has(field.id)) {
      return { ok: false, error: `Identificador de campo duplicado: ${field.id}` }
    }
    seenIds.add(field.id)

    if (CHOICE_TYPES.has(field.type)) {
      if (!field.options || field.options.length === 0) {
        return { ok: false, error: `Campo "${field.label}": adicione ao menos uma opção` }
      }
    }

    if (field.type === "info_consent") {
      if (!field.infoText || field.infoText.trim().length === 0) {
        return { ok: false, error: `Campo "${field.label}": informe o texto do termo` }
      }
    }

    if (field.visibleWhen) {
      const refId = field.visibleWhen.fieldId
      if (!seenIds.has(refId) || refId === field.id) {
        return {
          ok: false,
          error: `Campo "${field.label}": a condição deve apontar para um campo anterior`,
        }
      }
    }

    fields.push(field)
  }

  return { ok: true, fields }
}

/**
 * Defensive parse for reads (rendering a stored version / answering). Returns
 * an empty list when the stored JSON is corrupt rather than throwing, so a
 * single bad template never crashes a render.
 */
export function parseFieldsSafe(input: unknown): FormField[] {
  const result = validateFields(input)
  return result.ok ? result.fields : []
}
