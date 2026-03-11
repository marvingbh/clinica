"use client"

import React, { useState, useRef } from "react"
import { toast } from "sonner"
import type { InvoiceDetail } from "./types"

interface NfSectionProps {
  invoice: InvoiceDetail
  onRefresh: () => void
}

export default function NfSection({ invoice, onRefresh }: NfSectionProps) {
  const [togglingNf, setTogglingNf] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [deletingPdf, setDeletingPdf] = useState(false)
  const nfFileRef = useRef<HTMLInputElement>(null)

  async function handleToggleNf() {
    setTogglingNf(true)
    const newValue = !invoice.notaFiscalEmitida
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notaFiscalEmitida: newValue }),
    })
    if (res.ok) {
      toast.success(newValue ? "NF marcada como emitida" : "NF desmarcada")
      onRefresh()
    } else {
      toast.error("Erro ao atualizar NF")
    }
    setTogglingNf(false)
  }

  async function handleUploadNfPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPdf(true)
    const formData = new FormData()
    formData.append("file", file)
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}/nota-fiscal`, {
      method: "POST",
      body: formData,
    })
    if (res.ok) {
      toast.success("PDF da NF enviado")
      onRefresh()
    } else {
      const data = await res.json()
      toast.error(data.error || "Erro ao enviar PDF")
    }
    setUploadingPdf(false)
    if (nfFileRef.current) nfFileRef.current.value = ""
  }

  async function handleDeleteNfPdf() {
    setDeletingPdf(true)
    const res = await fetch(`/api/financeiro/faturas/${invoice.id}/nota-fiscal`, {
      method: "DELETE",
    })
    if (res.ok) {
      toast.success("PDF removido")
      onRefresh()
    } else {
      toast.error("Erro ao remover PDF")
    }
    setDeletingPdf(false)
  }

  return (
    <div className="p-4 rounded-lg border border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Nota Fiscal</h3>
        <button
          onClick={handleToggleNf}
          disabled={togglingNf}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
            invoice.notaFiscalEmitida
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {togglingNf ? "..." : invoice.notaFiscalEmitida ? "NF Emitida" : "Marcar NF Emitida"}
        </button>
      </div>
      {invoice.notaFiscalEmitidaAt && (
        <p className="text-xs text-muted-foreground">
          Emitida em {new Date(invoice.notaFiscalEmitidaAt).toLocaleDateString("pt-BR")}
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={nfFileRef}
          type="file"
          accept="application/pdf"
          onChange={handleUploadNfPdf}
          className="hidden"
        />
        <button
          onClick={() => nfFileRef.current?.click()}
          disabled={uploadingPdf}
          className="px-3 py-1.5 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          {uploadingPdf ? "Enviando..." : "Upload PDF"}
        </button>
        {invoice.hasNotaFiscalPdf && (
          <>
            <a
              href={`/api/financeiro/faturas/${invoice.id}/nota-fiscal`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Baixar PDF
            </a>
            <button
              onClick={handleDeleteNfPdf}
              disabled={deletingPdf}
              className="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-xs font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {deletingPdf ? "..." : "Remover PDF"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
