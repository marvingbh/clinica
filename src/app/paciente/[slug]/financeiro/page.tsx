"use client"

import { PortalShell } from "../components/PortalShell"
import { InvoicesList } from "../components/InvoicesList"
import { usePortal } from "../components/PortalSessionProvider"

export default function FinanceiroPage() {
  return (
    <PortalShell>
      <Financeiro />
    </PortalShell>
  )
}

function Financeiro() {
  const { activeProfileId } = usePortal()
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground mb-4">Minhas faturas</h1>
      <InvoicesList key={activeProfileId ?? "none"} />
    </>
  )
}
