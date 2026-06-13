export interface SignerSummary {
  name: string
  cpf: string | null
  role: string // SignerRole
  signedAtIso: string | null
  ip?: string
  channel?: string
}

export interface SignaturePageData {
  title: string // "Página de assinaturas"
  clinicLine: string
  documentLine: string
  verificationLine: string
  hashLine: string
  countersignLine: string
  legalNote: string
  signerBlocks: string[][] // each block = lines for one signer
}

function fmt(iso: string | null, tz: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  const date = d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" })
  const time = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
  return `${date} ${time}`
}

const ROLE_LABELS: Record<string, string> = {
  PACIENTE: "Paciente",
  RESPONSAVEL: "Responsável",
}

/**
 * Builds the textual content of the signature/evidence page appended to the
 * final PDF. Pure and testable — the pdf-lib adapter renders these strings.
 */
export function buildSignaturePageData(args: {
  clinicName: string
  documentTitle: string
  verificationCode: string
  originalSha256: string
  signers: SignerSummary[]
  tz: string
  countersigned: boolean
}): SignaturePageData {
  const signerBlocks = args.signers.map((s) => {
    const block: string[] = []
    block.push(`${s.name}`)
    block.push(`Papel: ${ROLE_LABELS[s.role] ?? s.role}`)
    if (s.cpf) {
      const d = s.cpf.replace(/\D/g, "")
      const masked = d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : s.cpf
      block.push(`CPF: ${masked}`)
    }
    block.push(`Assinado em: ${fmt(s.signedAtIso, args.tz)}`)
    if (s.channel) block.push(`Canal do código: ${s.channel}`)
    if (s.ip) block.push(`IP: ${s.ip}`)
    return block
  })

  return {
    title: "PÁGINA DE ASSINATURAS",
    clinicLine: `Clínica: ${args.clinicName}`,
    documentLine: `Documento: ${args.documentTitle}`,
    verificationLine: `Código de verificação: ${args.verificationCode}`,
    hashLine: `SHA-256 do documento original: ${args.originalSha256}`,
    countersignLine: `Contra-assinatura ICP-Brasil da clínica: ${args.countersigned ? "Sim" : "Não"}`,
    legalNote:
      "Assinatura eletrônica avançada (Lei 14.063/2020 e MP 2.200-2/2001, art. 10, §2º), " +
      "com prova de posse por código enviado ao contato do signatário e trilha de auditoria. " +
      "A integridade pode ser verificada em /verificar com o código acima.",
    signerBlocks,
  }
}
