/**
 * Weekly slot (day-of-week + HH:mm) for an invoice, inferred from the patient's
 * appointments on that invoice. Used to order per-professional repasse lines
 * the same way legacy spreadsheets list patients (Mon 9:00, Mon 10:00, Tue 9:00…).
 */

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

export interface InvoiceSlot {
  dayOfWeek: number // 0 = Sunday … 6 = Saturday
  time: string // HH:mm
}

export interface SlotItemInput {
  invoiceId: string
  appointment: {
    scheduledAt: Date
    recurrence: { dayOfWeek: number; startTime: string } | null
  } | null
}

function slotFromDate(d: Date): InvoiceSlot {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun"
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00"
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00"
  // Intl 24-hour can return "24" for midnight on some engines — normalize.
  const hh = hour === "24" ? "00" : hour
  return { dayOfWeek: WEEKDAY_INDEX[weekday] ?? 0, time: `${hh}:${minute}` }
}

/**
 * Build a per-invoice slot map.
 * Preference per invoice: any item linked to a recurring appointment (stable,
 * lives in local clinic time). Fallback: earliest scheduledAt rendered in
 * America/Sao_Paulo. Items without an appointment are ignored.
 */
export function buildInvoiceSlotMap(items: SlotItemInput[]): Map<string, InvoiceSlot> {
  const recurring = new Map<string, InvoiceSlot>()
  const earliest = new Map<string, { at: Date; slot: InvoiceSlot }>()

  for (const item of items) {
    if (!item.appointment) continue
    const apt = item.appointment
    if (apt.recurrence) {
      if (!recurring.has(item.invoiceId)) {
        recurring.set(item.invoiceId, {
          dayOfWeek: apt.recurrence.dayOfWeek,
          time: apt.recurrence.startTime,
        })
      }
      continue
    }
    const existing = earliest.get(item.invoiceId)
    if (!existing || apt.scheduledAt < existing.at) {
      earliest.set(item.invoiceId, { at: apt.scheduledAt, slot: slotFromDate(apt.scheduledAt) })
    }
  }

  const out = new Map<string, InvoiceSlot>()
  for (const [invoiceId, slot] of recurring) out.set(invoiceId, slot)
  for (const [invoiceId, { slot }] of earliest) {
    if (!out.has(invoiceId)) out.set(invoiceId, slot)
  }
  return out
}

export function compareSlots(a: InvoiceSlot | null, b: InvoiceSlot | null): number {
  if (a && b) {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek
    return a.time.localeCompare(b.time)
  }
  if (a) return -1
  if (b) return 1
  return 0
}
