"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { FileText, Download } from "lucide-react"
import { Button } from "@/shared/components/ui/button"
import { usePortal } from "./PortalSessionProvider"
import { FilteredPagedList } from "./FilteredPagedList"
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
    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  })

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>

  return (
    <FilteredPagedList
      items={invoices}
      getKey={(inv) => inv.id}
      getSearchText={(inv) => `recibo ${MONTH_LABEL[inv.referenceMonth - 1]} ${inv.referenceYear}`}
      getMonth={(inv) => ({ month: inv.referenceMonth, year: inv.referenceYear })}
      searchPlaceholder="Buscar recibo por mês, ano…"
      emptyText="Nenhum recibo disponível no momento."
      renderItem={(inv) => (
        <div className="bg-card border border-border rounded-lg p-4 flex items-center justify-between">
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
            <Button size="sm" variant="outlined" leftIcon={<Download className="w-4 h-4" />}>
              Baixar
            </Button>
          </a>
        </div>
      )}
    />
  )
}
