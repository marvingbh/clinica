import type { InvoiceItemType } from "@prisma/client"

/**
 * Decides how an invoice should display the attending professional(s).
 *
 * Pure module — no Prisma, no I/O. Consumed by the email template helper,
 * the PDF data builder, and the HTML invoice page.
 *
 * - **single** mode (0 or 1 distinct attending professional): one section
 *   with a null header, items pass through in caller order.
 * - **multi** mode (2+ distinct attending professionals): one section per
 *   attending professional, plus an "Outros" bucket for items without one
 *   and a trailing "Créditos" bucket for `CREDITO` items.
 */

export const OTHERS_SECTION_LABEL = "Outros"
export const CREDITS_SECTION_LABEL = "Créditos"
export const SECTION_HEADER_PREFIX = "Atendido por "

/** Minimum shape an item must satisfy to be classified by the layout helper. */
export interface AttributionItem {
  type: InvoiceItemType | string
  attendingProfessionalId: string | null
  attendingProfessionalName: string | null
}

export interface AttributionSection<T> {
  /** Section label rendered before the items. Null in single mode. */
  header: string | null
  items: T[]
}

/** Structured header for the patient-facing invoice. */
export interface AttributionHeader {
  /** "Técnico de referência" or "Profissional". */
  label: string
  name: string
}

export interface AttributionLayout<T> {
  mode: "single" | "multi"
  /** Header info shown near the patient name; null when there is nothing useful to display. */
  header: AttributionHeader | null
  sections: Array<AttributionSection<T>>
}

export interface AttributionInputs<T extends AttributionItem> {
  items: T[]
  referenceProfessionalName: string | null
  /**
   * Fallback used in single-mode when the patient has no
   * `referenceProfessional`. Typically the invoice's own
   * `professionalProfile.user.name`.
   */
  invoiceProfessionalName: string | null
}

export function getAttributionLayout<T extends AttributionItem>(
  inputs: AttributionInputs<T>,
): AttributionLayout<T> {
  const { items, referenceProfessionalName, invoiceProfessionalName } = inputs

  const distinctProfIds = new Set<string>()
  for (const it of items) {
    if (it.type === "CREDITO") continue
    if (it.attendingProfessionalId) distinctProfIds.add(it.attendingProfessionalId)
  }
  const mode: "single" | "multi" = distinctProfIds.size >= 2 ? "multi" : "single"

  // ----- Header -----
  let header: AttributionHeader | null = null
  if (referenceProfessionalName) {
    header = { label: "Técnico de referência", name: referenceProfessionalName }
  } else if (mode === "single") {
    const onlyAttending = items.find(
      i => i.type !== "CREDITO" && i.attendingProfessionalName,
    )?.attendingProfessionalName
    const fallback = onlyAttending ?? invoiceProfessionalName
    if (fallback) header = { label: "Profissional", name: fallback }
  }

  // ----- Sections -----
  if (mode === "single") {
    return { mode, header, sections: [{ header: null, items: [...items] }] }
  }

  // First-seen order so sections follow the order items were passed in
  // (callers pre-sort by date — this gives a stable, date-based ordering).
  const profOrder: string[] = []
  const seen = new Set<string>()
  const profNameById = new Map<string, string>()
  for (const it of items) {
    if (it.type === "CREDITO") continue
    if (!it.attendingProfessionalId) continue
    if (!seen.has(it.attendingProfessionalId)) {
      seen.add(it.attendingProfessionalId)
      profOrder.push(it.attendingProfessionalId)
      profNameById.set(
        it.attendingProfessionalId,
        it.attendingProfessionalName ?? "Profissional",
      )
    }
  }

  const sections: Array<AttributionSection<T>> = profOrder.map(profId => ({
    header: `${SECTION_HEADER_PREFIX}${profNameById.get(profId)}`,
    items: items.filter(
      i => i.type !== "CREDITO" && i.attendingProfessionalId === profId,
    ),
  }))

  const others = items.filter(
    i => i.type !== "CREDITO" && !i.attendingProfessionalId,
  )
  const credits = items.filter(i => i.type === "CREDITO")

  if (others.length > 0) sections.push({ header: OTHERS_SECTION_LABEL, items: others })
  if (credits.length > 0) sections.push({ header: CREDITS_SECTION_LABEL, items: credits })

  return { mode, header, sections }
}
