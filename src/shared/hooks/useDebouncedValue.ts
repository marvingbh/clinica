"use client"


import { useState, useEffect } from "react"

/**
 * Returns a debounced version of the given value.
 * The returned value only updates after `delay` ms of inactivity.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  // Value sync: updates debounced value after delay when input changes.
  
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
