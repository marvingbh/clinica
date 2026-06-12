import { stripCpf } from "./cpf"
import type { ExportableRecibo, ReciboIssuer } from "./types"

// ⚠️ LAYOUT VERSION — Receita Saúde batch file (fluxo de lote 11/2025).
// The official RFB layout for the batch-import flow is NOT yet verified (see
// plan §6 R1). This builder is intentionally isolated and versioned: the rest
// of the feature does not depend on these bytes. When the official spec lands,
// bump RECIBO_LAYOUT_VERSION and adjust ONLY this file + its parser counterpart.
// The roundtrip test (builder → parser) guards the contract.
export const RECIBO_LAYOUT_VERSION = "RS-2025.11-v1"

const FIELD_SEP = "|"
const LINE_SEP = "\n"

/** ISO date (YYYY-MM-DD) from a @db.Date without timezone shift. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Amount as integer centavos (no separator) — the RFB layouts use centavos. */
function centavos(amount: number): string {
  return String(Math.round(amount * 100))
}

function sanitize(text: string): string {
  // Strip the field/line separators from free-text to keep the layout parseable.
  return text.replace(/[|\r\n]/g, " ").trim()
}

/**
 * Builds the Receita Saúde batch file for ONE professional (one issuer CPF per
 * file — see plan Q1). Lines are sorted by payment date ascending. The first
 * field of every detail line is the embedded line reference (paymentKey) so the
 * result parser can re-associate each outcome with its emission row.
 *
 * Format (version-tagged header + 1 detail line per receipt):
 *   H|RS-2025.11-v1|<issuerCpf>|<issuerCrp>|<issuerName>|<count>
 *   R|<paymentKey>|<paymentDate>|<beneficiaryCpf>|<beneficiaryName>|<beneficiaryBirth>|<payerCpf>|<payerName>|<centavos>
 */
export function buildReciboBatchFile(rows: ExportableRecibo[], issuer: ReciboIssuer): string {
  const sorted = [...rows].sort((a, b) => isoDate(a.paymentDate).localeCompare(isoDate(b.paymentDate)))

  const header = [
    "H",
    RECIBO_LAYOUT_VERSION,
    stripCpf(issuer.cpf),
    sanitize(issuer.crp),
    sanitize(issuer.name),
    String(sorted.length),
  ].join(FIELD_SEP)

  const lines = sorted.map((r) =>
    [
      "R",
      r.paymentKey,
      isoDate(r.paymentDate),
      stripCpf(r.beneficiaryCpf),
      sanitize(r.beneficiaryName),
      isoDate(r.beneficiaryBirthDate),
      stripCpf(r.payerCpf),
      sanitize(r.payerName),
      centavos(r.amount),
    ].join(FIELD_SEP)
  )

  return [header, ...lines].join(LINE_SEP) + LINE_SEP
}

/** Stable file name: recibos-saude_<cpf>_<YYYYMMDD-HHmm>.txt */
export function buildReciboBatchFileName(issuer: ReciboIssuer, generatedAt: Date): string {
  const cpf = stripCpf(issuer.cpf)
  const y = generatedAt.getFullYear()
  const mo = String(generatedAt.getMonth() + 1).padStart(2, "0")
  const d = String(generatedAt.getDate()).padStart(2, "0")
  const h = String(generatedAt.getHours()).padStart(2, "0")
  const mi = String(generatedAt.getMinutes()).padStart(2, "0")
  return `recibos-saude_${cpf}_${y}${mo}${d}-${h}${mi}.txt`
}
