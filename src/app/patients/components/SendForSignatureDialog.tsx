"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"
import { BottomSheet } from "@/shared/components/ui/bottom-sheet"

export interface SignerDefaults {
  name: string
  cpf?: string
  email?: string
  phone?: string
  role: "PACIENTE" | "RESPONSAVEL"
}

interface Props {
  isOpen: boolean
  onClose: () => void
  documentId: string
  defaultSigners: SignerDefaults[]
  isMinor: boolean
  onSent: () => void
}

interface SignerForm {
  name: string
  cpf: string
  email: string
  phone: string
  role: "PACIENTE" | "RESPONSAVEL"
  channel: "EMAIL" | "WHATSAPP"
}

function toForm(d: SignerDefaults): SignerForm {
  return {
    name: d.name,
    cpf: d.cpf ?? "",
    email: d.email ?? "",
    phone: d.phone ?? "",
    role: d.role,
    channel: d.email ? "EMAIL" : "WHATSAPP",
  }
}

export function SendForSignatureDialog({ isOpen, onClose, documentId, defaultSigners, isMinor, onSent }: Props) {
  const initial = defaultSigners.length > 0 ? defaultSigners.map(toForm) : [toForm({ name: "", role: isMinor ? "RESPONSAVEL" : "PACIENTE" })]
  const [signers, setSigners] = useState<SignerForm[]>(initial)
  const [expiryDays, setExpiryDays] = useState("30")
  const [sending, setSending] = useState(false)

  function update(i: number, patch: Partial<SignerForm>) {
    setSigners((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function addSigner() {
    setSigners((prev) => [...prev, toForm({ name: "", role: "RESPONSAVEL" })])
  }
  function removeSigner(i: number) {
    setSigners((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function send() {
    if (isMinor && signers[0]?.role !== "RESPONSAVEL") {
      toast.error("Para paciente menor, o primeiro signatário deve ser o responsável.")
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/assinaturas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          expiryDays: parseInt(expiryDays, 10) || 30,
          signers: signers.map((s) => ({
            name: s.name,
            cpf: s.cpf || undefined,
            email: s.email || undefined,
            phone: s.phone || undefined,
            role: s.role,
            channel: s.channel,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao enviar para assinatura")
        return
      }
      toast.success(`Documento enviado para assinatura de ${signers[0]?.name || "signatário"}.`)
      onSent()
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Enviar documento para assinatura">
      <div className="space-y-4 pb-2">
        {signers.map((s, i) => (
          <div key={i} className="rounded-md border border-input p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Signatário {i + 1}</span>
              {signers.length > 1 && (
                <button type="button" onClick={() => removeSigner(i)} className="text-red-600 hover:text-red-800" aria-label="Remover signatário">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={s.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Nome completo" className="col-span-2 h-9 rounded-md border border-input bg-background px-3 text-sm" />
              <input value={s.cpf} onChange={(e) => update(i, { cpf: e.target.value })} placeholder="CPF (opcional)" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              <select value={s.role} onChange={(e) => update(i, { role: e.target.value as SignerForm["role"] })} disabled={i === 0 && isMinor} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="PACIENTE">Paciente</option>
                <option value="RESPONSAVEL">Responsável</option>
              </select>
              <input value={s.email} onChange={(e) => update(i, { email: e.target.value })} placeholder="E-mail" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              <input value={s.phone} onChange={(e) => update(i, { phone: e.target.value })} placeholder="WhatsApp" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="flex gap-2">
              {(["EMAIL", "WHATSAPP"] as const).map((c) => (
                <button key={c} type="button" onClick={() => update(i, { channel: c })} className={`flex-1 h-8 rounded-md border text-xs font-medium ${s.channel === c ? "border-blue-600 bg-blue-50 text-blue-700" : "border-input hover:bg-muted"}`}>
                  {c === "EMAIL" ? "E-mail" : "WhatsApp"}
                </button>
              ))}
            </div>
          </div>
        ))}

        <button type="button" onClick={addSigner} className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900">
          <Plus className="h-4 w-4" /> Adicionar signatário
        </button>

        <label className="block text-sm">
          <span className="block text-muted-foreground mb-1">Validade do link (dias)</span>
          <input type="text" inputMode="numeric" value={expiryDays} onChange={(e) => setExpiryDays(e.target.value.replace(/\D/g, ""))} className="w-28 h-9 rounded-md border border-input bg-background px-3 text-sm" />
        </label>

        <div className="flex justify-end border-t pt-4">
          <button type="button" onClick={send} disabled={sending || !signers[0]?.name} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            {sending ? "Enviando..." : "Enviar"}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
