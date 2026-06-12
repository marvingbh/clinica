"use client"

import { useState } from "react"
import Link from "next/link"
import { FileText } from "lucide-react"
import { useMountEffect, usePermission } from "@/shared/hooks"
import { NavBadge } from "@/shared/components/ui/nav-badge"

/**
 * Agenda header badge linking to /prontuario with the count of finalized
 * sessions still missing an evolution note. Hidden when 0 or no permission.
 */
export function PendingNotesBadge() {
  const { canWrite } = usePermission("prontuario")
  const [count, setCount] = useState(0)

  useMountEffect(() => {
    if (!canWrite) return
    void (async () => {
      try {
        const res = await fetch("/api/prontuario/pending?countOnly=true")
        if (res.ok) {
          const data = await res.json()
          if (typeof data.count === "number") setCount(data.count)
        }
      } catch {
        /* badge is non-critical */
      }
    })()
  })

  if (!canWrite || count === 0) return null

  return (
    <Link
      href="/prontuario"
      title={`${count} sessões sem evolução registrada`}
      className="h-10 px-4 rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-all duration-normal active:scale-[0.98] flex items-center gap-2 shadow-sm"
    >
      <FileText className="w-4 h-4" />
      <span className="hidden sm:inline">Prontuário</span>
      <NavBadge label={String(count)} tone="warn" className="" />
    </Link>
  )
}
