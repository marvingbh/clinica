export type DunningChannel = "WHATSAPP" | "EMAIL"

export interface DunningInvoiceInput {
  invoiceId: string
  status: "PENDENTE" | "ENVIADO" | "PARCIAL"
  dueDate: string // YYYY-MM-DD (clinic timezone)
  openAmount: number
  patient: {
    dunningOptOut: boolean
    consentWhatsApp: boolean
    consentEmail: boolean
    hasPhone: boolean
    hasEmail: boolean
  }
  remindersSent: number // count of Notification PAYMENT_REMINDER for the invoice
  lastReminderDate: string | null // YYYY-MM-DD of last send (daily idempotency)
}

export interface DunningConfigInput {
  enabled: boolean
  offsets: number[]
  sendWhatsApp: boolean
  sendEmail: boolean
  maxAttempts: number
}

export interface DunningCandidate {
  invoiceId: string
  offset: number
  channels: DunningChannel[]
}

/** YYYY-MM-DD string + N days -> YYYY-MM-DD string (UTC-safe, no tz drift). */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/**
 * Selects which invoices should receive a dunning reminder today.
 *
 * Rules (all must hold):
 * - config.enabled
 * - openAmount > 0 (PAGO/CANCELADO never reach here as they are excluded upstream;
 *   defense-in-depth keeps only PENDENTE/ENVIADO/PARCIAL)
 * - today === dueDate + offset for some offset in config.offsets
 * - remindersSent < maxAttempts
 * - lastReminderDate !== today (one send per invoice per day)
 * - not dunningOptOut
 * - resulting channels = intersection(config channels, consent, contact available); empty -> skipped
 *
 * Multiple matching offsets on the same day produce a single candidate (first match wins).
 */
export function selectDunningCandidates(
  invoices: DunningInvoiceInput[],
  config: DunningConfigInput,
  today: string
): DunningCandidate[] {
  if (!config.enabled) return []

  const out: DunningCandidate[] = []
  for (const inv of invoices) {
    if (inv.openAmount <= 0) continue
    if (inv.patient.dunningOptOut) continue
    if (inv.remindersSent >= config.maxAttempts) continue
    if (inv.lastReminderDate === today) continue

    const offset = config.offsets.find((o) => addDays(inv.dueDate, o) === today)
    if (offset === undefined) continue

    const channels: DunningChannel[] = []
    if (config.sendWhatsApp && inv.patient.consentWhatsApp && inv.patient.hasPhone) {
      channels.push("WHATSAPP")
    }
    if (config.sendEmail && inv.patient.consentEmail && inv.patient.hasEmail) {
      channels.push("EMAIL")
    }
    if (channels.length === 0) continue

    out.push({ invoiceId: inv.invoiceId, offset, channels })
  }
  return out
}
