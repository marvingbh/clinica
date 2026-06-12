"use client"

import { usePendingBookingCount } from "@/shared/hooks"
import { NavBadge } from "@/shared/components/ui/nav-badge"

/**
 * Count badge for the "Solicitações" nav item. Renders nothing while loading
 * or when there are no pending booking requests. Gated to online_booking WRITE
 * via the hook.
 */
export function PendingBookingBadge({ className }: { className?: string }) {
  const { count, isLoading } = usePendingBookingCount()
  if (isLoading || count === 0) return null
  return <NavBadge label={String(count)} tone="brand" className={className} />
}
