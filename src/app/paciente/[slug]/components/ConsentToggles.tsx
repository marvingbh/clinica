"use client"

import { useState } from "react"
import { toast } from "sonner"
import { usePortal } from "./PortalSessionProvider"

export function ConsentToggles() {
  const { slug, activeProfile, me, refresh } = usePortal()
  const [busy, setBusy] = useState(false)
  const readOnly = me?.access === "read_only"

  if (!activeProfile) return null

  async function update(field: "consentWhatsApp" | "consentEmail", value: boolean) {
    if (!activeProfile) return
    setBusy(true)
    try {
      const res = await fetch(`/api/public/portal/${slug}/profile/consents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: activeProfile.id, [field]: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Não foi possível atualizar.")
        return
      }
      toast.success("Preferência atualizada.")
      await refresh()
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Toggle
        label="Aceito receber mensagens por WhatsApp"
        checked={activeProfile.consentWhatsApp}
        disabled={busy || readOnly}
        onChange={(v) => update("consentWhatsApp", v)}
      />
      <Toggle
        label="Aceito receber e-mails"
        checked={activeProfile.consentEmail}
        disabled={busy || readOnly}
        onChange={(v) => update("consentEmail", v)}
      />
    </div>
  )
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-foreground">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-brand-600"
      />
    </label>
  )
}
