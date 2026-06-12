"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { FileText, Download } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { usePortal } from "./PortalSessionProvider"
import { MONTH_LABEL } from "./months"
import type { PortalInvoiceView } from "./format"

/** v1 documents = receipts (paid invoices). Forms/signatures are future. */
export function DocumentsList() {
  const { slug, activeProfileId } = usePortal()
  const [invoices, setInvoices] = useState<PortalInvoiceView[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!activeProfileId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/public/portal/${slug}/invoices?patientId=${activeProfileId}`, {
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        setInvoices((data.invoices ?? []).filter((i: PortalInvoiceView) => i.status === "PAGO"))
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useMountEffect(() => {
    void load()
  })

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>

  if (invoices.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Nenhum recibo disponível no momento.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <div
          key={inv.id}
          className="bg-card border border-border rounded-lg p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium text-foreground">
                Recibo {MONTH_LABEL[inv.referenceMonth - 1]}/{inv.referenceYear}
              </div>
              <div className="text-xs text-muted-foreground">Fatura paga</div>
            </div>
          </div>
          <a
            href={`/api/public/portal/${slug}/invoices/${inv.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outlined">
              <Download className="w-4 h-4 mr-1" /> Baixar
            </Button>
          </a>
        </div>
      ))}
    </div>
  )
}
