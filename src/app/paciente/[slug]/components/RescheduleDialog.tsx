"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/shared/components/ui/button"
import { usePortal } from "./PortalSessionProvider"

interface RescheduleDialogProps {
  appointmentId: string
  onClose: () => void
  onSubmitted: () => void
}

export function RescheduleDialog({ appointmentId, onClose, onSubmitted }: RescheduleDialogProps) {
  const { slug } = usePortal()
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/public/portal/${slug}/appointments/${appointmentId}/reschedule-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: message.trim() || undefined }),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Não foi possível enviar a solicitação.")
        return
      }
      toast.success("Solicitação enviada! A clínica entrará em contato.")
      onSubmitted()
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-5 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Solicitar reagendamento</h2>
        <p className="text-sm text-muted-foreground">
          Conte para a clínica sua preferência de dia e horário. Vamos entrar em contato.
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
          rows={4}
          className="w-full px-3 py-2 border border-border rounded bg-card text-foreground text-sm"
          placeholder="Ex.: prefiro pela manhã, terças ou quintas."
        />
        <div className="flex justify-end gap-2">
          <Button variant="text" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Enviando..." : "Enviar solicitação"}
          </Button>
        </div>
      </div>
    </div>
  )
}
