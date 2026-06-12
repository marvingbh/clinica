"use client"

import { PortalShell } from "../components/PortalShell"
import { DocumentsList } from "../components/DocumentsList"
import { usePortal } from "../components/PortalSessionProvider"

export default function DocumentosPage() {
  return (
    <PortalShell>
      <Documents />
    </PortalShell>
  )
}

function Documents() {
  const { activeProfileId } = usePortal()
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground mb-4">Documentos</h1>
      <DocumentsList key={activeProfileId ?? "none"} />
    </>
  )
}
