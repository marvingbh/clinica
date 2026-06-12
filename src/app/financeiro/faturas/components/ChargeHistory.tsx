"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Copy, Loader2 } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import { formatCurrencyBRL, formatDateBR } from "@/lib/financeiro/format"
import ChargeBadge from "./ChargeBadge"

interface Charge {
  id: string
  status: "ABERTA" | "PAGA" | "EXPIRADA" | "CANCELADA" | "REEMBOLSADA"
  amount: string
  paymentMethod: string | null
  stripeFeeAmount: string | null
  viewedAt: string | null
  paidAt: string | null
  createdAt: string
  failureReason: string | null
  createdViaDunning: boolean
  paymentLink: string | null
}

/** Timeline of charges for an invoice (detail view) with copy/cancel/refund actions. */
export default function ChargeHistory({ invoiceId }: { invoiceId: string }) {
  const [charges, setCharges] = useState<Charge[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoiceId}/cobranca`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setCharges(data.charges)
    } catch {
      setCharges([])
    }
  }

  useMountEffect(() => {
    load()
  })

  function copyLink(link: string | null) {
    if (!link) return
    navigator.clipboard.writeText(link)
    toast.success("Link copiado")
  }

  async function cancel(chargeId: string) {
    setBusyId(chargeId)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoiceId}/cobranca/${chargeId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Cobrança cancelada")
      await load()
    } catch {
      toast.error("Erro ao cancelar cobrança")
    } finally {
      setBusyId(null)
    }
  }

  async function refund(chargeId: string) {
    setBusyId(chargeId)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoiceId}/cobranca/${chargeId}/reembolso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error()
      toast.success("Reembolso solicitado")
      await load()
    } catch {
      toast.error("Erro ao solicitar reembolso")
    } finally {
      setBusyId(null)
    }
  }

  if (charges === null) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  if (charges.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma cobrança gerada para esta fatura.</p>
  }

  return (
    <ul className="space-y-3">
      {charges.map((c) => (
        <li key={c.id} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <ChargeBadge charge={{ status: c.status, viewedAt: c.viewedAt, paymentMethod: c.paymentMethod }} />
            <span className="text-sm font-medium text-foreground">{formatCurrencyBRL(Number(c.amount))}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Criada em {formatDateBR(c.createdAt)}
            {c.createdViaDunning && " · via régua"}
            {c.paidAt && ` · paga em ${formatDateBR(c.paidAt)}`}
            {c.stripeFeeAmount && ` · taxa ${formatCurrencyBRL(Number(c.stripeFeeAmount))}`}
          </div>
          {c.failureReason && <div className="mt-1 text-xs text-amber-600">{c.failureReason}</div>}
          <div className="mt-2 flex flex-wrap gap-2">
            {c.status === "ABERTA" && (
              <>
                <button onClick={() => copyLink(c.paymentLink)} className="inline-flex items-center gap-1 text-xs text-primary">
                  <Copy size={12} /> Copiar link
                </button>
                <button onClick={() => cancel(c.id)} disabled={busyId === c.id} className="text-xs text-muted-foreground hover:text-foreground">
                  Cancelar cobrança
                </button>
              </>
            )}
            {c.status === "PAGA" && (
              <button onClick={() => refund(c.id)} disabled={busyId === c.id} className="text-xs text-red-600 hover:text-red-700">
                Reembolsar
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
