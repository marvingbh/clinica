/**
 * Error-aware fetch wrapper with automatic error classification and retry logic
 */

import { useState, useEffect } from 'react'
import { classifyAgendaError, AgendaError, getRetryDelay, shouldAutoRetry } from "./agenda-errors"

interface FetchOptions extends RequestInit {
  timeout?: number
  maxRetries?: number
  retryDelay?: (attempt: number) => number
}

interface FetchResult<T> {
  data?: T
  error?: AgendaError
}

/**
 * Enhanced fetch with automatic error classification, timeouts, and retry logic
 */
export async function fetchWithClassification<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult<T>> {
  const {
    timeout = 10000, // 10s default timeout
    maxRetries = 0, // No auto-retry by default
    retryDelay = getRetryDelay,
    ...fetchOptions
  } = options

  const isOnline = navigator.onLine ?? true
  let lastError: AgendaError | undefined

  // Try main request + retries
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        // Success case
        if (response.ok) {
          const data = await response.json()
          return { data }
        }

        // HTTP error response
        const error = classifyAgendaError({
          error: new Error(`HTTP ${response.status}`),
          response,
          isOnline,
          endpoint: url,
          timeoutMs: timeout
        })

        // Don't retry non-retryable errors
        if (!shouldAutoRetry(error)) {
          return { error }
        }

        lastError = error
      } catch (fetchError) {
        clearTimeout(timeoutId)

        const error = classifyAgendaError({
          error: fetchError as Error,
          isOnline,
          endpoint: url,
          timeoutMs: timeout
        })

        // Don't retry non-retryable errors
        if (!shouldAutoRetry(error)) {
          return { error }
        }

        lastError = error
      }

      // Wait before retry (except on last attempt)
      if (attempt <= maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay(attempt)))
      }

    } catch (error) {
      // Unexpected error during retry logic
      const classifiedError = classifyAgendaError({
        error: error as Error,
        isOnline,
        endpoint: url
      })
      return { error: classifiedError }
    }
  }

  // All retries exhausted
  return {
    error: {
      ...lastError!,
      retryAttempt: maxRetries + 1,
      maxRetries
    }
  }
}

/**
 * Batch fetch multiple endpoints and track partial failures
 */
export async function fetchMultipleWithClassification<T = any>(
  requests: Array<{ url: string; options?: FetchOptions }>
): Promise<{
  results: Array<FetchResult<T>>
  hasPartialFailure: boolean
  hasCompleteFailure: boolean
  successfulEndpoints: string[]
  failedEndpoints: string[]
}> {
  const results = await Promise.all(
    requests.map(({ url, options }) =>
      fetchWithClassification<T>(url, options)
    )
  )

  const successfulEndpoints: string[] = []
  const failedEndpoints: string[] = []

  requests.forEach((request, index) => {
    const result = results[index]
    if (result.error) {
      failedEndpoints.push(request.url)
    } else {
      successfulEndpoints.push(request.url)
    }
  })

  const hasPartialFailure = failedEndpoints.length > 0 && successfulEndpoints.length > 0
  const hasCompleteFailure = failedEndpoints.length === requests.length

  return {
    results,
    hasPartialFailure,
    hasCompleteFailure,
    successfulEndpoints,
    failedEndpoints
  }
}

/**
 * Network status hook for automatic retry on reconnection
 */
export function useNetworkStatus(): {
  isOnline: boolean
  wasOffline: boolean
  clearWasOffline: () => void
} {
  const [isOnline, setIsOnline] = useState(navigator.onLine ?? true)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      // Keep wasOffline flag for auto-retry trigger
    }

    const handleOffline = () => {
      setIsOnline(false)
      setWasOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const clearWasOffline = () => setWasOffline(false)

  return {
    isOnline,
    wasOffline,
    clearWasOffline
  }
}