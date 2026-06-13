export type SignatureRequestStatus =
  | "PENDENTE"
  | "VISUALIZADO"
  | "ASSINADO"
  | "RECUSADO"
  | "EXPIRADO"
  | "CANCELADO"
  | "INVALIDADO"

export type SignatureEnvelopeStatus =
  | "EM_ANDAMENTO"
  | "CONCLUIDO"
  | "RECUSADO"
  | "EXPIRADO"
  | "CANCELADO"
  | "INVALIDADO"

/** Days (after the link was sent) on which a reminder is due. */
export const REMINDER_DAYS = [3, 7] as const
const MAX_REMINDERS = REMINDER_DAYS.length

/** Statuses from which a single request can still be acted upon by the signer. */
const ACTIONABLE: ReadonlySet<SignatureRequestStatus> = new Set(["PENDENTE", "VISUALIZADO"])

/**
 * Returns the request whose turn it is to sign: the lowest `signingOrder`
 * that is still actionable (PENDENTE/VISUALIZADO). Sequential signing means
 * earlier orders must be ASSINADO before later ones become active.
 */
export function activeRequest<T extends { signingOrder: number; status: SignatureRequestStatus }>(
  requests: T[]
): T | null {
  const sorted = [...requests].sort((a, b) => a.signingOrder - b.signingOrder)
  for (const r of sorted) {
    if (r.status === "ASSINADO") continue
    if (ACTIONABLE.has(r.status)) return r
    // A non-signed, non-actionable status (recusado/expirado/cancelado/invalidado)
    // blocks the chain — there is no active request.
    return null
  }
  return null
}

/** Whether staff can resend (regenerate token) for this request. */
export function canResend(request: { status: SignatureRequestStatus }): boolean {
  return (
    request.status === "PENDENTE" ||
    request.status === "VISUALIZADO" ||
    request.status === "EXPIRADO"
  )
}

/** Whether the envelope can still be cancelled (any non-final state). */
export function canCancelEnvelope(status: SignatureEnvelopeStatus): boolean {
  return status === "EM_ANDAMENTO"
}

/** True when a non-final request is past its expiry instant. */
export function isRequestExpired(
  request: { expiresAt: Date; status: SignatureRequestStatus },
  now: Date
): boolean {
  if (!ACTIONABLE.has(request.status)) return false
  return now.getTime() > request.expiresAt.getTime()
}

/**
 * Derives the aggregate envelope status from its requests. Priority:
 * CANCELADO/INVALIDADO/RECUSADO (terminal-by-one) > all ASSINADO ⇒ CONCLUIDO >
 * any EXPIRADO with no actionable left ⇒ EXPIRADO > otherwise EM_ANDAMENTO.
 */
export function envelopeStatusFrom(
  requests: { status: SignatureRequestStatus }[]
): SignatureEnvelopeStatus {
  if (requests.length === 0) return "EM_ANDAMENTO"
  if (requests.some((r) => r.status === "CANCELADO")) return "CANCELADO"
  if (requests.some((r) => r.status === "INVALIDADO")) return "INVALIDADO"
  if (requests.some((r) => r.status === "RECUSADO")) return "RECUSADO"
  if (requests.every((r) => r.status === "ASSINADO")) return "CONCLUIDO"
  const anyActionable = requests.some((r) => ACTIONABLE.has(r.status))
  if (!anyActionable && requests.some((r) => r.status === "EXPIRADO")) return "EXPIRADO"
  return "EM_ANDAMENTO"
}

/**
 * Whether a reminder is due for the active signer. Reminders fire on D+3 and
 * D+7 after the link was sent, at most {@link MAX_REMINDERS} times, only while
 * the request is still actionable, and not twice on the same calendar window.
 */
export function reminderDue(
  request: {
    linkSentAt: Date | null
    remindersSent: number
    lastReminderAt: Date | null
    status: SignatureRequestStatus
  },
  now: Date
): boolean {
  if (!ACTIONABLE.has(request.status)) return false
  if (!request.linkSentAt) return false
  if (request.remindersSent >= MAX_REMINDERS) return false

  const daysSinceSent = Math.floor(
    (now.getTime() - request.linkSentAt.getTime()) / (24 * 60 * 60 * 1000)
  )
  // Which reminders are eligible by elapsed days?
  const eligible = REMINDER_DAYS.filter((d) => daysSinceSent >= d).length
  if (eligible <= request.remindersSent) return false

  // Don't send more than one reminder per day.
  if (request.lastReminderAt) {
    const hoursSinceLast =
      (now.getTime() - request.lastReminderAt.getTime()) / (60 * 60 * 1000)
    if (hoursSinceLast < 24) return false
  }
  return true
}
