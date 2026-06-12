import { validateCnpj } from "@/lib/nfse"
import { stripCpf, validateCpf } from "./cpf"
import type { DmedConfig, DmedReport } from "./types"

// ⚠️ LAYOUT VERSION — DMED file (see plan §6 R1). The official leiaute DMED is
// NOT yet verified. This builder is isolated + versioned; bump the version and
// edit ONLY this file when the official spec lands. Golden-file test guards it.
export const DMED_LAYOUT_VERSION = "DMED-v1"

const FIELD_SEP = "|"
const LINE_SEP = "\n"

function centavos(amount: number): string {
  return String(Math.round(amount * 100))
}

function sanitize(text: string): string {
  return text.replace(/[|\r\n]/g, " ").trim()
}

function isoDateOrEmpty(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : ""
}

/**
 * Builds the DMED text file for the calendar year.
 *
 * Record layout (version-tagged):
 *   DMED|DMED-v1|<year>|<cnpj>|<nomeEmpresarial>
 *   RESP|<responsavelCpf>|<responsavelNome>|<ddd>|<telefone>
 *   PAG|<payerCpf>|<payerName>|<totalCentavos>
 *   BEN|<beneficiaryCpf>|<beneficiaryName>|<birthDate>|<totalCentavos>   (0..n per PAG)
 *   T9|<payerCount>|<grandTotalCentavos>
 */
export function buildDmedFile(report: DmedReport, config: DmedConfig): string {
  const lines: string[] = []

  lines.push(
    ["DMED", DMED_LAYOUT_VERSION, String(report.year), stripCpf(config.cnpj), sanitize(config.nomeEmpresarial)].join(
      FIELD_SEP
    )
  )
  lines.push(
    [
      "RESP",
      stripCpf(config.responsavelCpf),
      sanitize(config.responsavelNome),
      sanitize(config.responsavelDdd ?? ""),
      sanitize(config.responsavelTelefone ?? ""),
    ].join(FIELD_SEP)
  )

  for (const payer of report.payers) {
    lines.push(["PAG", payer.cpf, sanitize(payer.name), centavos(payer.total)].join(FIELD_SEP))
    for (const benef of payer.beneficiaries) {
      lines.push(
        ["BEN", benef.cpf, sanitize(benef.name), isoDateOrEmpty(benef.birthDate), centavos(benef.total)].join(
          FIELD_SEP
        )
      )
    }
  }

  lines.push(["T9", String(report.payers.length), centavos(report.grandTotal)].join(FIELD_SEP))

  return lines.join(LINE_SEP) + LINE_SEP
}

/** Returns a pt-BR list of validation errors (empty array when the config is complete). */
export function validateDmedConfig(config: Partial<DmedConfig>): string[] {
  const errors: string[] = []

  if (!config.cnpj || !validateCnpj(config.cnpj)) errors.push("CNPJ inválido ou ausente")
  if (!config.nomeEmpresarial || config.nomeEmpresarial.trim().length === 0)
    errors.push("Nome empresarial obrigatório")
  if (!config.responsavelCpf || !validateCpf(config.responsavelCpf))
    errors.push("CPF do responsável inválido ou ausente")
  if (!config.responsavelNome || config.responsavelNome.trim().length === 0)
    errors.push("Nome do responsável obrigatório")

  return errors
}
