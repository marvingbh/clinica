"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Landmark, Loader2 } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import { formatCurrencyBRL } from "@/lib/financeiro/format"

interface PayoutResult {
  isPayout: boolean
  matched: boolean
  chargeIds: string[]
  difference: number
}

interface StripePayoutBannerProps {
  transactionId: string
  onDismissed?: () => void
}

/**
 * Shows up on a CREDIT bank line recognized as a Stripe payout, suggesting it
 * be marked as a repasse (avoids double-counting revenue already reconciled).
 */
export default function StripePayoutBanner({ transactionId, onDismissed }: StripePayoutBannerProps) {
  const [result, setResult] = useState<PayoutResult | null>(null)
  const [busy, setBusy] = useState(false)

  useMountEffect(() => {
    fetch(`/api/financeiro/conciliacao/stripe-payout?transactionId=${encodeURIComponent(transactionId)}`)
      .then((r) => r.json())
      .then((data) => setResult(data))
      .catch(() => setResult(null))
  })

  async function markAsPayout() {
    setBusy(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/stripe-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      })
      if (!res.ok) throw new Error()
      toast.success("Repasse Stripe marcado")
      onDismissed?.()
    } catch {
      toast.error("Erro ao marcar repasse")
    } finally {
      setBusy(false)
    }
  }

  if (!result || !result.isPayout) return null

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <div className="flex items-start gap-2">
        <Landmark size={16} className="mt-0.5 text-indigo-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-indigo-900">Repasse Stripe identificado</p>
          <p className="mt-0.5 text-xs text-indigo-700">
            {result.matched
              ? `${result.chargeIds.length} pagamento(s) já conciliado(s) via Stripe correspondem a este repasse.`
              : `Possível repasse. Diferença de ${formatCurrencyBRL(Math.abs(result.difference))} em relação aos pagamentos conhecidos — confira antes de marcar.`}
          </p>
          <button
            onClick={markAsPayout}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            Marcar como repasse
          </button>
        </div>
      </div>
    </div>
  )
}
