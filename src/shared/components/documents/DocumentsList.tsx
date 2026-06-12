"use client"

import { DocumentListRow } from "./DocumentListRow"
import type { GeneratedDocumentDTO } from "./types"

interface Props {
  documents: GeneratedDocumentDTO[]
  loading: boolean
  onSend: (doc: GeneratedDocumentDTO) => void
}

export function DocumentsList({ documents, loading, onSend }: Props) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-8 w-full bg-muted rounded" />
        <div className="h-8 w-full bg-muted rounded" />
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Nenhum documento gerado para este paciente.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full">
        <thead className="bg-muted text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Tipo</th>
            <th className="px-3 py-2 text-left">Título</th>
            <th className="px-3 py-2 text-left">Gerado em</th>
            <th className="px-3 py-2 text-left">Por</th>
            <th className="px-3 py-2 text-left">Enviado</th>
            <th className="px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <DocumentListRow key={doc.id} doc={doc} onSend={onSend} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
