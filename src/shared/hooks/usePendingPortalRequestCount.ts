"use client"

// eslint-disable-next-line no-restricted-imports
import { useEffect, useRef, useState } from "react"
import { usePermission } from "./usePermission"

const REFRESH_INTERVAL_MS = 60_000
const MIN_REFETCH_GAP_MS = 5_000

export interface PendingPortalRequestState {
  count: number
  isLoading: boolean
}

export type PendingPortalRequestFetchResult =
  | { kind: "ok"; count: number }
  | { kind: "unauthorized" }
  | { kind: "error" }

/** Pure helper (exported for tests). Mirrors fetchPendingBookingCount. */
export async function fetchPendingPortalRequestCount(): Promise<PendingPortalRequestFetchResult> {
  try {
    const res = await fetch("/api/portal-requests/pending-count")
    if (res.status === 401 || res.status === 403) return { kind: "unauthorized" }
    if (!res.ok) return { kind: "error" }
    const data = (await res.json()) as { count?: unknown }
    if (typeof data.count !== "number") return { kind: "error" }
    return { kind: "ok", count: data.count }
  } catch {
    return { kind: "error" }
  }
}

/**
 * Polls /api/portal-requests/pending-count for the portal-requests banner.
 * Gated to users with patients READ; the endpoint itself audience-scopes the
 * count (admin = all, professional = own related). Mirrors usePendingBookingCount.
 */
export function usePendingPortalRequestCount(): PendingPortalRequestState {
  const { canRead } = usePermission("patients")
  const [state, setState] = useState<PendingPortalRequestState>({ count: 0, isLoading: true })
  const lastFetchAtRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!canRead) {
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

      const result = await fetchPendingPortalRequestCount()
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
  }, [canRead])

  return state
}
