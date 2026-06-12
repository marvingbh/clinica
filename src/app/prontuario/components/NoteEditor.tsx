"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import { NoteSectionField } from "./NoteSectionField"
import { NoteTypeSegmented } from "./NoteTypeSegmented"
import { TemplatePicker } from "./TemplatePicker"
import { SignConfirmDialog } from "./SignConfirmDialog"
import { AddendumList } from "./AddendumList"
import { NoteEditorHeader } from "./NoteEditorHeader"
import { NoteEditorFooter } from "./NoteEditorFooter"
import { NOTE_FORMAT_LABELS } from "./labels"
import { DEFAULT_TEMPLATES, type ClinicalNoteType } from "@/lib/prontuario"
import type { NoteDetail, NoteAddendumItem, NoteTemplateItem } from "./api-types"

const AUTOSAVE_MS = 1500

interface NoteEditorProps {
  initialNote: NoteDetail
  initialAddenda: NoteAddendumItem[]
  templates: NoteTemplateItem[]
}

function sectionDefsFor(note: NoteDetail, templates: NoteTemplateItem[]) {
  const tpl = note.templateId ? templates.find((t) => t.id === note.templateId) : null
  if (tpl) return tpl.sectionDefs
  const fallback =
    DEFAULT_TEMPLATES.find((t) => t.format === note.format) ?? DEFAULT_TEMPLATES[0]
  return fallback.sectionDefs
}

export function NoteEditor({ initialNote, initialAddenda, templates }: NoteEditorProps) {
  const router = useRouter()
  const [note, setNote] = useState(initialNote)
  const [addenda, setAddenda] = useState(initialAddenda)
  const [sections, setSections] = useState<Record<string, string>>(initialNote.sections ?? {})
  const [updatedAt, setUpdatedAt] = useState(initialNote.updatedAt)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "locked">("idle")
  const [showSign, setShowSign] = useState(false)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useMountEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  })

  const isSigned = note.status === "ASSINADA"
  const editable = !isSigned && note.canWrite && saveState !== "locked"
  const hasContent = Object.values(sections).some((v) => v.trim().length > 0)
  const defs = sectionDefsFor(note, templates)

  async function flush(payload: Record<string, unknown>) {
    setSaveState("saving")
    try {
      const res = await fetch(`/api/prontuario/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, updatedAt }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setSaveState("locked")
        toast.error(
          data.code === "SIGNED"
            ? "Notas assinadas não podem ser alteradas. Adicione um adendo."
            : "Esta nota foi alterada em outra aba ou dispositivo. Recarregue a página para continuar."
        )
        return
      }
      if (!res.ok) throw new Error()
      setUpdatedAt(data.note.updatedAt)
      setSaveState("saved")
    } catch {
      setSaveState("idle")
      toast.error("Erro ao salvar.")
    }
  }

  function scheduleSave(next: Record<string, string>) {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void flush({ sections: next }), AUTOSAVE_MS)
  }

  function handleSectionChange(id: string, value: string) {
    const next = { ...sections, [id]: value }
    setSections(next)
    setSaveState("saving")
    scheduleSave(next)
  }

  function handleTypeChange(value: ClinicalNoteType) {
    setNote((n) => ({ ...n, noteType: value }))
    void flush({ noteType: value })
  }

  function handleTemplate(t: NoteTemplateItem) {
    setNote((n) => ({ ...n, templateId: t.id, format: t.format }))
    void flush({ templateId: t.id, format: t.format })
  }

  async function handleSign() {
    setBusy(true)
    try {
      const res = await fetch(`/api/prontuario/notes/${note.id}/sign`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (res.status === 422) {
        toast.error("Preencha ao menos uma seção antes de assinar.")
        return
      }
      if (!res.ok) throw new Error()
      setNote((n) => ({ ...n, ...data.note, canWrite: n.canWrite }))
      setShowSign(false)
      toast.success("Nota assinada com sucesso.")
    } catch {
      toast.error("Não foi possível assinar a nota.")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm("Excluir este rascunho? Esta ação não pode ser desfeita.")) return
    setBusy(true)
    try {
      const res = await fetch(`/api/prontuario/notes/${note.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Rascunho excluído.")
      router.push(`/patients?id=${note.patientId}`)
    } catch {
      toast.error("Não foi possível excluir o rascunho.")
    } finally {
      setBusy(false)
    }
  }

  const saveLabel =
    saveState === "saving"
      ? "Salvando..."
      : saveState === "saved"
        ? `Salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
        : saveState === "locked"
          ? "Edição bloqueada"
          : ""

  return (
    <div className="space-y-6">
      <NoteEditorHeader note={note} saveLabel={saveLabel} />

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">Tipo de registro:</span>
        <NoteTypeSegmented value={note.noteType} onChange={handleTypeChange} disabled={!editable} />
      </div>

      {editable && !hasContent && (
        <TemplatePicker templates={templates} selectedId={note.templateId} onSelect={handleTemplate} />
      )}

      <div className="space-y-1 text-xs text-muted-foreground">Formato: {NOTE_FORMAT_LABELS[note.format]}</div>

      <div className="space-y-4">
        {defs.map((def) => (
          <NoteSectionField
            key={def.id}
            label={def.label}
            helpText={def.helpText}
            value={sections[def.id] ?? ""}
            readOnly={!editable}
            onChange={(v) => handleSectionChange(def.id, v)}
          />
        ))}
      </div>

      {!isSigned && note.canWrite && (
        <NoteEditorFooter
          busy={busy}
          hasContent={hasContent}
          locked={saveState === "locked"}
          onDelete={handleDelete}
          onSign={() => setShowSign(true)}
          onReload={() => router.refresh()}
        />
      )}

      {isSigned && (
        <AddendumList
          noteId={note.id}
          addenda={addenda}
          canAdd={note.canWrite}
          onAdded={(a) => setAddenda((prev) => [...prev, a])}
        />
      )}

      <SignConfirmDialog
        open={showSign}
        busy={busy}
        onConfirm={handleSign}
        onCancel={() => setShowSign(false)}
      />
    </div>
  )
}
