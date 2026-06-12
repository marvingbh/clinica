"use client"

import { Download, Send } from "lucide-react"
import type { GeneratedDocumentDTO } from "./types"

interface Props {
  doc: GeneratedDocumentDTO
  onSend: (doc: GeneratedDocumentDTO) => void
}

const TYPE_LABELS: Record<string, string> = {
  DECLARACAO_COMPARECIMENTO: "Declaração",
  ATESTADO_PSICOLOGICO: "Atestado",
  RELATORIO_PSICOLOGICO: "Relatório",
  LAUDO_PSICOLOGICO: "Laudo",
  PARECER_PSICOLOGICO: "Parecer",
  ENCAMINHAMENTO: "Encaminhamento",
  CONTRATO_TERAPEUTICO: "Contrato",
  RECIBO_REEMBOLSO: "Recibo",
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function DocumentListRow({ doc, onSend }: Props) {
  return (
    <tr className="border-t text-sm">
      <td className="px-3 py-2">{TYPE_LABELS[doc.templateType] ?? doc.templateType}</td>
      <td className="px-3 py-2">{doc.title}</td>
      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(doc.createdAt)}</td>
      <td className="px-3 py-2">{doc.professionalName ?? doc.generatedByName ?? "—"}</td>
      <td className="px-3 py-2">{doc.sentToEmail ? `${doc.sentToEmail}` : "—"}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-2">
          <a
            href={`/api/documents/${doc.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> Baixar
          </a>
          <button
            type="button"
            onClick={() => onSend(doc)}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
          >
            <Send className="h-3.5 w-3.5" /> Enviar
          </button>
        </div>
      </td>
    </tr>
  )
}
