import { formatDateISOInZone } from "@/lib/calendar-sync/tz-format"
import { computeOpenBalance, type DunningInvoiceInput } from "@/lib/cobranca"

/** Today's calendar date (YYYY-MM-DD) in the clinic's timezone. */
export function todayInZone(now: Date, timeZone: string): string {
  return formatDateISOInZone(now, timeZone)
}

/** The widest [earliest, latest] dueDate window that any offset could target today. */
export function dueDateWindow(
  today: string,
  offsets: number[]
): { gte: string; lte: string } {
  // candidate dueDate = today - offset (since match is dueDate + offset === today)
  const dues = offsets.map((o) => addDays(today, -o))
  return { gte: minStr(dues), lte: maxStr(dues) }
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function minStr(arr: string[]): string {
  return arr.reduce((a, b) => (a < b ? a : b))
}
function maxStr(arr: string[]): string {
  return arr.reduce((a, b) => (a > b ? a : b))
}

/** Shape of an invoice row loaded for the dunning job (Prisma-agnostic). */
export interface DunningInvoiceRow {
  id: string
  status: string
  dueDate: Date
  totalAmount: number
  linkAmounts: number[]
  patient: {
    dunningOptOut: boolean
    consentWhatsApp: boolean
    consentEmail: boolean
    phone: string | null
    email: string | null
  } | null
  reminders: Array<{ createdAt: Date }>
}

/** Maps a loaded invoice row to the pure selector's input (dates in clinic tz). */
export function toDunningInput(
  row: DunningInvoiceRow,
  timeZone: string
): DunningInvoiceInput | null {
  if (!row.patient) return null
  if (row.status !== "PENDENTE" && row.status !== "ENVIADO" && row.status !== "PARCIAL") {
    return null
  }
  const reminderDates = row.reminders.map((r) => formatDateISOInZone(r.createdAt, timeZone))
  const lastReminderDate = reminderDates.length
    ? reminderDates.reduce((a, b) => (a > b ? a : b))
    : null
  return {
    invoiceId: row.id,
    status: row.status,
    dueDate: formatDateISOInZone(row.dueDate, timeZone),
    openAmount: computeOpenBalance(row.totalAmount, row.linkAmounts),
    patient: {
      dunningOptOut: row.patient.dunningOptOut,
      consentWhatsApp: row.patient.consentWhatsApp,
      consentEmail: row.patient.consentEmail,
      hasPhone: !!row.patient.phone,
      hasEmail: !!row.patient.email,
    },
    remindersSent: row.reminders.length,
    lastReminderDate,
  }
}
