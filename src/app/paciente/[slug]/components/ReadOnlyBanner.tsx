"use client"

import { usePortal } from "./PortalSessionProvider"

export function ReadOnlyBanner() {
  const { me } = usePortal()
  if (me?.access !== "read_only") return null
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 text-center">
      O portal está temporariamente em modo somente leitura. Entre em contato com a clínica.
    </div>
  )
}
