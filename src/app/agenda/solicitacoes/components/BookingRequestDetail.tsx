"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/shared/components/ui"
import { formatPhoneDisplay } from "@/lib/phone"
import { LinkOrCreatePatient } from "./LinkOrCreatePatient"
import type { BookingRequestItem } from "./types"

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

export function BookingRequestDetail({
  request,
  onActed,
}: {
  request: BookingRequestItem
  onActed: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const isExpired = new Date(request.scheduledAt) < new Date()

  async function approve(body: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch(`/api/booking-requests/${request.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "Não foi possível aprovar")
        return
      }
      toast.success("Agendamento confirmado")
      onActed()
    } catch {
      toast.error("Erro de conexão")
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    setBusy(true)
    try {
      const res = await fetch(`/api/booking-requests/${request.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "Não foi possível rejeitar")
        return
      }
      toast.success("Solicitação rejeitada")
      onActed()
    } catch {
      toast.error("Erro de conexão")
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="p-4 rounded-lg border border-border bg-card space-y-2">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{request.name}</p>
          <p className="text-sm text-muted-foreground">{formatPhoneDisplay(request.phone)} · {request.email}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap">
          {request.patient ? `Paciente: ${request.patient.name}` : "Novo contato"}
        </span>
      </div>

      <p className="text-sm text-foreground">
        {request.professionalProfile.user.name} · {fmtDateTime(request.scheduledAt)} ·{" "}
        {request.modality === "ONLINE" ? "Online" : "Presencial"}
      </p>

      {request.status === "PENDING" && (
        <>
          {isExpired && <p className="text-xs text-warn-700">Esta solicitação expirou.</p>}
          {request.rejectionReason && (
            <p className="text-xs text-muted-foreground">Motivo: {request.rejectionReason}</p>
          )}

          {!rejecting && (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                disabled={busy || isExpired}
                onClick={() => (request.patientId ? approve({}) : setShowPanel((v) => !v))}
              >
                Aprovar e agendar
              </Button>
              <Button variant="outlined" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
                Rejeitar
              </Button>
            </div>
          )}

          {!request.patientId && showPanel && !rejecting && (
            <LinkOrCreatePatient
              request={request}
              onLink={(patientId) => approve({ patientId })}
              onCreate={(newPatient) => approve({ newPatient })}
            />
          )}

          {rejecting && (
            <div className="space-y-2 pt-1">
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                rows={2}
                placeholder="Motivo (opcional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="destructive" size="sm" disabled={busy} onClick={reject}>
                  Confirmar rejeição
                </Button>
                <Button variant="text" size="sm" disabled={busy} onClick={() => setRejecting(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </li>
  )
}
