"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Link2, Copy, Check } from "lucide-react"
import type { IcsState } from "./types"

export function IcsFeedCard({ ics, onChange }: { ics: IcsState | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function generate() {
    setBusy(true)
    try {
      const res = await fetch("/api/calendar-sync/ics", { method: "POST" })
      const data = await res.json()
      if (!res.ok) return toast.error(data.error || "Falha ao gerar link")
      toast.success("Link iCal gerado")
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const res = await fetch("/api/calendar-sync/ics", { method: "DELETE" })
      if (!res.ok) return toast.error("Falha ao desativar")
      toast.success("Link iCal desativado")
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!ics) return
    await navigator.clipboard.writeText(ics.icsUrl)
    setCopied(true)
    toast.success("Link copiado")
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">Link iCal (Apple, Outlook e outros)</p>
      </div>

      {!ics ? (
        <>
          <p className="text-sm text-muted-foreground">
            Assine sua agenda da clínica sem conta Google. No iPhone: Ajustes → Calendário → Contas →
            Adicionar conta → Outra → Assinar calendário.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            Gerar link iCal
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={ics.icsUrl}
              className="flex-1 h-9 px-2 rounded-md border border-input bg-muted text-xs text-foreground"
            />
            <button
              type="button"
              onClick={copy}
              className="h-9 px-3 rounded-md border border-input text-sm inline-flex items-center gap-1"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Calendários assinados atualizam no ritmo do seu aplicativo (geralmente a cada algumas
            horas). Para tempo real, use a conexão Google.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="h-9 px-3 rounded-md border border-input text-sm"
            >
              Gerar novo link
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="h-9 px-3 rounded-md border border-input text-sm text-err-700"
            >
              Desativar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
