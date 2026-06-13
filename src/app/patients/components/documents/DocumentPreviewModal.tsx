"use client"

import { X, Download } from "lucide-react"
import { isPreviewable } from "@/lib/storage"
import type { DocumentDTO } from "./helpers"

interface Props {
  patientId: string
  document: DocumentDTO
  onClose: () => void
}

/** Modal preview: PDF in an iframe, images as <img>; otherwise a download hint. */
export function DocumentPreviewModal({ patientId, document, onClose }: Props) {
  const base = `/api/patients/${patientId}/documents/${document.id}/download`
  const inlineUrl = `${base}?disposition=inline`
  const downloadUrl = `${base}?disposition=attachment`
  const previewable = isPreviewable(document.mimeType)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-3">
          <h3 className="text-sm font-semibold text-foreground truncate">{document.filename}</h3>
          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded-md border border-input hover:bg-muted"
            >
              <Download className="w-4 h-4" /> Baixar
            </a>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-muted" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {!previewable ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Visualização não disponível — baixe o arquivo.
            </p>
          ) : document.mimeType === "application/pdf" ? (
            <iframe src={inlineUrl} title={document.filename} className="w-full h-[70vh]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inlineUrl} alt={document.filename} className="max-w-full mx-auto" />
          )}
        </div>
      </div>
    </div>
  )
}
