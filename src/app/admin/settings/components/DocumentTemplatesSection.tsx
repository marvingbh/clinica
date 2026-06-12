"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Copy, Pencil, Trash2 } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"
import { TemplateEditorSheet } from "./TemplateEditorSheet"

interface TemplateDTO {
  id?: string
  type: string
  name: string
  body: string
  isActive?: boolean
}

const TYPE_LABELS: Record<string, string> = {
  DECLARACAO_COMPARECIMENTO: "Declaração de comparecimento",
  ATESTADO_PSICOLOGICO: "Atestado psicológico",
  RELATORIO_PSICOLOGICO: "Relatório psicológico",
  LAUDO_PSICOLOGICO: "Laudo psicológico",
  PARECER_PSICOLOGICO: "Parecer psicológico",
  ENCAMINHAMENTO: "Encaminhamento",
  CONTRATO_TERAPEUTICO: "Contrato terapêutico",
  RECIBO_REEMBOLSO: "Recibo para reembolso",
}

export default function DocumentTemplatesSection() {
  const [system, setSystem] = useState<TemplateDTO[]>([])
  const [custom, setCustom] = useState<TemplateDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<TemplateDTO | null>(null)
  const [restrict, setRestrict] = useState(false)
  const [savingRestrict, setSavingRestrict] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/documents/templates?includeInactive=1")
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSystem(data.system ?? [])
      setCustom(data.custom ?? [])
    } catch {
      toast.error("Erro ao carregar modelos")
    } finally {
      setLoading(false)
    }
  }

  async function loadRestrict() {
    try {
      const res = await fetch("/api/admin/settings")
      if (!res.ok) return
      const data = await res.json()
      setRestrict(!!data.settings?.restrictClinicalDocsToProfessionals)
    } catch {
      // non-blocking
    }
  }

  async function toggleRestrict(value: boolean) {
    setSavingRestrict(true)
    setRestrict(value)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restrictClinicalDocsToProfessionals: value }),
      })
      if (!res.ok) throw new Error()
      toast.success("Configuração salva")
    } catch {
      setRestrict(!value)
      toast.error("Erro ao salvar configuração")
    } finally {
      setSavingRestrict(false)
    }
  }

  useMountEffect(() => {
    load()
    loadRestrict()
  })

  async function deactivate(id: string) {
    const res = await fetch(`/api/documents/templates/${id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Erro ao desativar modelo")
      return
    }
    toast.success("Modelo desativado")
    load()
  }

  if (loading) {
    return <div className="animate-pulse h-24 bg-muted rounded" />
  }

  return (
    <div className="space-y-6">
      <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
        <input
          type="checkbox"
          checked={restrict}
          disabled={savingRestrict}
          onChange={(e) => toggleRestrict(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-medium text-foreground">Restringir documentos clínicos a profissionais</span>
          <span className="block text-xs text-muted-foreground">
            Laudo, relatório, parecer e atestado só poderão ser gerados por usuários com perfil profissional.
          </span>
        </span>
      </label>

      <section>
        <h3 className="text-sm font-semibold text-foreground mb-2">Modelos do sistema</h3>
        <div className="space-y-2">
          {system.map((t) => (
            <div key={t.type} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{t.name}</div>
                <span className="text-xs text-muted-foreground">Padrão do sistema</span>
              </div>
              <button
                type="button"
                onClick={() => setEditing({ type: t.type, name: `${t.name} (clínica)`, body: t.body })}
                className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
              >
                <Copy className="h-3.5 w-3.5" /> Duplicar e editar
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-foreground mb-2">Modelos da clínica</h3>
        {custom.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum modelo personalizado.</p>
        ) : (
          <div className="space-y-2">
            {custom.map((t) => (
              <div key={t.id} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${t.isActive ? "" : "opacity-60"}`}>
                <div>
                  <div className="font-medium">{t.name}</div>
                  <span className="text-xs text-muted-foreground">
                    {TYPE_LABELS[t.type] ?? t.type}{t.isActive ? "" : " · desativado"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setEditing(t)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  {t.isActive && t.id && (
                    <button type="button" onClick={() => deactivate(t.id!)} className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                      <Trash2 className="h-3.5 w-3.5" /> Desativar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <TemplateEditorSheet isOpen={!!editing} onClose={() => setEditing(null)} initial={editing} onSaved={load} />
      )}
    </div>
  )
}
