"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { toast } from "sonner"
import { formatBytes } from "@/lib/storage"
import type { TabProps } from "../types"
import { patchSettings } from "../types"

interface Usage {
  usedBytes: number
  trashBytes: number
  limitBytes: number | null
  percent: number | null
}

export default function StorageUsageCard({ settings, onUpdate }: TabProps) {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [restrict, setRestrict] = useState(settings.restrictExamesToProfessionals ?? false)
  const [saving, setSaving] = useState(false)

  useMountEffect(() => {
    fetch("/api/clinic/storage-usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUsage(data))
      .catch(() => setUsage(null))
      .finally(() => setLoading(false))
  })

  async function saveRestrict(next: boolean) {
    setSaving(true)
    setRestrict(next)
    try {
      const updated = await patchSettings({ restrictExamesToProfessionals: next })
      onUpdate(updated)
      toast.success("Configuração salva")
    } catch (e) {
      setRestrict(!next)
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  const percent = usage?.percent ?? 0
  const barColor =
    percent >= 95 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-blue-500"

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Armazenamento</h2>
        {loading ? (
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        ) : usage ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              {formatBytes(usage.usedBytes)} de{" "}
              {usage.limitBytes === null ? "ilimitado" : formatBytes(usage.limitBytes)}
            </p>
            {usage.limitBytes !== null && (
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all`}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
            )}
            {usage.trashBytes > 0 && (
              <p className="text-xs text-muted-foreground">
                dos quais {formatBytes(usage.trashBytes)} na lixeira
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Não foi possível carregar o consumo.</p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <label className="text-sm font-medium text-foreground">
            Restringir exames a profissionais
          </label>
          <p className="text-xs text-muted-foreground">
            Documentos da categoria Exame ficam visíveis apenas a usuários com perfil profissional.
          </p>
        </div>
        <input
          type="checkbox"
          checked={restrict}
          disabled={saving}
          onChange={(e) => void saveRestrict(e.target.checked)}
          className="h-5 w-5 accent-brand-600"
        />
      </div>
    </div>
  )
}
