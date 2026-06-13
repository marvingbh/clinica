"use client"

import { useState } from "react"
import { toast } from "sonner"
import { X } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import type { JoinInfo } from "@/lib/telehealth"
import { JitsiRoom } from "@/shared/components/telehealth/JitsiRoom"
import { Button, Spinner } from "@/shared/components/ui/button"

interface TeleconsultaModalProps {
  appointmentId: string
  onClose: () => void
  onUpdateStatus?: (status: string, message: string) => Promise<void>
}

type Phase = "starting" | "inroom" | "ended" | "error"

/**
 * Full-screen professional teleconsulta room. Calls POST .../start on mount
 * (idempotent), mounts JitsiRoom, and after the call offers to mark the
 * consultation FINALIZADO via the existing status transition. State is derived;
 * no useEffect sync (rule #1) — reset is handled by the parent via remount.
 */
export function TeleconsultaModal({ appointmentId, onClose, onUpdateStatus }: TeleconsultaModalProps) {
  const [phase, setPhase] = useState<Phase>("starting")
  const [join, setJoin] = useState<JoinInfo | null>(null)
  const [finalizing, setFinalizing] = useState(false)

  useMountEffect(() => {
    let cancelled = false
    fetch(`/api/appointments/${appointmentId}/teleconsulta/start`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok || !data.join) {
          setPhase("error")
          toast.error(data.error ?? "Não foi possível iniciar a teleconsulta.")
          return
        }
        setJoin(data.join)
        setPhase("inroom")
      })
      .catch(() => {
        if (!cancelled) setPhase("error")
      })
    return () => {
      cancelled = true
    }
  })

  async function markFinalized() {
    if (!onUpdateStatus) {
      onClose()
      return
    }
    setFinalizing(true)
    try {
      await onUpdateStatus("FINALIZADO", "Status alterado para finalizado")
      onClose()
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90">
      <div className="flex items-center justify-between gap-2 bg-slate-900 px-4 py-2 text-slate-100">
        <span className="text-sm font-medium">Teleconsulta</span>
        <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-1 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1">
        {phase === "starting" && (
          <div className="flex h-full items-center justify-center text-slate-200">
            <Spinner className="h-8 w-8" />
          </div>
        )}
        {phase === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-200">
            <p>Não foi possível conectar. Verifique sua internet e tente novamente.</p>
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        )}
        {phase === "inroom" && join && (
          <JitsiRoom
            join={join}
            onLeft={() => setPhase("ended")}
            onFailed={() => setPhase("error")}
          />
        )}
        {phase === "ended" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-slate-100">
            <p className="text-lg">Deseja marcar esta consulta como finalizada?</p>
            <div className="flex gap-3">
              <Button onClick={markFinalized} loading={finalizing}>
                Marcar como finalizada
              </Button>
              <Button variant="secondary" onClick={onClose} disabled={finalizing}>
                Agora não
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
