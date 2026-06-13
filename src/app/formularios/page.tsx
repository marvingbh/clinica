"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useMountEffect, usePermission } from "@/shared/hooks"
import { TemplateList, type TemplateSummary } from "./components/TemplateList"
import { NewTemplateDialog } from "./components/NewTemplateDialog"

export default function FormulariosPage() {
  const router = useRouter()
  const { canRead, canWrite } = usePermission("forms")
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [seeding, setSeeding] = useState(false)

  async function reload() {
    const res = await fetch("/api/forms/templates")
    if (res.ok) {
      const data = await res.json()
      setTemplates(data.templates)
    } else {
      setTemplates([])
    }
  }

  useMountEffect(() => {
    void reload()
  })

  async function handleSeed() {
    setSeeding(true)
    try {
      const res = await fetch("/api/forms/templates/seed", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(data.created > 0 ? `${data.created} modelo(s) adicionado(s)` : "Modelos prontos já existem")
        await reload()
      } else {
        toast.error(data.error ?? "Não foi possível adicionar os modelos")
      }
    } finally {
      setSeeding(false)
    }
  }

  async function handleCreate(name: string, description: string) {
    const res = await fetch("/api/forms/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setShowNew(false)
      router.push(`/formularios/${data.template.id}`)
    } else {
      toast.error(data.error ?? "Não foi possível criar o modelo")
    }
  }

  if (!canRead) {
    return <div className="p-6 text-[14px] text-ink-600">Sem permissão para acessar Formulários.</div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold text-ink-900">Formulários</h1>
          <p className="text-[13px] text-ink-500 mt-0.5">Anamneses e questionários enviados aos pacientes.</p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-700 disabled:opacity-50"
            >
              {seeding ? "Adicionando..." : "Adicionar modelos prontos"}
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="rounded-lg bg-ink-900 text-white px-3 py-2 text-[13px] font-medium"
            >
              Novo formulário
            </button>
          </div>
        )}
      </div>

      <TemplateList templates={templates} onOpen={(id) => router.push(`/formularios/${id}`)} />

      {showNew && <NewTemplateDialog onClose={() => setShowNew(false)} onCreate={handleCreate} />}
    </div>
  )
}
