"use client"

import { useState } from "react"
import { toast } from "sonner"
import { BottomSheet } from "@/shared/components/ui/bottom-sheet"

interface Props {
  isOpen: boolean
  onClose: () => void
  documentId: string
  defaultEmail?: string | null
  defaultPhone?: string | null
  onSent: () => void
}

export function SendDocumentDialog({ isOpen, onClose, documentId, defaultEmail, defaultPhone, onSent }: Props) {
  const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL")
  const [email, setEmail] = useState(defaultEmail ?? "")
  const [phone, setPhone] = useState(defaultPhone ?? "")
  const [sending, setSending] = useState(false)

  async function send() {
    setSending(true)
    try {
      const res = await fetch(`/api/documents/${documentId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel === "EMAIL" ? { channel, email } : { channel, phone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao enviar")
        return
      }
      toast.success(channel === "EMAIL" ? "Documento enviado por e-mail" : "Link de download enviado por WhatsApp")
      onSent()
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Enviar documento">
      <div className="space-y-4 pb-2">
        <div className="flex gap-2">
          {(["EMAIL", "WHATSAPP"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`flex-1 h-9 rounded-md border text-sm font-medium ${
                channel === c ? "border-blue-600 bg-blue-50 text-blue-700" : "border-input hover:bg-muted"
              }`}
            >
              {c === "EMAIL" ? "E-mail" : "WhatsApp"}
            </button>
          ))}
        </div>

        {channel === "EMAIL" ? (
          <label className="block text-sm">
            <span className="block text-muted-foreground mb-1">E-mail do destinatário</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </label>
        ) : (
          <label className="block text-sm">
            <span className="block text-muted-foreground mb-1">WhatsApp do destinatário</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </label>
        )}

        <div className="flex justify-end border-t pt-4">
          <button
            type="button"
            onClick={send}
            disabled={sending || (channel === "EMAIL" ? !email : !phone)}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
