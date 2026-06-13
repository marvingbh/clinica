"use client"

import { useState } from "react"
import { useMountEffect } from "@/shared/hooks"

export interface ReportState<T> {
  data: T | null
  loading: boolean
  error: boolean
}

/**
 * One fetch per mount. Combined with a `key` on the tab component that includes
 * every filter, a filter change unmounts/remounts the tab and triggers a fresh
 * fetch — no useEffect dependency choreography (project rule).
 */
export function useReport<T>(url: string): ReportState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useMountEffect(() => {
    let cancelled = false
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  })

  return { data, loading, error }
}
