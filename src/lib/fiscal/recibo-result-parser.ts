import { FiscalParseError, type ReciboResultLine } from "./types"

// ⚠️ LAYOUT VERSION — Receita Saúde result file parser (see plan §6 R1).
// The official RFB result/trace layout is NOT yet verified. This parser is
// isolated + versioned alongside recibo-file-builder.ts. It accepts the
// reference layout this system exports (the paymentKey embedded per line) and
// is tolerant of leading header lines and blank lines.
//
// Result detail line format:
//   S|<paymentKey>|<reciboNumero>            (success / EMITIDO)
//   E|<paymentKey>|<mensagem RFB>            (error / ERRO)
// Header lines start with "H" and are ignored.

const FIELD_SEP = "|"

/**
 * Parses an RFB result file into per-line outcomes. Throws {@link FiscalParseError}
 * when the content has no interpretable detail lines (garbage / empty / wrong
 * format), so the caller can return a 422 instead of silently importing nothing.
 */
export function parseReciboResultFile(content: string): ReciboResultLine[] {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new FiscalParseError()
  }

  const lines = content.split(/\r?\n/)
  const results: ReciboResultLine[] = []
  let sawDetail = false
  let sawUnknown = false

  for (const raw of lines) {
    const line = raw.trim()
    if (line.length === 0) continue

    const tag = line[0].toUpperCase()
    if (tag === "H") continue // header — ignore

    const parts = line.split(FIELD_SEP)

    if (tag === "S" && parts.length >= 3) {
      sawDetail = true
      results.push({
        paymentKey: parts[1].trim() || null,
        outcome: "EMITIDO",
        reciboNumero: parts[2].trim() || undefined,
      })
      continue
    }

    if (tag === "E" && parts.length >= 3) {
      sawDetail = true
      results.push({
        paymentKey: parts[1].trim() || null,
        outcome: "ERRO",
        message: parts.slice(2).join(FIELD_SEP).trim() || undefined,
      })
      continue
    }

    sawUnknown = true
  }

  // A file with only unrecognizable lines (and no valid detail) is garbage.
  if (!sawDetail) {
    if (sawUnknown) throw new FiscalParseError()
    throw new FiscalParseError()
  }

  return results
}
