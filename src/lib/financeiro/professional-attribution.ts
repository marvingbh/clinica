/**
 * Decides how an invoice should display the attending professional(s):
 *  - "single" mode: 0 or 1 distinct attending professional → flat layout, no
 *    per-section header, today's appearance.
 *  - "multi" mode: 2+ distinct attending professionals → one section per
 *    professional plus an "Outros" bucket for items without an attending
 *    professional, plus a final dedicated "Créditos" bucket.
 *
 * Pure module — no Prisma, no I/O. Consumed by the email template helper, the
 * PDF data builder, and the HTML invoice page.
 */

export const OTHERS_SECTION_LABEL = "Outros"
export const CREDITS_SECTION_LABEL = "Créditos"
export const SECTION_HEADER_PREFIX = "Atendido por "

export interface AttributionItem {
  appointmentId: string | null
  type: string
  attendingProfessionalId: string | null
  attendingProfessionalName: string | null
}

export interface AttributionSection<T> {
  /** Header label, or null when single-mode (flat). */
  header: string | null
  /** "professional" | "others" | "credits" — useful for callers that want to style sections differently. */
  kind: "professional" | "others" | "credits"
  /** Stable identifier for "professional" sections (the attending professional id). */
  professionalId: string | null
  items: T[]
}

export interface AttributionLayout<T> {
  mode: "single" | "multi"
  /**
   * Header line shown near the patient name. Null when there is nothing
   * meaningful to display (no reference professional and multi-attending).
   */
  headerLine: string | null
  sections: Array<AttributionSection<T>>
}

export interface AttributionInputs<T extends AttributionItem> {
  items: T[]
  referenceProfessionalName: string | null
  /**
   * Fallback professional name shown in single-mode when the patient has no
   * referenceProfessional. Typically the invoice's own
   * `professionalProfile.user.name`.
   */
  invoiceProfessionalName: string | null
}

/**
 * Compute layout sections + header line for the items of a single invoice.
 *
 * Sort order inside each section: items keep the caller-provided order. The
 * caller is expected to pre-sort (typically by appointment.scheduledAt asc),
 * which matches the existing PDF behaviour and avoids having two sort sites.
 */
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

  // ----- Header line -----
  let headerLine: string | null = null
  if (referenceProfessionalName) {
    headerLine = `Técnico de referência: ${referenceProfessionalName}`
  } else if (mode === "single") {
    // Prefer the single distinct attending professional's name; if none,
    // fall back to the invoice's own professionalProfile name (if provided).
    const onlyAttending = items.find(
      i => i.type !== "CREDITO" && i.attendingProfessionalName,
    )?.attendingProfessionalName
    const fallbackName = onlyAttending ?? invoiceProfessionalName
    if (fallbackName) headerLine = `Profissional: ${fallbackName}`
  }
  // multi-mode without referenceProfessionalName → no header line

  // ----- Sections -----
  if (mode === "single") {
    return {
      mode,
      headerLine,
      sections: [
        { header: null, kind: "professional", professionalId: null, items: [...items] },
      ],
    }
  }

  // Multi mode — one section per attending professional + "Outros" + "Créditos"
  // Preserve first-seen order of professionals based on input items (callers
  // pre-sort by date, so this gives a stable, date-based section order too).
  const profOrder: string[] = []
  const profSeen = new Set<string>()
  const profNameById = new Map<string, string>()
  for (const it of items) {
    if (it.type === "CREDITO") continue
    if (!it.attendingProfessionalId) continue
    if (!profSeen.has(it.attendingProfessionalId)) {
      profSeen.add(it.attendingProfessionalId)
      profOrder.push(it.attendingProfessionalId)
      profNameById.set(
        it.attendingProfessionalId,
        it.attendingProfessionalName ?? "Profissional",
      )
    }
  }

  const profSections: Array<AttributionSection<T>> = profOrder.map(profId => ({
    header: `${SECTION_HEADER_PREFIX}${profNameById.get(profId)}`,
    kind: "professional",
    professionalId: profId,
    items: items.filter(
      i => i.type !== "CREDITO" && i.attendingProfessionalId === profId,
    ),
  }))

  const othersItems = items.filter(
    i => i.type !== "CREDITO" && !i.attendingProfessionalId,
  )
  const creditItems = items.filter(i => i.type === "CREDITO")

  const sections: Array<AttributionSection<T>> = [...profSections]
  if (othersItems.length > 0) {
    sections.push({
      header: OTHERS_SECTION_LABEL,
      kind: "others",
      professionalId: null,
      items: othersItems,
    })
  }
  if (creditItems.length > 0) {
    sections.push({
      header: CREDITS_SECTION_LABEL,
      kind: "credits",
      professionalId: null,
      items: creditItems,
    })
  }

  return { mode, headerLine, sections }
}

export interface DescriptionInputs {
  type: string
  /** Existing description (e.g. "Sessão grupo - 10/03"). */
  baseDescription: string
  /** Therapy group name when the appointment was a group session. */
  groupName?: string | null
  /** Attending professional name — only applied when caller asks. */
  attendingProfessionalName?: string | null
}

export interface EnrichOptions {
  /** Inject the group name on SESSAO_GRUPO items. */
  includeGroupName?: boolean
  /** Append " · <name>" to the description (only used by flat email rendering). */
  includeAttendingName?: boolean
}

/**
 * Enrich a line's description with the therapy group name and/or attending
 * professional name. Other types pass through unchanged. Existing cached
 * descriptions render as-is until the invoice is regenerated.
 *
 * Output examples (when the description is already in the new format):
 *   - SESSAO_GRUPO base "Psicoterapia em grupo - 10/03" + group "Keep Lua"
 *     → "Psicoterapia em grupo — Keep Lua - 10/03"
 *   - SESSAO_REGULAR base "Psicoterapia individual - 02/03" + attending "Elena"
 *     → "Psicoterapia individual - 02/03 · Elena"
 */
export function enrichItemDescription(
  inputs: DescriptionInputs,
  options: EnrichOptions = {},
): string {
  const { type, baseDescription, groupName, attendingProfessionalName } = inputs
  const { includeGroupName = false, includeAttendingName = false } = options

  let description = baseDescription
  if (includeGroupName && type === "SESSAO_GRUPO" && groupName && !description.includes("—")) {
    // Inject the therapy group name once after the prefix produced by the
    // current generator. Pre-existing items with older descriptions are left
    // alone — recalculating the invoice regenerates them with the new label.
    description = description.replace(/^Psicoterapia em grupo/, `Psicoterapia em grupo — ${groupName}`)
  }
  if (includeAttendingName && attendingProfessionalName && type !== "CREDITO") {
    description = `${description} · ${attendingProfessionalName}`
  }
  return description
}
