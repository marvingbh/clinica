"use client"

// eslint-disable-next-line no-restricted-imports
import { useEffect, useRef, useState } from "react"
import { usePermission } from "./usePermission"

const REFRESH_INTERVAL_MS = 60_000
const MIN_REFETCH_GAP_MS = 5_000

export interface PendingBookingState {
  count: number
  isLoading: boolean
}

export type PendingBookingFetchResult =
  | { kind: "ok"; count: number }
  | { kind: "unauthorized" }
  | { kind: "error" }

/**
 * Pure helper — exported for unit tests. Calls the booking pending-count
 * endpoint and normalizes the outcomes the hook cares about. Mirrors
 * fetchPendingIntakeCount.
 */
export async function fetchPendingBookingCount(): Promise<PendingBookingFetchResult> {
  try {
    const res = await fetch("/api/booking-requests/pending-count")
    if (res.status === 401) return { kind: "unauthorized" }
    if (!res.ok) return { kind: "error" }
    const data = (await res.json()) as { count?: unknown }
    if (typeof data.count !== "number") return { kind: "error" }
    return { kind: "ok", count: data.count }
  } catch {
    return { kind: "error" }
  }
}

/**
 * Polls /api/booking-requests/pending-count and exposes the result.
 * Gated to users with online_booking WRITE. Mirrors usePendingIntakeCount.
 */
export function usePendingBookingCount(): PendingBookingState {
  const { canWrite } = usePermission("online_booking")
  const [state, setState] = useState<PendingBookingState>({ count: 0, isLoading: true })
  const lastFetchAtRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!canWrite) {
      setState({ count: 0, isLoading: false })
      return
    }

    let cancelled = false

    function clearPolling() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    async function poll() {
      const now = Date.now()
      if (now - lastFetchAtRef.current < MIN_REFETCH_GAP_MS) return
      lastFetchAtRef.current = now

      const result = await fetchPendingBookingCount()
      if (cancelled) return

      if (result.kind === "ok") {
        setState({ count: result.count, isLoading: false })
      } else if (result.kind === "unauthorized") {
        setState({ count: 0, isLoading: false })
        clearPolling()
      }
      // result.kind === "error": keep the last good count.
    }

    poll()
    intervalRef.current = setInterval(poll, REFRESH_INTERVAL_MS)

    function onVisibility() {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      clearPolling()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [canWrite])

  return state
}
