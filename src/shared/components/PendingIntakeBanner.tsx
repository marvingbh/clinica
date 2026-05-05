"use client"

import Link from "next/link"
import { Inbox } from "lucide-react"
import { usePendingIntake } from "./PendingIntakeProvider"

/**
 * Persistent banner that surfaces pending intake submissions. Mirrors
 * SubscriptionBanner's layout/palette. Disappears automatically when the
 * count hits 0 — there's no manual dismiss.
 */
export function PendingIntakeBanner() {
  const { count, isLoading } = usePendingIntake()
  if (isLoading || count === 0) return null

  const message =
    count === 1
      ? "Há 1 ficha de cadastro pendente"
      : `Há ${count} fichas de cadastro pendentes`

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b px-4 py-2 text-sm flex items-center gap-2 bg-yellow-50 border-yellow-200 text-yellow-800"
    >
      <Inbox className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <Link
        href="/patients?tab=fichas"
        className="font-medium underline hover:no-underline shrink-0"
      >
        Revisar
      </Link>
    </div>
  )
}
