import type { SyncSnapshot, CalendarPrivacyMode } from "./types"

/**
 * Returns the first token of a full name, trimmed. Empty/whitespace-only
 * input yields "". Collapses leading whitespace so "  Maria Silva" → "Maria".
 */
export function firstNameOnly(fullName: string): string {
  const trimmed = (fullName ?? "").trim()
  if (trimmed === "") return ""
  return trimmed.split(/\s+/)[0]
}

/** Fallback titles per type (no patient PII), used by TOTAL mode and non-CONSULTA. */
function typeFallbackLabel(type: SyncSnapshot["type"]): string {
  switch (type) {
    case "REUNIAO":
      return "Reunião"
    case "TAREFA":
      return "Tarefa"
    case "LEMBRETE":
      return "Lembrete"
    case "NOTA":
      return "Nota"
    case "CONSULTA":
    default:
      return "Atendimento"
  }
}

/**
 * Builds the privacy-safe event title.
 *
 * - CONSULTA / TOTAL          → "Atendimento — {clinicName}"
 * - CONSULTA / PRIMEIRO_NOME  → "Atendimento — {firstName}" (falls back to
 *   TOTAL when patientName is null/blank — the nullable-patient gotcha)
 * - TAREFA/REUNIAO/LEMBRETE/NOTA → uses the staff-authored `title` when set
 *   (staff free-text, never patient PII), else "{Label} — {clinicName}".
 *
 * Never includes phone, CPF, e-mail or notes in any mode.
 */
export function buildEventTitle(
  snapshot: SyncSnapshot,
  mode: CalendarPrivacyMode
): string {
  const label = typeFallbackLabel(snapshot.type)

  if (snapshot.type === "CONSULTA") {
    if (mode === "PRIMEIRO_NOME") {
      const first = snapshot.patientName ? firstNameOnly(snapshot.patientName) : ""
      if (first) return `${label} — ${first}`
    }
    return `${label} — ${snapshot.clinicName}`
  }

  // Non-CONSULTA types carry a staff-authored title.
  const staffTitle = (snapshot.title ?? "").trim()
  if (staffTitle) return staffTitle
  return `${label} — ${snapshot.clinicName}`
}
