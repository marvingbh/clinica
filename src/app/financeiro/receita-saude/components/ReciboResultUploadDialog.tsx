"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/shared/components/ui"

interface Props {
  batchId: string
  onClose: () => void
  onProcessed: () => void
}

export function ReciboResultUploadDialog({ batchId, onClose, onProcessed }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setContent(await file.text())
  }

  async function handleSubmit() {
    if (!content) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/financeiro/fiscal/receita-saude/batches/${batchId}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileContent: content }),
      })
      if (res.status === 422) {
        toast.error("Não foi possível interpretar o arquivo de resultado")
        return
      }
      if (!res.ok) throw new Error()
      const { emitted, errored } = await res.json()
      toast.success(`Resultado processado: ${emitted} emitidos, ${errored} com erro`)
      onProcessed()
      onClose()
    } catch {
      toast.error("Erro ao enviar o arquivo de resultado")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold">Enviar arquivo de resultado</h3>
        <input type="file" accept=".txt,text/plain" onChange={handleFile} className="mb-4 block w-full text-sm" />
        <div className="flex justify-end gap-2">
          <Button variant="outlined" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!content || submitting}>
            {submitting ? "Enviando..." : "Enviar"}
          </Button>
        </div>
      </div>
    </div>
  )
}
