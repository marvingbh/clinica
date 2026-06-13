"use client"

import { useState } from "react"
import { Eye, Download, Pencil, Trash2, RotateCcw, MoreVertical } from "lucide-react"
import { canEditDocument, canDeleteDocument } from "@/lib/patient-documents"
import { formatBytes } from "@/lib/storage"
import { DocumentCategoryChip } from "./DocumentCategoryChip"
import { DocumentSourceBadge } from "./DocumentSourceBadge"
import { DocumentTypeIcon } from "./DocumentTypeIcon"
import { formatBrDate, type DocumentDTO } from "./helpers"

interface Props {
  patientId: string
  document: DocumentDTO
  canWrite: boolean
  purgeDeadline: string | null
  onPreview: (d: DocumentDTO) => void
  onEdit: (d: DocumentDTO) => void
  onDelete: (d: DocumentDTO) => void
  onRestore: (d: DocumentDTO) => void
}

export function DocumentRow({
  patientId,
  document,
  canWrite,
  purgeDeadline,
  onPreview,
  onEdit,
  onDelete,
  onRestore,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isTrashed = !!document.deletedAt
  const meta = {
    source: document.source,
    category: document.category,
    deletedAt: document.deletedAt ? new Date(document.deletedAt) : null,
  }
  const editable = canEditDocument(meta)
  const deletable = canDeleteDocument(meta)
  const downloadUrl = `/api/patients/${patientId}/documents/${document.id}/download?disposition=attachment`

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-border p-3 ${
        isTrashed ? "opacity-60 bg-muted/30" : "bg-background"
      }`}
    >
      <DocumentTypeIcon mimeType={document.mimeType} className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{document.filename}</span>
          <DocumentCategoryChip category={document.category} />
          <DocumentSourceBadge source={document.source} />
        </div>
        {document.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{document.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatBytes(document.sizeBytes)} · {formatBrDate(document.createdAt)} ·{" "}
          {document.uploader?.name ?? "Sistema"}
        </p>
        {isTrashed && purgeDeadline && (
          <p className="text-xs text-red-600 mt-0.5">
            Removido em {formatBrDate(document.deletedAt!)} — exclui definitivamente em {purgeDeadline}
          </p>
        )}
      </div>

      <div className="relative">
        {isTrashed ? (
          canWrite && (
            <button
              onClick={() => onRestore(document)}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-input hover:bg-muted"
            >
              <RotateCcw className="w-4 h-4" /> Restaurar
            </button>
          )
        ) : (
          <>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="p-1 rounded-md hover:bg-muted"
              aria-label="Ações"
            >
              <MoreVertical className="w-5 h-5 text-muted-foreground" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-8 z-10 w-44 rounded-md border border-border bg-background shadow-lg py-1 text-sm"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onPreview(document)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-muted"
                >
                  <Eye className="w-4 h-4" /> Visualizar
                </button>
                <a
                  href={downloadUrl}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-muted"
                >
                  <Download className="w-4 h-4" /> Baixar
                </a>
                {canWrite && editable && (
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onEdit(document)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-muted"
                  >
                    <Pencil className="w-4 h-4" /> Editar
                  </button>
                )}
                {canWrite && (
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      if (deletable) onDelete(document)
                    }}
                    disabled={!deletable}
                    title={
                      deletable
                        ? undefined
                        : document.source === "UPLOAD"
                          ? undefined
                          : "Documento vinculado ao prontuário — sujeito à retenção clínica"
                    }
                    className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-muted text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" /> Remover
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
