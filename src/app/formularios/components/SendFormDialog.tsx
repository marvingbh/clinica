"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"

interface SendableTemplate {
  id: string
  name: string
}

interface SendFormDialogProps {
  patientId: string
  patientName: string
  onClose: () => void
  onSent: () => void
}

const CHANNELS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "E-mail" },
  { value: "LINK", label: "Copiar link" },
] as const

const VALIDITIES = [7, 14, 30]

/** Dialog to send a published form to a patient (template + channel + validity). */
export function SendFormDialog({ patientId, patientName, onClose, onSent }: SendFormDialogProps) {
  const [templates, setTemplates] = useState<SendableTemplate[] | null>(null)
  const [templateId, setTemplateId] = useState("")
  const [sentVia, setSentVia] = useState<(typeof CHANNELS)[number]["value"]>("WHATSAPP")
  const [expiresInDays, setExpiresInDays] = useState(14)
  const [sending, setSending] = useState(false)
  const [linkUrl, setLinkUrl] = useState<string | null>(null)

  useMountEffect(() => {
    void (async () => {
      const res = await fetch("/api/forms/templates")
      if (res.ok) {
        const data = await res.json()
        const sendable = data.templates
          .filter((t: { isActive: boolean; latestVersion: number | null }) => t.isActive && t.latestVersion)
          .map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))
        setTemplates(sendable)
        if (sendable.length > 0) setTemplateId(sendable[0].id)
      } else {
        setTemplates([])
      }
    })()
  })

  async function handleSend() {
    if (!templateId) return
    setSending(true)
    try {
      const res = await fetch("/api/forms/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, patientId, sentVia, expiresInDays }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setLinkUrl(data.formUrl)
        toast.success(sentVia === "LINK" ? "Link gerado" : `Formulário enviado para ${patientName}`)
        onSent()
      } else {
        toast.error(data.error ?? "Não foi possível enviar")
      }
    } finally {
      setSending(false)
    }
  }

  async function copyLink() {
    if (!linkUrl) return
    await navigator.clipboard.writeText(linkUrl)
    toast.success("Link copiado")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-semibold text-ink-900">Enviar formulário</h2>

        {templates === null ? (
          <p className="mt-4 text-[14px] text-ink-500">Carregando...</p>
        ) : templates.length === 0 ? (
          <p className="mt-4 text-[14px] text-ink-600">
            Nenhum modelo publicado disponível. Publique um formulário primeiro.
          </p>
        ) : linkUrl ? (
          <div className="mt-4">
            <p className="text-[14px] text-ink-700">Link do formulário (válido por {expiresInDays} dias):</p>
            <div className="mt-2 flex gap-2">
              <input readOnly value={linkUrl} className="flex-1 rounded-lg border border-ink-200 px-3 py-2 text-[13px]" />
              <button onClick={copyLink} className="rounded-lg bg-ink-900 text-white px-3 py-2 text-[13px]">
                Copiar
              </button>
            </div>
            <button onClick={onClose} className="mt-4 w-full rounded-lg border border-ink-200 py-2 text-[13px]">
              Fechar
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label className="block text-[13px] font-medium text-ink-700">Modelo</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px]"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-700">Canal</label>
              <div className="mt-1 flex gap-2">
                {CHANNELS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setSentVia(c.value)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-[13px] ${
                      sentVia === c.value ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-700"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-ink-700">Validade</label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-[14px]"
              >
                {VALIDITIES.map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-ink-200 px-3 py-2 text-[13px]">
                Cancelar
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !templateId}
                className="rounded-lg bg-ink-900 text-white px-3 py-2 text-[13px] font-medium disabled:opacity-50"
              >
                {sending ? "Enviando..." : sentVia === "LINK" ? "Gerar link" : "Enviar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
