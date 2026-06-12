import { Badge } from "@/shared/components/ui/badge"

export type CalendarIntegrationStatus = "ATIVA" | "ERRO" | "REVOGADA" | null | undefined

const CONFIG: Record<"ATIVA" | "ERRO" | "REVOGADA", { tone: "ok" | "warn" | "err"; label: string }> =
  {
    ATIVA: { tone: "ok", label: "Conectado" },
    ERRO: { tone: "warn", label: "Erro" },
    REVOGADA: { tone: "err", label: "Revogada" },
  }

/**
 * Status badge for a calendar integration. Reused on the profile page and the
 * admin professionals table. Renders a neutral "Não conectado" when status is
 * null/undefined.
 */
export function CalendarSyncStatusBadge({ status }: { status: CalendarIntegrationStatus }) {
  if (!status) {
    return (
      <Badge tone="neutral" dot>
        Não conectado
      </Badge>
    )
  }
  const cfg = CONFIG[status]
  return (
    <Badge tone={cfg.tone} dot>
      {cfg.label}
    </Badge>
  )
}
