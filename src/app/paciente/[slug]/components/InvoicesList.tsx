"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"
import { usePortal } from "./PortalSessionProvider"
import { InvoiceCard } from "./InvoiceCard"
import type { PortalInvoiceView } from "./format"

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

  if (invoices.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Você não tem faturas.</div>
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <InvoiceCard key={inv.id} invoice={inv} />
      ))}
    </div>
  )
}
