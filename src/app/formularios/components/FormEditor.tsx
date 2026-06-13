"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useMountEffect, usePermission } from "@/shared/hooks"
import { makeFieldId, hasUnpublishedChanges, FIELD_TYPE_LABELS, type FormField, type FormFieldType } from "@/lib/forms"
import { FieldList } from "./FieldList"
import { FieldTypePicker } from "./FieldTypePicker"
import { MobilePreview } from "./MobilePreview"
import { PublishBar } from "./PublishBar"

interface VersionMeta {
  id: string
  version: number
  publishedAt: string
}

function newField(type: FormFieldType): FormField {
  const base: FormField = { id: makeFieldId(), type, label: FIELD_TYPE_LABELS[type] }
  if (type === "single_choice" || type === "multiple_choice" || type === "dropdown") {
    base.options = ["Opção 1", "Opção 2"]
  }
  if (type === "info_consent") base.infoText = "Texto do termo de consentimento."
  return base
}

export function FormEditor({ templateId }: { templateId: string }) {
  const router = useRouter()
  const { canWrite } = usePermission("forms")
  const [name, setName] = useState("")
  const [autoSend, setAutoSend] = useState(false)
  const [fields, setFields] = useState<FormField[]>([])
  const [publishedFields, setPublishedFields] = useState<FormField[] | null>(null)
  const [versions, setVersions] = useState<VersionMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useMountEffect(() => {
    let active = true
    async function load() {
      const res = await fetch(`/api/forms/templates/${templateId}`)
      if (!res.ok) {
        if (active) {
          toast.error("Modelo não encontrado")
          router.push("/formularios")
        }
        return
      }
      const data = await res.json()
      if (!active) return
      setName(data.template.name)
      setAutoSend(data.template.autoSendOnIntakeApproval)
      setFields(data.draftFields)
      setVersions(data.versions)
      setPublishedFields(data.publishedFields ?? null)
      setLoaded(true)
    }
    void load()
    return () => {
      active = false
    }
  })

  const unpublished = hasUnpublishedChanges(fields, publishedFields)
  const latestVersion = versions[0]?.version ?? null

  function addField(type: FormFieldType) {
    const field = newField(type)
    setFields((prev) => [...prev, field])
    setSelectedId(field.id)
  }

  function changeField(id: string, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function save(): Promise<boolean> {
    setSaving(true)
    try {
      const res = await fetch(`/api/forms/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, autoSendOnIntakeApproval: autoSend, draftFields: fields }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success("Rascunho salvo")
        return true
      }
      toast.error(data.error ?? "Não foi possível salvar")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    setPublishing(true)
    try {
      const saved = await save()
      if (!saved) return
      const res = await fetch(`/api/forms/templates/${templateId}/publish`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Versão ${data.version.version} publicada`)
        setVersions((prev) => [{ id: data.version.id, version: data.version.version, publishedAt: data.version.publishedAt }, ...prev])
        setPublishedFields(fields)
      } else {
        toast.error(data.error ?? "Não foi possível publicar")
      }
    } finally {
      setPublishing(false)
    }
  }

  if (!loaded) return <div className="p-6 text-[14px] text-ink-500">Carregando...</div>

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <button onClick={() => router.push("/formularios")} className="text-[13px] text-ink-500 hover:underline">
        ← Voltar
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canWrite}
          className="text-[20px] font-semibold text-ink-900 bg-transparent outline-none border-b border-transparent focus:border-ink-300"
        />
      </div>

      {canWrite && (
        <div className="mt-3">
          <PublishBar
            hasUnpublishedChanges={unpublished}
            latestVersion={latestVersion}
            saving={saving}
            publishing={publishing}
            onSave={save}
            onPublish={publish}
          />
        </div>
      )}

      <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-700">
        <input
          type="checkbox"
          checked={autoSend}
          disabled={!canWrite}
          onChange={(e) => setAutoSend(e.target.checked)}
        />
        Enviar automaticamente ao aprovar ficha de cadastro
      </label>

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-ink-900">Campos</h2>
            {canWrite && <FieldTypePicker onAdd={addField} />}
          </div>
          <FieldList
            fields={fields}
            selectedId={selectedId}
            onReorder={setFields}
            onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
            onChangeField={changeField}
            onRemoveField={removeField}
          />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-ink-900 mb-3">Pré-visualização mobile</h2>
          <MobilePreview fields={fields} />
        </div>
      </div>
    </div>
  )
}
