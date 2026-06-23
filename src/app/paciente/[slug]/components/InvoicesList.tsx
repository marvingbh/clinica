"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { usePortal } from "./PortalSessionProvider"
import { InvoiceCard } from "./InvoiceCard"
import { FilteredPagedList } from "./FilteredPagedList"
import { MONTH_LABEL } from "./months"
import { invoiceStatusLabel, type PortalInvoiceView } from "./format"

export function InvoicesList() {
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
        setInvoices(data.invoices ?? [])
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
      getKey={(i) => i.id}
      getSearchText={(i) =>
        `${MONTH_LABEL[i.referenceMonth - 1]} ${i.referenceYear} ${invoiceStatusLabel(i.status)}`
      }
      getMonth={(i) => ({ month: i.referenceMonth, year: i.referenceYear })}
      renderItem={(i) => <InvoiceCard invoice={i} />}
      searchPlaceholder="Buscar por mês, ano, status…"
      emptyText="Você não tem faturas."
    />
  )
}
