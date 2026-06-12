"use client"

import { PortalShell } from "../components/PortalShell"
import { SessionsList } from "../components/SessionsList"
import { usePortal } from "../components/PortalSessionProvider"

export default function HistoricoPage() {
  return (
    <PortalShell>
      <History />
    </PortalShell>
  )
}

function History() {
  const { activeProfileId } = usePortal()
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground mb-4">Histórico de sessões</h1>
      <SessionsList key={activeProfileId ?? "none"} range="past" />
    </>
  )
}
