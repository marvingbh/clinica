"use client"

import { useState } from "react"
import { toast } from "sonner"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { downloadTextFile } from "./download"
import { ReciboResultUploadDialog } from "./ReciboResultUploadDialog"
import type { BatchView } from "./types"

const STATUS_LABEL: Record<BatchView["aggregateStatus"], string> = {
  AGUARDANDO: "Aguardando resultado",
  PROCESSADO: "Processado",
  COM_ERROS: "Com erros",
}

interface Props {
  batches: BatchView[]
  onChanged: () => void
}

export function ReciboBatchList({ batches, onChanged }: Props) {
  const [uploadFor, setUploadFor] = useState<string | null>(null)

  async function redownload(id: string) {
    const res = await fetch(`/api/financeiro/fiscal/receita-saude/batches/${id}`)
    if (!res.ok) return toast.error("Erro ao baixar o arquivo")
    const { fileName, fileContent } = await res.json()
    downloadTextFile(fileName, fileContent)
  }

  async function undo(id: string) {
    const res = await fetch(`/api/financeiro/fiscal/receita-saude/batches/${id}`, { method: "DELETE" })
    if (res.status === 409) return toast.error("Lote possui recibos já emitidos — não pode ser desfeito.")
    if (!res.ok) return toast.error("Erro ao desfazer o lote")
    toast.success("Lote desfeito")
    onChanged()
  }

  if (batches.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum lote gerado ainda.</p>
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Gerado em</th>
              <th className="px-3 py-2">Profissional</th>
              <th className="px-3 py-2 text-right">Recibos</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(b.createdAt).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-3 py-2">{b.professionalName}</td>
                <td className="px-3 py-2 text-right">{b.itemCount}</td>
                <td className="px-3 py-2 text-right">{formatCurrencyBRL(b.totalAmount)}</td>
                <td className="px-3 py-2">{STATUS_LABEL[b.aggregateStatus]}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button className="text-primary hover:underline" onClick={() => redownload(b.id)}>
                      Baixar
                    </button>
                    <button className="text-primary hover:underline" onClick={() => setUploadFor(b.id)}>
                      Enviar resultado
                    </button>
                    <button className="text-red-600 hover:underline" onClick={() => undo(b.id)}>
                      Desfazer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {uploadFor && (
        <ReciboResultUploadDialog
          batchId={uploadFor}
          onClose={() => setUploadFor(null)}
          onProcessed={onChanged}
        />
      )}
    </>
  )
}
