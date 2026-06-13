import type { FormField } from "./types"

/** Whether a draft can be published. Requires at least one answerable field. */
export function canPublish(fields: FormField[]): { ok: boolean; error?: string } {
  if (!Array.isArray(fields) || fields.length === 0) {
    return { ok: false, error: "Adicione ao menos um campo antes de publicar" }
  }
  const answerable = fields.some((f) => f.type !== "section")
  if (!answerable) {
    return { ok: false, error: "O formulário precisa de ao menos um campo respondível" }
  }
  return { ok: true }
}

/** Next version number: max existing + 1, or 1 when there are no versions. */
export function nextVersion(versions: Array<{ version: number }>): number {
  if (!versions || versions.length === 0) return 1
  return Math.max(...versions.map((v) => v.version)) + 1
}

/**
 * Whether the working draft differs from the latest published version.
 * No published version yet (latest === null) with a non-empty draft counts as
 * having unpublished changes. Comparison is structural (deep field equality).
 */
export function hasUnpublishedChanges(draft: FormField[], latest: FormField[] | null): boolean {
  if (latest === null) {
    return Array.isArray(draft) && draft.length > 0
  }
  return !fieldsEqual(draft, latest)
}

function fieldsEqual(a: FormField[], b: FormField[]): boolean {
  if (a.length !== b.length) return false
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

/** Stable serialization so key order in stored JSON doesn't cause false diffs. */
function normalize(fields: FormField[]): unknown[] {
  return fields.map((f) => ({
    id: f.id,
    type: f.type,
    label: f.label,
    description: f.description ?? null,
    required: f.required ?? false,
    options: f.options ?? null,
    infoText: f.infoText ?? null,
    visibleWhen: f.visibleWhen ?? null,
  }))
}
