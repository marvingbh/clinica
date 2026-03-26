/**
 * Normalize a bank transaction description for pattern matching.
 * Strips common prefixes (PIX, TED, DOC, TRANSF), lowercases,
 * removes excess whitespace and trailing digit-only tokens.
 */
export function normalizeDescription(raw: string): string {
  let normalized = raw.toLowerCase().trim()

  // Remove common transaction prefixes
  const prefixes = [
    "pix enviado", "pix recebido", "pix envio", "pix ",
    "ted enviada", "ted recebida", "ted ",
    "doc enviado", "doc ",
    "transf enviada", "transf recebida", "transf ",
    "pgto ", "pagto ", "pagamento ",
    "deb auto ", "debito automatico ",
  ]

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length).trim()
      break
    }
  }

  // Remove trailing digit-only tokens (reference numbers, transaction IDs)
  normalized = normalized.replace(/\s+\d{4,}$/g, "").trim()

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ")

  return normalized
}
