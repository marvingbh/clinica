"use client"

import { useState } from "react"
import { AlertTriangle, Send } from "lucide-react"
import {
  STATUS_LABELS,
  SOURCE_LABELS,
  statusChipColor,
  severityChipColor,
  getScaleDefinition,
  isScaleCode,
} from "@/lib/scales"
import { AdministrationDetailDialog } from "./AdministrationDetailDialog"
import type { AdministrationRow } from "./types"

interface Props {
  administrations: AdministrationRow[]
  canWrite: boolean
  onResend: (administrationId: string) => Promise<void>
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

export function AdministrationsTable({ administrations, canWrite, onResend }: Props) {
  const [detail, setDetail] = useState<AdministrationRow | null>(null)
  const [resending, setResending] = useState<string | null>(null)

  if (administrations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
        Nenhuma escala aplicada ainda. Envie a primeira para começar a acompanhar a evolução.
      </p>
    )
  }

  async function handleResend(id: string) {
    setResending(id)
    try {
      await onResend(id)
    } finally {
      setResending(null)
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">Data</th>
            <th className="px-3 py-2">Escala</th>
            <th className="px-3 py-2">Origem</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Pontuação</th>
            <th className="px-3 py-2">Severidade</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {administrations.map((a) => {
            const def = isScaleCode(a.scaleCode) ? getScaleDefinition(a.scaleCode) : null
            const completed = a.status === "CONCLUIDA"
            return (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDateTime(a.completedAt ?? a.sentAt ?? a.createdAt)}
                </td>
                <td className="px-3 py-2">{def?.shortName ?? a.scaleCode}</td>
                <td className="px-3 py-2">{SOURCE_LABELS[a.source] ?? a.source}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusChipColor(a.status)}`}>
                    {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {completed && a.totalScore !== null ? `${a.totalScore}/${def?.maxScore ?? "?"}` : "—"}
                  {a.riskFlag && (
                    <AlertTriangle className="ml-1 inline h-4 w-4 text-red-500" aria-label="Resposta de risco" />
                  )}
                </td>
                <td className="px-3 py-2">
                  {completed && a.severityLabel && def ? (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${severityChipColor(
                        def,
                        a.severityLabel
                      )}`}
                    >
                      {a.severityLabel}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {completed ? (
                    <button
                      onClick={() => setDetail(a)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver respostas
                    </button>
                  ) : canWrite && a.status !== "CONCLUIDA" ? (
                    <button
                      onClick={() => handleResend(a.id)}
                      disabled={resending === a.id}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" /> Reenviar link
                    </button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {detail && (
        <AdministrationDetailDialog administration={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
