"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import {
  CATEGORY_LABELS,
  CATEGORY_VALUES,
  purgeDeadline,
  type PatientDocumentCategoryString,
} from "@/lib/patient-documents"
import { formatBrDate, type DocumentDTO } from "./helpers"
import { DocumentUploadZone } from "./DocumentUploadZone"
import { DocumentRow } from "./DocumentRow"
import { DocumentPreviewModal } from "./DocumentPreviewModal"
import { DocumentEditModal } from "./DocumentEditModal"
import { StorageQuotaBanner } from "./StorageQuotaBanner"

interface Props {
  patientId: string
  canWrite: boolean
}

const PAGE_SIZE = 20

export function PatientDocumentsTab({ patientId, canWrite }: Props) {
  const [documents, setDocuments] = useState<DocumentDTO[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showTrash, setShowTrash] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<PatientDocumentCategoryString | "">("")
  const [search, setSearch] = useState("")
  const [skip, setSkip] = useState(0)
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<DocumentDTO | null>(null)
  const [editing, setEditing] = useState<DocumentDTO | null>(null)

  async function load(reset: boolean, opts?: { trash?: boolean; category?: string }) {
    setLoading(true)
    const nextSkip = reset ? 0 : skip
    const trash = opts?.trash ?? showTrash
    const category = opts?.category ?? categoryFilter
    const params = new URLSearchParams({
      includeDeleted: String(trash),
      skip: String(nextSkip),
      take: String(PAGE_SIZE),
    })
    if (category) params.set("category", category)
    const res = await fetch(`/api/patients/${patientId}/documents?${params}`)
    if (!res.ok) {
      toast.error("Não foi possível carregar os documentos.")
      setLoading(false)
      return
    }
    const data = await res.json()
    setTotal(data.total ?? 0)
    setDocuments((prev) => (reset ? data.documents : [...prev, ...data.documents]))
    setSkip(nextSkip + PAGE_SIZE)
    setLoading(false)
  }

  useMountEffect(() => {
    load(true)
  })

  function reload() {
    setQuotaMessage(null)
    load(true)
  }

  function applyTrash(next: boolean) {
    setShowTrash(next)
    setSkip(0)
    load(true, { trash: next })
  }

  function applyCategory(next: PatientDocumentCategoryString | "") {
    setCategoryFilter(next)
    setSkip(0)
    load(true, { category: next })
  }

  async function handleDelete(doc: DocumentDTO) {
    if (!window.confirm("Remover documento? Ele ficará na lixeira por 30 dias e depois será excluído definitivamente.")) {
      return
    }
    const res = await fetch(`/api/patients/${patientId}/documents/${doc.id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Falha ao remover.")
      return
    }
    toast.success("Documento removido")
    reload()
  }

  async function handleRestore(doc: DocumentDTO) {
    const res = await fetch(`/api/patients/${patientId}/documents/${doc.id}/restore`, { method: "POST" })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Falha ao restaurar.")
      return
    }
    toast.success("Documento restaurado")
    reload()
  }

  const filtered = documents.filter((d) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      d.filename.toLowerCase().includes(q) ||
      (d.description ?? "").toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      {quotaMessage && <StorageQuotaBanner message={quotaMessage} />}

      {canWrite && !showTrash && (
        <DocumentUploadZone
          patientId={patientId}
          onUploaded={reload}
          onQuotaExceeded={setQuotaMessage}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => applyCategory("")}
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            categoryFilter === "" ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
          }`}
        >
          Todas
        </button>
        {CATEGORY_VALUES.map((c) => (
          <button
            key={c}
            onClick={() => applyCategory(c)}
            className={`px-2 py-1 rounded-full text-xs font-medium ${
              categoryFilter === c ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
        <input
          type="text"
          placeholder="Buscar por nome/descrição"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-sm w-48"
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={showTrash} onChange={(e) => applyTrash(e.target.checked)} />
          Mostrar lixeira
        </label>
      </div>

      {loading && documents.length === 0 ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {showTrash ? "Nenhum documento na lixeira." : "Nenhum documento anexado ainda."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <DocumentRow
              key={doc.id}
              patientId={patientId}
              document={doc}
              canWrite={canWrite}
              purgeDeadline={
                doc.deletedAt ? formatBrDate(purgeDeadline(new Date(doc.deletedAt)).toISOString()) : null
              }
              onPreview={setPreview}
              onEdit={setEditing}
              onDelete={handleDelete}
              onRestore={handleRestore}
            />
          ))}
        </div>
      )}

      {documents.length < total && (
        <div className="flex justify-center">
          <button
            onClick={() => load(false)}
            disabled={loading}
            className="h-9 px-4 rounded-md border border-input text-sm hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Carregando…" : "Carregar mais"}
          </button>
        </div>
      )}

      {preview && (
        <DocumentPreviewModal patientId={patientId} document={preview} onClose={() => setPreview(null)} />
      )}
      {editing && (
        <DocumentEditModal
          patientId={patientId}
          document={editing}
          onSaved={reload}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
