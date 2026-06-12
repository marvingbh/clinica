import type { WaitlistPreferences } from "./types"

/** pt-BR labels for entry status. */
export const WAITLIST_ENTRY_STATUS_LABELS: Record<string, string> = {
  ATIVA: "Ativa",
  OFERTADA: "Oferta enviada",
  CONVERTIDA: "Convertida",
  REMOVIDA: "Removida",
}

/** pt-BR labels for offer status. */
export const WAITLIST_OFFER_STATUS_LABELS: Record<string, string> = {
  ENVIADA: "Enviada",
  ACEITA: "Aceita",
  EXPIRADA: "Expirada",
  RECUSADA: "Recusada",
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

const MODALITY_LABELS: Record<string, string> = {
  ONLINE: "Online",
  PRESENCIAL: "Presencial",
}

/**
 * Renders preferences into a compact pt-BR summary, e.g.
 * "Seg, Qua • 18:00–21:00 • Online". Empty fields collapse to
 * "Qualquer dia"/"Qualquer horário"/"Qualquer modalidade".
 */
export function formatPreferencesSummary(prefs: WaitlistPreferences): string {
  const days =
    prefs.weekdays.length > 0
      ? prefs.weekdays.map((w) => WEEKDAY_LABELS[w] ?? "?").join(", ")
      : "Qualquer dia"

  const times =
    prefs.timeRanges.length > 0
      ? prefs.timeRanges.map((r) => `${r.start}–${r.end}`).join(", ")
      : "Qualquer horário"

  const modality = prefs.modality ? MODALITY_LABELS[prefs.modality] : "Qualquer modalidade"

  return `${days} • ${times} • ${modality}`
}

/** pt-BR label for an optional professional ("Qualquer profissional" when null). */
export function professionalLabel(name: string | null | undefined): string {
  return name ?? "Qualquer profissional"
}
