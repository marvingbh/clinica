/**
 * Client-side mirror of the manual placeholder keys and their labels. Used to
 * render the right inputs in the wizard's "Dados" step. The server registry in
 * src/lib/documents/placeholders.ts is the source of truth — this list only
 * decides which inputs to show.
 */
export const MANUAL_FIELD_LABELS: Record<string, string> = {
  finalidade: "Finalidade",
  periodoAfastamento: "Período de afastamento",
  identificacao: "Identificação",
  demanda: "Demanda",
  procedimento: "Procedimento",
  analise: "Análise",
  conclusao: "Conclusão",
  exposicaoMotivos: "Exposição de motivos",
  destinatario: "Destinatário",
  motivoEncaminhamento: "Motivo do encaminhamento",
  tussCode: "Código TUSS (opcional)",
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g

/** Returns the manual placeholder keys present in a template body, in order. */
export function manualKeysInBody(body: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  PLACEHOLDER_RE.lastIndex = 0
  while ((m = PLACEHOLDER_RE.exec(body)) !== null) {
    const key = m[1]
    if (MANUAL_FIELD_LABELS[key] && !seen.has(key)) {
      seen.add(key)
      found.push(key)
    }
  }
  return found
}

/** True when the body references the session table (recibo flow). */
export function bodyUsesSessions(body: string): boolean {
  return /\{\{\s*sessionList\s*\}\}/.test(body)
}
