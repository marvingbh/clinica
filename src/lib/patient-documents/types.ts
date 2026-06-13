/**
 * Types and pt-BR labels for patient documents (anexos do paciente).
 * Prisma enums are plain strings at runtime, so we mirror them as string
 * unions to keep the domain functions framework-free and testable.
 */

export type PatientDocumentSourceString =
  | "UPLOAD"
  | "GERADO"
  | "ASSINADO"
  | "FORMULARIO"

export type PatientDocumentCategoryString =
  | "EXAME"
  | "ENCAMINHAMENTO"
  | "DOCUMENTO"
  | "CONTRATO"
  | "OUTRO"

export const CATEGORY_LABELS: Record<PatientDocumentCategoryString, string> = {
  EXAME: "Exame",
  ENCAMINHAMENTO: "Encaminhamento",
  DOCUMENTO: "Documento",
  CONTRATO: "Contrato",
  OUTRO: "Outro",
}

export const CATEGORY_VALUES: PatientDocumentCategoryString[] = [
  "EXAME",
  "ENCAMINHAMENTO",
  "DOCUMENTO",
  "CONTRATO",
  "OUTRO",
]

/** Origin badges — only shown for non-UPLOAD documents. */
export const SOURCE_LABELS: Record<PatientDocumentSourceString, string> = {
  UPLOAD: "Enviado",
  GERADO: "Gerado",
  ASSINADO: "Assinado",
  FORMULARIO: "Formulário",
}

export interface PatientDocumentDTO {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  category: PatientDocumentCategoryString
  source: PatientDocumentSourceString
  description: string | null
  sharedWithPatient: boolean
  deletedAt: string | null
  createdAt: string
  uploader: { name: string } | null
}
