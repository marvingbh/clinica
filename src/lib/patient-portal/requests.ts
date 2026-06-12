import type { PortalPatientProfile } from "./serialize"

/** Patient profile fields a portal user may request to change. */
export const UPDATABLE_PROFILE_FIELDS = [
  "name",
  "phone",
  "email",
  "addressStreet",
  "addressNumber",
  "addressNeighborhood",
  "addressCity",
  "addressState",
  "addressZip",
] as const

export type UpdatableProfileField = (typeof UPDATABLE_PROFILE_FIELDS)[number]

export interface UpdateChange {
  field: UpdatableProfileField
  current: string | null
  requested: string | null
}

const FIELD_LABELS: Record<UpdatableProfileField, string> = {
  name: "Nome",
  phone: "Telefone",
  email: "E-mail",
  addressStreet: "Logradouro",
  addressNumber: "Número",
  addressNeighborhood: "Bairro",
  addressCity: "Cidade",
  addressState: "Estado",
  addressZip: "CEP",
}

/**
 * Diffs requested values against the current profile. Ignores unchanged or
 * absent fields and silently drops any key that is not in the allow-list.
 */
export function buildUpdateRequestPayload(
  current: PortalPatientProfile,
  requested: Partial<Record<string, string | null>>,
): UpdateChange[] {
  const changes: UpdateChange[] = []
  for (const field of UPDATABLE_PROFILE_FIELDS) {
    if (!(field in requested)) continue
    const next = requested[field] ?? null
    const cur = (current as unknown as Record<string, unknown>)[field]
    const curValue = cur == null ? null : String(cur)
    const nextValue = next == null || next === "" ? null : String(next)
    if (curValue === nextValue) continue
    changes.push({ field, current: curValue, requested: nextValue })
  }
  return changes
}

export function fieldLabel(field: UpdatableProfileField): string {
  return FIELD_LABELS[field]
}

/** Human-readable one-liner for the staff queue. */
export function summarizePortalRequest(req: {
  type: string
  payload: unknown
}): string {
  if (req.type === "RESCHEDULE") {
    const payload = (req.payload ?? {}) as { message?: string; preferences?: unknown[] }
    const prefs = Array.isArray(payload.preferences) ? payload.preferences.length : 0
    const msg = payload.message ? `: "${payload.message}"` : ""
    return `Solicitação de reagendamento${msg}${prefs ? ` (${prefs} preferência(s))` : ""}`
  }
  if (req.type === "UPDATE_DATA") {
    const payload = (req.payload ?? {}) as { changes?: UpdateChange[] }
    const changes = payload.changes ?? []
    const fields = changes.map((c) => FIELD_LABELS[c.field] ?? c.field).join(", ")
    return `Atualização de dados: ${fields || "(nenhum campo)"}`
  }
  if (req.type === "LGPD_EXPORT") {
    return "Solicitação de dados (LGPD)"
  }
  return "Solicitação do portal"
}

/**
 * Builds a Patient update object from approved UPDATE_DATA changes, accepting
 * only allow-listed fields. Returns an empty object when nothing is applicable.
 */
export function changesToPatientUpdate(
  changes: UpdateChange[] | undefined,
): Record<string, string | null> {
  const allowed = new Set<string>(UPDATABLE_PROFILE_FIELDS)
  const update: Record<string, string | null> = {}
  for (const change of changes ?? []) {
    if (!allowed.has(change.field)) continue
    update[change.field] = change.requested
  }
  return update
}

/** Todo title for the professional handling a reschedule request. */
export function rescheduleTodoTitle(args: { patientName: string; scheduledAt: Date }): string {
  const d = args.scheduledAt
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const hours = String(d.getHours()).padStart(2, "0")
  const minutes = String(d.getMinutes()).padStart(2, "0")
  return `Reagendar: ${args.patientName} — ${day}/${month} ${hours}:${minutes}`
}
