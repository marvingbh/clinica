"use client"

import { useEffect } from "react"

/**
 * One-time effect that runs on mount only.
 * Use for DOM integration, third-party widgets, or browser API subscriptions.
 */
export function useMountEffect(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, [])
}
