import crypto from "crypto"
import type { NormalizedTransaction, BankStatementProvider, CsvParseOptions } from "./types"

/**
 * Parse CSV bank statement with configurable column mapping.
 * Handles Brazilian number format (1.234,56) and semicolon delimiters.
 */
export function createCsvParser(options: CsvParseOptions): BankStatementProvider {
  return {
    parse(data: string): NormalizedTransaction[] {
      const delimiter = options.delimiter ?? detectDelimiter(data)
      const lines = data.split(/\r?\n/).filter((line) => line.trim() !== "")

      const startIndex = options.skipHeader !== false ? 1 : 0
      const transactions: NormalizedTransaction[] = []

      for (let i = startIndex; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i], delimiter)

        const dateStr = cols[options.dateColumn]?.trim()
        const amountStr = cols[options.amountColumn]?.trim()
        const description = cols[options.descriptionColumn]?.trim()

        if (!dateStr || !amountStr || !description) continue

        const date = parseDate(dateStr, options.dateFormat ?? "DD/MM/YYYY")
        if (!date) continue

        const amount = parseBrlNumber(amountStr)
        if (isNaN(amount) || amount === 0) continue

        const type: "CREDIT" | "DEBIT" = amount > 0 ? "CREDIT" : "DEBIT"
        const absAmount = Math.abs(amount)

        const externalId = crypto
          .createHash("md5")
          .update(`${date}|${absAmount}|${description}`)
          .digest("hex")
          .substring(0, 16)

        transactions.push({
          externalId,
          date,
          amount: absAmount,
          type,
          description,
        })
      }

      return transactions
    },
  }
}

/**
 * Auto-detect delimiter: semicolons are common in Brazilian CSVs.
 */
function detectDelimiter(data: string): string {
  const firstLine = data.split(/\r?\n/)[0] ?? ""
  const semicolons = (firstLine.match(/;/g) ?? []).length
  const commas = (firstLine.match(/,/g) ?? []).length
  return semicolons > commas ? ";" : ","
}

/**
 * Parse a CSV line respecting quoted fields.
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

/**
 * Parse number in BRL ("1.234,56") or standard ("1234.56") format.
 * If the string contains a comma, treat it as BRL format.
 */
function parseBrlNumber(str: string): number {
  if (str.includes(",")) {
    // BRL format: dots are thousands separators, comma is decimal
    return parseFloat(str.replace(/\./g, "").replace(",", "."))
  }
  // Standard format: period is decimal
  return parseFloat(str)
}

function parseDate(dateStr: string, format: string): string | null {
  if (format === "DD/MM/YYYY") {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr)
    if (!match) return null
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`
  }
  // YYYY-MM-DD
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return null
  return dateStr
}
