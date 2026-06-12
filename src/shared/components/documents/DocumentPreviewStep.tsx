"use client"

import { MissingFieldsChecklist } from "./MissingFieldsChecklist"
import type { MissingFieldDTO, SessionRowDTO } from "./types"

interface Props {
  loading: boolean
  content: string
  sessionRows: SessionRowDTO[]
  missing: MissingFieldDTO[]
}

export function DocumentPreviewStep({ loading, content, sessionRows, missing }: Props) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-2/3 bg-muted rounded" />
        <div className="h-4 w-full bg-muted rounded" />
        <div className="h-4 w-5/6 bg-muted rounded" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <MissingFieldsChecklist missing={missing} />

      <div className="rounded-md border bg-white p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
        {content || "Pré-visualização indisponível."}
      </div>

      {sessionRows.length > 0 && (
        <table className="w-full text-sm border rounded-md overflow-hidden">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-1.5">Data</th>
              <th className="text-left px-3 py-1.5">Duração</th>
              <th className="text-right px-3 py-1.5">Valor</th>
            </tr>
          </thead>
          <tbody>
            {sessionRows.map((r) => (
              <tr key={r.invoiceItemId} className="border-t">
                <td className="px-3 py-1.5">{r.date}</td>
                <td className="px-3 py-1.5">{r.durationMinutes} min</td>
                <td className="px-3 py-1.5 text-right">{r.unitPrice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
