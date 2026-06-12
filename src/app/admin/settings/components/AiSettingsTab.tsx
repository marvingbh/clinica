"use client"

import { useState } from "react"
import { toast } from "sonner"
import type { TabProps } from "../types"
import { patchSettings } from "../types"
import { AiDisclosureDialog } from "./AiDisclosureDialog"

function formatAcceptedAt(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function AiSettingsTab({ settings, onUpdate }: TabProps) {
  const [showDisclosure, setShowDisclosure] = useState(false)
  const [busy, setBusy] = useState(false)

  async function apply(body: { aiEnabled?: boolean; aiHistoryContext?: boolean }) {
    setBusy(true)
    try {
      const updated = await patchSettings(body)
      onUpdate(updated)
      toast.success("Configurações de IA salvas")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setBusy(false)
    }
  }

  function handleMainToggle() {
    if (settings.aiEnabled) {
      void apply({ aiEnabled: false })
    } else {
      setShowDisclosure(true)
    }
  }

  async function confirmEnable() {
    await apply({ aiEnabled: true })
    setShowDisclosure(false)
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-5">
      <h2 className="text-base font-semibold text-foreground">Inteligência Artificial</h2>

      <label className="flex items-start justify-between gap-4 cursor-pointer">
        <span>
          <span className="block text-sm font-medium text-foreground">
            Habilitar assistente de IA para evoluções
          </span>
          {settings.aiEnabled && settings.aiTermsAcceptedAt && (
            <span className="block text-xs text-muted-foreground mt-1">
              Habilitado em {formatAcceptedAt(settings.aiTermsAcceptedAt)}
            </span>
          )}
        </span>
        <input
          type="checkbox"
          checked={settings.aiEnabled}
          disabled={busy}
          onChange={handleMainToggle}
          className="mt-1 h-5 w-5 accent-primary disabled:opacity-50"
        />
      </label>

      {settings.aiEnabled && (
        <label className="flex items-start justify-between gap-4 cursor-pointer border-t border-border pt-5">
          <span>
            <span className="block text-sm font-medium text-foreground">
              Incluir contexto histórico nas gerações
            </span>
            <span className="block text-xs text-muted-foreground mt-1">
              Envia resumos pseudonimizados das últimas 3 notas assinadas do paciente para melhorar o
              rascunho. Desligado por padrão.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.aiHistoryContext}
            disabled={busy}
            onChange={(e) => void apply({ aiHistoryContext: e.target.checked })}
            className="mt-1 h-5 w-5 accent-primary disabled:opacity-50"
          />
        </label>
      )}

      <AiDisclosureDialog
        open={showDisclosure}
        busy={busy}
        onConfirm={() => void confirmEnable()}
        onCancel={() => setShowDisclosure(false)}
      />
    </div>
  )
}
