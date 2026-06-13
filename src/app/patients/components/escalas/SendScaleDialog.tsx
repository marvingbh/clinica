"use client"

import { useState } from "react"
import { toast } from "sonner"
import { X, Copy, Loader2 } from "lucide-react"
import type { ScaleOption } from "./types"

interface Props {
  patientId: string
  scales: ScaleOption[]
  isMinor: boolean
  hasWhatsAppConsent: boolean
  hasEmailConsent: boolean
  onClose: () => void
  onSent: () => void
}

/** Send a scale link to the patient on a consented channel. */
export function SendScaleDialog({
  patientId,
  scales,
  isMinor,
  hasWhatsAppConsent,
  hasEmailConsent,
  onClose,
  onSent,
}: Props) {
  const [scaleCode, setScaleCode] = useState(scales[0]?.code ?? "")
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL">(
    hasEmailConsent ? "EMAIL" : "WHATSAPP"
  )
  const [submitting, setSubmitting] = useState(false)
  const [link, setLink] = useState<string | null>(null)

  const noChannel = !hasWhatsAppConsent && !hasEmailConsent

  async function handleSend() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/escalas/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scaleCode, channel }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Não foi possível enviar a escala.")
        return
      }
      setLink(data.link)
      toast.success("Escala enviada.")
      onSent()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Enviar escala" onClose={onClose}>
      {noChannel ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Paciente sem canal de contato consentido — aplique a escala em sessão.
        </p>
      ) : link ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Link gerado. Use &quot;Copiar link&quot; para enviar manualmente se necessário.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              className="flex-1 truncate rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(link).catch(() => {})
                toast.success("Link copiado.")
              }}
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1.5 text-xs hover:bg-gray-200"
            >
              <Copy className="h-3 w-3" /> Copiar link
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Fechar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {isMinor && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              Instrumento validado para adultos.
            </p>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Escala</span>
            <select
              value={scaleCode}
              onChange={(e) => setScaleCode(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
            >
              {scales.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Canal</span>
            <div className="flex gap-2">
              <ChannelButton
                label="E-mail"
                active={channel === "EMAIL"}
                disabled={!hasEmailConsent}
                onClick={() => setChannel("EMAIL")}
              />
              <ChannelButton
                label="WhatsApp"
                active={channel === "WHATSAPP"}
                disabled={!hasWhatsAppConsent}
                onClick={() => setChannel("WHATSAPP")}
              />
            </div>
          </div>

          <button
            onClick={handleSend}
            disabled={submitting || !scaleCode}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar
          </button>
        </div>
      )}
    </Modal>
  )
}

function ChannelButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 rounded-md border px-3 py-2 text-sm transition ${
        active
          ? "border-blue-600 bg-blue-50 font-medium text-blue-700"
          : "border-gray-200 text-gray-600"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
      {disabled && <span className="ml-1 text-xs">(sem consentimento)</span>}
    </button>
  )
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
