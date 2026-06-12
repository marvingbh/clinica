"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import { Button } from "@/shared/components/ui/button"

interface PortalRequestRow {
  id: string
  type: string
  status: string
  summary: string
  patientName: string
  appointmentAt: string | null
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  RESCHEDULE: "Reagendamento",
  UPDATE_DATA: "Atualização de dados",
  LGPD_EXPORT: "Dados (LGPD)",
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  RESOLVED: "Resolvida",
  REJECTED: "Rejeitada",
}

export function PortalRequestsTable({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<PortalRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/portal-requests?status=PENDING", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setRows(data.requests ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useMountEffect(() => {
    void load()
  })

  async function act(id: string, action: "apply" | "resolve" | "reject") {
    setBusyId(id)
    try {
      const res = await fetch(`/api/portal-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Não foi possível concluir a ação.")
        return
      }
      toast.success("Solicitação atualizada.")
      await load()
    } catch {
      toast.error("Erro de conexão.")
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Nenhuma solicitação pendente.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{r.patientName}</span>
            <span className="text-xs text-muted-foreground">
              {TYPE_LABELS[r.type] ?? r.type} · {STATUS_LABELS[r.status] ?? r.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{r.summary}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(r.createdAt).toLocaleDateString("pt-BR")}
          </p>
          {canWrite && (
            <div className="flex flex-wrap gap-2 pt-1">
              {r.type === "UPDATE_DATA" && (
                <Button size="sm" disabled={busyId === r.id} onClick={() => act(r.id, "apply")}>
                  Aplicar
                </Button>
              )}
              <Button
                size="sm"
                variant="outlined"
                disabled={busyId === r.id}
                onClick={() => act(r.id, "resolve")}
              >
                Resolver
              </Button>
              <Button
                size="sm"
                variant="text"
                disabled={busyId === r.id}
                onClick={() => act(r.id, "reject")}
              >
                Rejeitar
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
