import type { FormResponseStatus } from "@prisma/client"

export const FORM_STATUS_LABELS: Record<FormResponseStatus, string> = {
  ENVIADO: "Enviado",
  EM_PREENCHIMENTO: "Em preenchimento",
  CONCLUIDO: "Concluído",
  EXPIRADO: "Expirado",
}

/** Statuses that are still "pending" — a passed expiry flips them to EXPIRADO. */
const PENDING_STATUSES: ReadonlySet<FormResponseStatus> = new Set<FormResponseStatus>([
  "ENVIADO",
  "EM_PREENCHIMENTO",
])

/**
 * Derives the effective status at read time. A pending response whose
 * `expiresAt` is in the past is reported as EXPIRADO without persisting
 * anything — no cron job is needed. CONCLUIDO and a persisted EXPIRADO are
 * returned unchanged.
 */
export function effectiveStatus(
  response: { status: FormResponseStatus; expiresAt: Date },
  now: Date
): FormResponseStatus {
  if (PENDING_STATUSES.has(response.status) && response.expiresAt.getTime() < now.getTime()) {
    return "EXPIRADO"
  }
  return response.status
}
