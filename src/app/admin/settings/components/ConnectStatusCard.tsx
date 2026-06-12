"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CreditCard, ExternalLink, Loader2 } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"

type ConnectStatus = "DISCONNECTED" | "ONBOARDING" | "ACTIVE" | "RESTRICTED" | "loading"

const STATUS_META: Record<Exclude<ConnectStatus, "loading">, { label: string; cls: string }> = {
  DISCONNECTED: { label: "Desconectado", cls: "bg-slate-100 text-slate-600" },
  ONBOARDING: { label: "Onboarding pendente", cls: "bg-amber-100 text-amber-700" },
  ACTIVE: { label: "Ativo", cls: "bg-emerald-100 text-emerald-700" },
  RESTRICTED: { label: "Restrito", cls: "bg-red-100 text-red-700" },
}

/** Connect onboarding status card with connect / complete / disconnect CTAs. */
export default function ConnectStatusCard({ onStatusChange }: { onStatusChange?: (s: string) => void }) {
  const [status, setStatus] = useState<ConnectStatus>("loading")
  const [busy, setBusy] = useState(false)

  async function loadStatus() {
    try {
      const res = await fetch("/api/clinic/payments/status")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setStatus(data.status)
      onStatusChange?.(data.status)
    } catch {
      setStatus("DISCONNECTED")
    }
  }

  useMountEffect(() => {
    loadStatus()
  })

  async function connect() {
    setBusy(true)
    try {
      const res = await fetch("/api/clinic/payments/connect", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao conectar com o Stripe")
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      const res = await fetch("/api/clinic/payments/disconnect", { method: "POST" })
      if (!res.ok) throw new Error()
      setStatus("DISCONNECTED")
      onStatusChange?.("DISCONNECTED")
      toast.success("Conta desconectada")
    } catch {
      toast.error("Erro ao desconectar")
    } finally {
      setBusy(false)
    }
  }

  const meta = status === "loading" ? null : STATUS_META[status]

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CreditCard size={20} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Receba por Pix e cartão</h3>
            {meta && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Conecte sua conta Stripe para gerar links de pagamento e cobrar suas faturas com Pix ou cartão.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

            {(status === "DISCONNECTED") && (
              <button onClick={connect} disabled={busy} className="btn-connect">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink size={15} />}
                Conectar com Stripe
              </button>
            )}

            {(status === "ONBOARDING" || status === "RESTRICTED") && (
              <>
                <button onClick={connect} disabled={busy} className="btn-connect">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink size={15} />}
                  Completar cadastro
                </button>
                <button onClick={disconnect} disabled={busy} className="btn-secondary">
                  Desconectar
                </button>
              </>
            )}

            {status === "ACTIVE" && (
              <button onClick={disconnect} disabled={busy} className="btn-secondary">
                Desconectar
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .btn-connect {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 0.5rem;
          background: var(--color-primary, #2563eb);
          color: #fff;
          padding: 0.55rem 1rem;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .btn-connect:disabled { opacity: 0.6; }
        .btn-secondary {
          display: inline-flex;
          align-items: center;
          border-radius: 0.5rem;
          background: transparent;
          border: 1px solid var(--color-border, #e2e8f0);
          color: var(--color-foreground, #0f172a);
          padding: 0.55rem 1rem;
          font-size: 0.8rem;
          font-weight: 500;
        }
      `}</style>
    </div>
  )
}
