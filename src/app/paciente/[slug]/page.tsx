"use client"

import { PortalShell } from "./components/PortalShell"
import { SessionsList } from "./components/SessionsList"
import { usePortal } from "./components/PortalSessionProvider"

export default function PortalHomePage() {
  return (
    <PortalShell>
      <Sessions />
    </PortalShell>
  )
}

function Sessions() {
  const { activeProfileId } = usePortal()
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground mb-4">Próximas sessões</h1>
      {/* key resets the list state when the active profile changes */}
      <SessionsList key={activeProfileId ?? "none"} range="upcoming" />
    </>
  )
}
