import type { ScaleDefinition } from "./types"

/** pt-BR labels for the administration status chip. */
export const STATUS_LABELS: Record<string, string> = {
  ENVIADA: "Enviada",
  CONCLUIDA: "Concluída",
  EXPIRADA: "Expirada",
}

/** pt-BR labels for the administration source. */
export const SOURCE_LABELS: Record<string, string> = {
  LINK_PACIENTE: "Link do paciente",
  EM_SESSAO: "Em sessão",
}

/** pt-BR labels for a paused schedule reason. */
export const PAUSED_REASON_LABELS: Record<string, string> = {
  SEM_AGENDAMENTOS_FUTUROS: "Pausado — sem agendamentos futuros",
  SEM_CANAL_CONSENTIDO: "Pausado — sem canal de contato consentido",
  PROFISSIONAL_INATIVO: "Pausado — profissional inativo",
}

/** Tailwind chip classes for a severity label of a given definition. */
export function severityChipColor(def: ScaleDefinition, label: string): string {
  const band = def.severityBands.find((b) => b.label === label)
  return band?.color ?? "bg-gray-100 text-gray-700"
}

/** Status chip classes for an administration status. */
export function statusChipColor(status: string): string {
  switch (status) {
    case "CONCLUIDA":
      return "bg-emerald-100 text-emerald-800"
    case "ENVIADA":
      return "bg-blue-100 text-blue-800"
    case "EXPIRADA":
      return "bg-gray-100 text-gray-600"
    default:
      return "bg-gray-100 text-gray-700"
  }
}
