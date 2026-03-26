import crypto from "crypto"
import type { NormalizedTransaction, BankStatementProvider } from "./types"

/**
 * Parse OFX 2.x (XML-based) bank statement format.
 * Extracts transactions from <STMTTRN> elements.
 */
export const ofxParser: BankStatementProvider = {
  parse(data: string): NormalizedTransaction[] {
    const transactions: NormalizedTransaction[] = []

    // Find all STMTTRN blocks (OFX transaction elements)
    const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
    let match

    while ((match = trnRegex.exec(data)) !== null) {
      const block = match[1]

      const amount = extractTag(block, "TRNAMT")
      const dateStr = extractTag(block, "DTPOSTED")
      const fitId = extractTag(block, "FITID")
      const name = extractTag(block, "NAME")
      const memo = extractTag(block, "MEMO")

      if (!amount || !dateStr) continue

      const amountNum = parseFloat(amount)
      const type: "CREDIT" | "DEBIT" = amountNum >= 0 ? "CREDIT" : "DEBIT"
      const absAmount = Math.abs(amountNum)

      // Parse OFX date format: YYYYMMDD or YYYYMMDDHHMMSS
      const date = parseOfxDate(dateStr)
      if (!date) continue

      const description = [name, memo].filter(Boolean).join(" - ")
      const externalId = fitId || generateHash(date, absAmount, description)

      transactions.push({
        externalId,
        date,
        amount: absAmount,
        type,
        description: description || "Sem descrição",
        payerName: name || undefined,
      })
    }

    return transactions
  },
}

function extractTag(block: string, tag: string): string | null {
  // Handle both XML-style <TAG>value</TAG> and SGML-style <TAG>value\n
  const xmlMatch = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i").exec(block)
  if (xmlMatch) return xmlMatch[1].trim()

  const sgmlMatch = new RegExp(`<${tag}>(.+)`, "i").exec(block)
  if (sgmlMatch) return sgmlMatch[1].trim()

  return null
}

function parseOfxDate(dateStr: string): string | null {
  // YYYYMMDD[HHMMSS[.XXX]]
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(dateStr)
  if (!match) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

function generateHash(date: string, amount: number, description: string): string {
  return crypto.createHash("md5").update(`${date}|${amount}|${description}`).digest("hex").substring(0, 16)
}
