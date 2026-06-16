"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { XIcon } from "@/shared/components/ui/icons"
import { Copy, Loader2 } from "lucide-react"
import { formatCurrencyBRL } from "@/lib/financeiro/format"

interface CobrarModalProps {
  invoiceId: string
  openBalance: number
  onClose: () => void
  onCreated?: () => void
}

/** Modal to create a payment charge for an invoice (valor + canais de envio). */
export default function CobrarModal({ invoiceId, openBalance, onClose, onCreated }: CobrarModalProps) {
  const [amount, setAmount] = useState(openBalance.toFixed(2).replace(".", ","))
  const [whatsapp, setWhatsapp] = useState(true)
  const [email, setEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [paymentLink, setPaymentLink] = useState<string | null>(null)

  async function submit() {
    const value = Number(amount.replace(/\./g, "").replace(",", "."))
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor válido")
      return
    }
    if (value > openBalance + 0.001) {
      toast.error("Valor não pode exceder o saldo em aberto")
      return
    }
    const channels: string[] = []
    if (whatsapp) channels.push("WHATSAPP")
    if (email) channels.push("EMAIL")

    setSubmitting(true)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoiceId}/cobranca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, channels }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erro ao criar cobrança")
      setPaymentLink(data.paymentLink)
      toast.success("Link de cobrança criado")
      onCreated?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar cobrança")
    } finally {
      setSubmitting(false)
    }
  }

  function copyLink() {
    if (!paymentLink) return
    navigator.clipboard.writeText(paymentLink)
    toast.success("Link copiado")
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Cobrar fatura</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XIcon size={18} />
          </button>
        </div>

        {paymentLink ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">Link de pagamento gerado:</p>
            <div className="flex items-center gap-2 rounded-md border border-input bg-background p-2">
              <input readOnly value={paymentLink} className="flex-1 bg-transparent text-xs text-muted-foreground outline-none" />
              <button onClick={copyLink} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                <Copy size={13} /> Copiar
              </button>
            </div>
            <button onClick={onClose} className="w-full rounded-lg border border-border py-2.5 text-sm font-medium text-foreground">
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Valor (saldo em aberto: {formatCurrencyBRL(openBalance)})
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Enviar link por</span>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} className="h-4 w-4 rounded border-input text-primary" />
                WhatsApp
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="h-4 w-4 rounded border-input text-primary" />
                E-mail
              </label>
              <p className="text-xs text-muted-foreground">Desmarque ambos para apenas copiar o link.</p>
            </div>

            <button
              onClick={submit}
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Gerar link de cobrança
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
