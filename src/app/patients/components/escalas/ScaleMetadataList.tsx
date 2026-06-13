"use client"

import { STATUS_LABELS, SOURCE_LABELS, statusChipColor } from "@/lib/scales"
import type { MetadataRow } from "./types"

interface Props {
  rows: MetadataRow[]
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—"
}

/** ADMIN (escalas = NONE) view: metadata only, no scores/answers/risk. */
export function ScaleMetadataList({ rows }: Props) {
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
        Pontuações e respostas são dados clínicos visíveis apenas para profissionais autorizados.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
          Nenhuma escala enviada ainda.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Escala</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Enviada</th>
                <th className="px-3 py-2">Concluída</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.shortName}</td>
                  <td className="px-3 py-2">{SOURCE_LABELS[r.source] ?? r.source}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusChipColor(r.status)}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{formatDate(r.sentAt)}</td>
                  <td className="px-3 py-2">{formatDate(r.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
