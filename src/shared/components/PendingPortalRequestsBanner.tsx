"use client"

import Link from "next/link"
import { CalendarClock } from "lucide-react"
import { usePendingPortalRequestCount } from "@/shared/hooks"

/**
 * Persistent banner for pending portal requests (reschedule / data update /
 * LGPD). Mirrors PendingIntakeBanner. The count is audience-scoped server-side:
 * admins see all, a professional sees only requests related to them. Disappears
 * when the count hits 0.
 */
export function PendingPortalRequestsBanner() {
  const { count, isLoading } = usePendingPortalRequestCount()
  if (isLoading || count === 0) return null

  const message =
    count === 1
      ? "Há 1 solicitação do portal do paciente pendente"
      : `Há ${count} solicitações do portal do paciente pendentes`

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b px-4 py-2 text-sm flex items-center gap-2 bg-yellow-50 border-yellow-200 text-yellow-800"
    >
      <CalendarClock className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <Link
        href="/patients?tab=solicitacoes"
        className="font-medium underline hover:no-underline shrink-0"
      >
        Revisar
      </Link>
    </div>
  )
}
