"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, CreditCard } from "lucide-react"

interface BulkChargeBarProps {
  selectedInvoiceIds: string[]
  onClear: () => void
  onDone?: () => void
}

/** Floating action bar to charge several selected invoices at once. */
export default function BulkChargeBar({ selectedInvoiceIds, onClear, onDone }: BulkChargeBarProps) {
  const [submitting, setSubmitting] = useState(false)
  const count = selectedInvoiceIds.length
  if (count === 0) return null

  async function chargeSelected() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/financeiro/faturas/cobranca-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: selectedInvoiceIds, channels: ["WHATSAPP"] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Cobranças geradas para ${data.created} fatura${data.created === 1 ? "" : "s"}`)
      if (data.skipped?.length) {
        toast.warning(`${data.skipped.length} fatura(s) ignorada(s) (sem saldo ou Stripe inativo)`)
      }
      onClear()
      onDone?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar cobranças")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex items-center gap-4 rounded-full bg-foreground px-5 py-3 text-background shadow-lg">
        <span className="text-sm font-medium">{count} selecionada{count === 1 ? "" : "s"}</span>
        <button
          onClick={chargeSelected}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard size={15} />}
          Cobrar selecionadas
        </button>
        <button onClick={onClear} className="text-sm text-background/70 hover:text-background">
          Limpar
        </button>
      </div>
    </div>
  )
}
