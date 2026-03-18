"use client"

import React, { useState } from "react"
import { toast } from "sonner"

interface NfseEmailDialogProps {
  invoiceId: string
  emissionId?: string
  patientEmail: string | null
  patientName: string
  nfseNumero: string
  onClose: () => void
  onSuccess: () => void
}

export default function NfseEmailDialog({
  invoiceId,
  emissionId,
  patientEmail,
  patientName,
  nfseNumero,
  onClose,
  onSuccess,
}: NfseEmailDialogProps) {
  const [email, setEmail] = useState(patientEmail || "")
  const [sending, setSending] = useState(false)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setSending(true)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoiceId}/nfse/enviar-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), ...(emissionId ? { emissionId } : {}) }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`NFS-e #${nfseNumero} enviada por e-mail`)
        onSuccess()
        onClose()
      } else {
        toast.error(data.error || "Erro ao enviar e-mail")
      }
    } catch {
      toast.error("Erro ao enviar e-mail")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-1">Enviar NFS-e por E-mail</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Enviar NFS-e #{nfseNumero} em PDF para {patientName}
        </p>
        <form onSubmit={handleSend}>
          <label className="block text-sm font-medium mb-1">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="paciente@exemplo.com"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {!patientEmail && email.trim() && (
            <p className="text-xs text-muted-foreground mt-1">
              Este e-mail será salvo no cadastro do paciente.
            </p>
          )}
          {patientEmail && email.trim() && email.trim() !== patientEmail && (
            <p className="text-xs text-muted-foreground mt-1">
              O cadastro do paciente será atualizado com este e-mail.
            </p>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
