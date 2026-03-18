"use client"

import { useState } from "react"
import { useMountEffect } from "./useMountEffect"

/**
 * Returns true after the component has mounted on the client.
 * Use for portal hydration safety — skip rendering portals on the server.
 */
export function useHasMounted() {
  const [mounted, setMounted] = useState(false)
  useMountEffect(() => {
    setMounted(true)
  })
  return mounted
}
