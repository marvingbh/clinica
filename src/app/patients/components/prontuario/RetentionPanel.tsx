"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useMountEffect, usePermission } from "@/shared/hooks"

interface RetentionPanelProps {
  patientId: string
  recordClosedAt: string | null
  onChanged: () => void
}

interface LifecycleState {
  recordClosedAt: string | null
  retentionYears: number
  banner: string | null
  canDispose: boolean
}

export function RetentionPanel({ patientId, recordClosedAt, onChanged }: RetentionPanelProps) {
  const { canWrite } = usePermission("patients")
  const isAdmin = useIsAdmin()
  const [state, setState] = useState<LifecycleState | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const res = await fetch(`/api/prontuario/record/${patientId}`)
      if (res.ok) setState(await res.json())
    } catch {
      /* silent — panel is non-critical */
    }
  }

  useMountEffect(() => {
    void load()
  })

  async function act(action: "close" | "reopen") {
    if (!canWrite) return
    setBusy(true)
    try {
      const res = await fetch(`/api/prontuario/record/${patientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === "close" ? "Prontuário encerrado." : "Prontuário reaberto.")
      await load()
      onChanged()
    } catch {
      toast.error("Não foi possível atualizar o prontuário.")
    } finally {
      setBusy(false)
    }
  }

  async function dispose() {
    if (
      !window.confirm(
        "O descarte é definitivo: todos os registros clínicos deste paciente serão eliminados e um termo de descarte será gerado. Esta ação não pode ser desfeita."
      )
    )
      return
    setBusy(true)
    try {
      const res = await fetch(`/api/prontuario/record/${patientId}/descarte`, { method: "POST" })
      if (res.status === 422) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "O prazo legal de guarda ainda não foi cumprido.")
        return
      }
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "termo-de-descarte.pdf"
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Descarte realizado e termo gerado.")
      await load()
      onChanged()
    } catch {
      toast.error("Não foi possível realizar o descarte.")
    } finally {
      setBusy(false)
    }
  }

  const closed = state?.recordClosedAt ?? recordClosedAt

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground">
          {closed && state?.banner ? state.banner : "Prontuário ativo."}
        </p>
        {canWrite && (
          <div className="flex gap-2">
            {!closed ? (
              <button
                type="button"
                onClick={() => act("close")}
                disabled={busy}
                className="h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground hover:bg-muted disabled:opacity-60"
              >
                Encerrar prontuário
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => act("reopen")}
                  disabled={busy}
                  className="h-8 rounded-md border border-input bg-background px-3 text-xs text-foreground hover:bg-muted disabled:opacity-60"
                >
                  Reabrir prontuário
                </button>
                {isAdmin && state?.canDispose && (
                  <button
                    type="button"
                    onClick={dispose}
                    disabled={busy}
                    className="h-8 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Realizar descarte formal
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function useIsAdmin(): boolean {
  const { access } = usePermission("users")
  // ADMIN is the only role with default WRITE on the "users" feature; this is a
  // lightweight proxy without threading the role through props.
  return access === "WRITE"
}
