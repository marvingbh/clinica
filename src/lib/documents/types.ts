/**
 * Domain types for the CFP document generator.
 *
 * IMPORTANT: there is deliberately NO clinical/diagnosis placeholder anywhere
 * in the placeholder registry, so a "Declaração de comparecimento" is
 * structurally incapable of carrying diagnostic content (Res. CFP 06/2019).
 */

export type DocumentType =
  | "DECLARACAO_COMPARECIMENTO"
  | "ATESTADO_PSICOLOGICO"
  | "RELATORIO_PSICOLOGICO"
  | "LAUDO_PSICOLOGICO"
  | "PARECER_PSICOLOGICO"
  | "ENCAMINHAMENTO"
  | "CONTRATO_TERAPEUTICO"
  | "RECIBO_REEMBOLSO"
  | "TCLE"
  | "CONSENTIMENTO_MENOR"
  | "CONSENTIMENTO_IMAGEM"
  | "CONSENTIMENTO_GRAVACAO"
  | "TERMO_LGPD"

export const DOCUMENT_TYPES: DocumentType[] = [
  "DECLARACAO_COMPARECIMENTO",
  "ATESTADO_PSICOLOGICO",
  "RELATORIO_PSICOLOGICO",
  "LAUDO_PSICOLOGICO",
  "PARECER_PSICOLOGICO",
  "ENCAMINHAMENTO",
  "CONTRATO_TERAPEUTICO",
  "RECIBO_REEMBOLSO",
  "TCLE",
  "CONSENTIMENTO_MENOR",
  "CONSENTIMENTO_IMAGEM",
  "CONSENTIMENTO_GRAVACAO",
  "TERMO_LGPD",
]

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  DECLARACAO_COMPARECIMENTO: "Declaração de comparecimento",
  ATESTADO_PSICOLOGICO: "Atestado psicológico",
  RELATORIO_PSICOLOGICO: "Relatório psicológico",
  LAUDO_PSICOLOGICO: "Laudo psicológico",
  PARECER_PSICOLOGICO: "Parecer psicológico",
  ENCAMINHAMENTO: "Encaminhamento",
  CONTRATO_TERAPEUTICO: "Contrato terapêutico",
  RECIBO_REEMBOLSO: "Recibo para reembolso",
  TCLE: "Termo de consentimento livre e esclarecido (TCLE)",
  CONSENTIMENTO_MENOR: "Consentimento para atendimento de menor",
  CONSENTIMENTO_IMAGEM: "Consentimento de uso de imagem",
  CONSENTIMENTO_GRAVACAO: "Consentimento de gravação de sessão",
  TERMO_LGPD: "Termo de proteção de dados (LGPD)",
}

/** Internal token a body uses to request the session table render. */
export const SESSION_TABLE_TOKEN = "__SESSION_TABLE__"

export interface SessionRow {
  date: string // DD/MM/YYYY
  durationMinutes: number
  unitPrice: string // "R$ 200,00"
  invoiceItemId: string
}

export interface MergeContextPatient {
  name: string
  cpf: string | null
  birthDate: Date | null
  billingResponsibleName: string | null
  motherName: string | null
  fatherName: string | null
  email: string | null
  phone: string | null
}

export interface MergeContextProfessional {
  name: string
  crp: string | null
  cpf: string | null
}

export interface MergeContextClinic {
  name: string
  cnpj: string | null
  timezone: string
  address: string | null
  phone: string | null
  email: string | null
}

export interface MergeContextAppointment {
  scheduledAt: Date
  endAt: Date
}

export interface MergeContext {
  patient: MergeContextPatient
  professional: MergeContextProfessional | null
  clinic: MergeContextClinic
  appointment: MergeContextAppointment | null
  sessionRows: SessionRow[]
  /** {{finalidade}}, {{analise}}, {{tussCode}}... — text typed by the user. */
  manualFields: Record<string, string>
  generatedAt: Date
}

export interface MissingField {
  key: string // placeholder key
  label: string // "CPF do paciente"
  quickFixPath: string | null // "/patients?id=...&edit=1"
}

export type PlaceholderKind = "auto" | "manual"

export interface PlaceholderDef {
  key: string
  label: string
  kind: PlaceholderKind
  /** Document types where this placeholder is REQUIRED when present in the body */
  requiredFor: DocumentType[]
  /** Optional missing-field metadata for the blocking checklist. */
  missingLabel?: string
  quickFixPath?: string | null
  /** null = unresolved. Resolves an auto value or a manual field. */
  resolve: (ctx: MergeContext) => string | null
}
