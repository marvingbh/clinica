"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RefreshCw, Unplug } from "lucide-react"
import { CalendarSyncStatusBadge } from "@/shared/components/CalendarSyncStatusBadge"
import type { GoogleState } from "./types"

const FONTE_DA_VERDADE =
  "A Clinica é a fonte oficial dos seus atendimentos. Alterações feitas diretamente no Google sobre eventos da clínica serão sobrescritas."

export function GoogleCalendarCard({
  google,
  onChange,
}: {
  google: GoogleState | null
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [cleanup, setCleanup] = useState(false)

  async function connect() {
    setBusy(true)
    try {
      const res = await fetch("/api/calendar-sync/google/connect", { method: "POST" })
      const data = await res.json()
      if (!res.ok) return toast.error(data.error || "Não foi possível conectar")
      window.location.href = data.authUrl
    } finally {
      setBusy(false)
    }
  }

  async function patch(changes: Partial<GoogleState>) {
    setBusy(true)
    try {
      const res = await fetch("/api/calendar-sync", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "GOOGLE", ...changes }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.needsReconsent && data?.authUrl) {
        window.location.href = data.authUrl
        return
      }
      if (!res.ok) return toast.error(data?.error || "Falha ao salvar")
      toast.success("Preferências salvas")
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function retry() {
    setBusy(true)
    try {
      const res = await fetch("/api/calendar-sync/google/retry", { method: "POST" })
      if (!res.ok) return toast.error("Falha ao tentar novamente")
      toast.success("Reenviando suas próximas sessões…")
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      const res = await fetch(`/api/calendar-sync/google?cleanup=${cleanup}`, { method: "DELETE" })
      if (!res.ok) return toast.error("Falha ao desconectar")
      toast.success("Google Agenda desconectado.")
      setConfirmDisconnect(false)
      onChange()
    } finally {
      setBusy(false)
    }
  }

  if (!google) {
    return (
      <div className="rounded-md border border-border p-4">
        <p className="text-sm text-foreground mb-1 font-medium">Google Agenda</p>
        <p className="text-sm text-muted-foreground mb-3">{FONTE_DA_VERDADE}</p>
        <button
          type="button"
          onClick={connect}
          disabled={busy}
          className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          Conectar Google Agenda
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Google Agenda</p>
          {google.googleAccountEmail && (
            <p className="text-xs text-muted-foreground">{google.googleAccountEmail}</p>
          )}
        </div>
        <CalendarSyncStatusBadge status={google.status} />
      </div>

      {google.status === "REVOGADA" && (
        <p className="text-sm text-err-700">
          O acesso ao Google foi revogado. Reconecte para retomar a sincronização.
          <button onClick={connect} disabled={busy} className="ml-2 underline">
            Reconectar
          </button>
        </p>
      )}
      {google.status === "ERRO" && (
        <p className="text-sm text-warn-700">
          {google.lastErrorMessage || "A sincronização encontrou um erro."}
          <button onClick={retry} disabled={busy} className="ml-2 underline inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Tentar novamente
          </button>
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground mb-1">Privacidade</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="privacy"
            checked={google.privacyMode === "TOTAL"}
            onChange={() => patch({ privacyMode: "TOTAL" })}
            disabled={busy}
          />
          <span>Total (recomendado) — eventos aparecem como “Atendimento — {"{clínica}"}”, sem nome de paciente</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="privacy"
            checked={google.privacyMode === "PRIMEIRO_NOME"}
            onChange={() => patch({ privacyMode: "PRIMEIRO_NOME" })}
            disabled={busy}
          />
          <span>Primeiro nome — eventos mostram apenas o primeiro nome do paciente</span>
        </label>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={google.syncNonBlocking}
          onChange={(e) => patch({ syncNonBlocking: e.target.checked })}
          disabled={busy}
        />
        Sincronizar lembretes e notas (não bloqueiam horário no Google)
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={google.inboundEnabled}
          onChange={(e) => patch({ inboundEnabled: e.target.checked })}
          disabled={busy}
        />
        Bloquear horários ocupados da minha agenda pessoal
      </label>

      <div>
        {!confirmDisconnect ? (
          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="inline-flex items-center gap-1 text-sm text-err-700 hover:underline"
          >
            <Unplug className="w-4 h-4" /> Desconectar
          </button>
        ) : (
          <div className="rounded-md border border-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cleanup} onChange={(e) => setCleanup(e.target.checked)} />
              Remover também os eventos já criados no Google
            </label>
            <div className="flex gap-2">
              <button onClick={disconnect} disabled={busy} className="h-9 px-3 rounded-md bg-err-600 text-white text-sm">
                Confirmar
              </button>
              <button onClick={() => setConfirmDisconnect(false)} className="h-9 px-3 rounded-md border border-input text-sm">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
