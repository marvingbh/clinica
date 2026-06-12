import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import { formatCpf } from "./cpf"
import type { DmedReport } from "./types"

const SEP = ";"
const BOM = "﻿"
const LINE_SEP = "\r\n"

function escapeField(value: string): string {
  // Quote fields containing the separator, quotes or newlines.
  if (/[";\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function row(cells: string[]): string {
  return cells.map(escapeField).join(SEP)
}

/**
 * Builds the DMED conference CSV (semicolon-separated, UTF-8 BOM for Excel
 * pt-BR). One line per payer, followed by an indented beneficiary line whenever
 * payer ≠ beneficiary. R$ values via formatCurrencyBRL, dates as DD/MM/YYYY.
 */
export function buildDmedCsv(report: DmedReport): string {
  const lines: string[] = []
  lines.push(row(["Tipo", "CPF", "Nome", "Nascimento", "Total"]))

  for (const payer of report.payers) {
    lines.push(row(["Pagador", formatCpf(payer.cpf), payer.name, "", formatCurrencyBRL(payer.total)]))
    for (const benef of payer.beneficiaries) {
      lines.push(
        row([
          "  Beneficiário",
          formatCpf(benef.cpf),
          benef.name,
          benef.birthDate ? formatDateBR(benef.birthDate.toISOString()) : "",
          formatCurrencyBRL(benef.total),
        ])
      )
    }
  }

  lines.push(row(["Total geral", "", "", "", formatCurrencyBRL(report.grandTotal)]))

  return BOM + lines.join(LINE_SEP) + LINE_SEP
}
