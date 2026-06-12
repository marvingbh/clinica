import type { ClinicalNoteType, ClinicalNoteFormat } from "@/lib/prontuario"

export const NOTE_TYPE_LABELS: Record<ClinicalNoteType, string> = {
  EVOLUCAO: "Evolução",
  AVALIACAO: "Avaliação",
  ENCERRAMENTO: "Encerramento",
  OUTRO: "Outro",
}

export const NOTE_TYPE_BADGE: Record<ClinicalNoteType, string> = {
  EVOLUCAO: "bg-blue-100 text-blue-800",
  AVALIACAO: "bg-purple-100 text-purple-800",
  ENCERRAMENTO: "bg-amber-100 text-amber-800",
  OUTRO: "bg-gray-100 text-gray-700",
}

export const NOTE_FORMAT_LABELS: Record<ClinicalNoteFormat, string> = {
  SOAP: "SOAP",
  DAP: "DAP",
  LIVRE: "Livre",
}

/** Plain-language explanation of each note format, shown in the editor's help
 *  tooltip. The Record type guarantees every format stays documented. */
export const NOTE_FORMAT_DESCRIPTIONS: Record<ClinicalNoteFormat, string> = {
  SOAP: "Subjetivo, Objetivo, Avaliação e Plano — registro estruturado em quatro seções (padrão internacional).",
  DAP: "Dados, Avaliação e Plano — versão enxuta do SOAP, em três seções.",
  LIVRE: "Texto livre — evolução em formato narrativo, sem seções predefinidas.",
}

const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  CANCELADO_ACORDADO: "Cancelado (acordado)",
  CANCELADO_FALTA: "Falta",
  CANCELADO_PROFISSIONAL: "Cancelado (profissional)",
  FINALIZADO: "Finalizado",
}

export function appointmentStatusLabel(status: string | null): string {
  if (!status) return ""
  return APPOINTMENT_STATUS_LABELS[status] ?? status
}

/** DD/MM/YYYY HH:mm in pt-BR. */
export function formatSessionDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
