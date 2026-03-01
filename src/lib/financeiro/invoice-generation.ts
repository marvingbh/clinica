/**
 * Pure helper functions for invoice generation logic.
 * Extracted from the generation route to keep it under 200 lines.
 */

export interface InvoiceItemForSeparation {
  id: string
  appointmentId: string | null
  type: string
}

export interface ConsumedCredit {
  id: string
  reason: string | null
}

/**
 * Determines which professional to assign to the invoice.
 * Uses the patient's reference professional if set, otherwise picks
 * the professional with the most sessions.
 */
export function determineInvoiceProfessional(
  referenceProfId: string | null,
  appointments: { professionalProfileId: string }[],
): string {
  if (referenceProfId) return referenceProfId

  const counts = new Map<string, number>()
  for (const apt of appointments) {
    counts.set(apt.professionalProfileId, (counts.get(apt.professionalProfileId) || 0) + 1)
  }

  let bestId = appointments[0].professionalProfileId
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestId = id
      bestCount = count
    }
  }
  return bestId
}

/**
 * Returns true if the invoice should be skipped during regeneration
 * (i.e., it's already paid or sent).
 */
export function shouldSkipInvoice(status: string): boolean {
  return status === "PAGO" || status === "ENVIADO"
}

/**
 * Separates invoice items into auto-generated and manual.
 * Auto items: have an appointmentId OR are CREDITO with a matching consumed SessionCredit.
 * Manual items: everything else (user-added items, including manual credits).
 */
export function separateManualItems<T extends InvoiceItemForSeparation & { description: string }>(
  items: T[],
  consumedCredits: ConsumedCredit[] = [],
): { autoItems: T[]; manualItems: T[] } {
  const autoItems: T[] = []
  const manualItems: T[] = []

  // Build set of auto-credit descriptions (format: "Crédito: {reason}")
  const autoCreditDescriptions = new Set(
    consumedCredits.map(c => `Crédito: ${c.reason || ""}`)
  )

  for (const item of items) {
    if (item.appointmentId !== null) {
      // Appointment-linked items are always auto
      autoItems.push(item)
    } else if (item.type === "CREDITO" && autoCreditDescriptions.has(item.description)) {
      // CREDITO items that match a consumed SessionCredit are auto
      autoItems.push(item)
    } else {
      // Everything else (including manual credits) is manual
      manualItems.push(item)
    }
  }

  return { autoItems, manualItems }
}
