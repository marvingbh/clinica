"use client"

// eslint-disable-next-line no-restricted-imports
import { useEffect, useRef, useState } from "react"
import { usePermission } from "./usePermission"

const REFRESH_INTERVAL_MS = 60_000
const MIN_REFETCH_GAP_MS = 5_000

export interface PendingIntakeState {
  count: number
  isLoading: boolean
}

export type PendingIntakeFetchResult =
  | { kind: "ok"; count: number }
  | { kind: "unauthorized" }
  | { kind: "error" }

/**
 * Pure helper — exported for unit tests. Calls the count endpoint and
 * normalizes the outcomes the hook cares about. Network/parse errors and
 * non-2xx responses (other than 401) collapse into `error`, which the
 * hook treats as "keep the last good count".
 */
export async function fetchPendingIntakeCount(): Promise<PendingIntakeFetchResult> {
  try {
    const res = await fetch("/api/intake-submissions/pending-count")
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
 * Polls /api/intake-submissions/pending-count and exposes the result.
 *
 * - Gated to users with `patients` WRITE — readers never trigger a fetch.
 * - Refetches every 60s and on tab focus (debounced 5s).
 * - On transient error keeps the last good count so the banner doesn't
 *   blink off; on 401 zeroes the count and stops polling so the banner
 *   doesn't linger after the session expires.
 */
export function usePendingIntakeCount(): PendingIntakeState {
  const { canWrite } = usePermission("patients")
  const [state, setState] = useState<PendingIntakeState>({ count: 0, isLoading: true })
  const lastFetchAtRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Depends on `canWrite` so the effect re-runs when the session finishes
  // loading and the user is found to have WRITE — without this, we'd lock in
  // the initial `canWrite=false` from the loading-session render and never
  // start polling.
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

      const result = await fetchPendingIntakeCount()
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
