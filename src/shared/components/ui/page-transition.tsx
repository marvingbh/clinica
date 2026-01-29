"use client"

import { useRef, useLayoutEffect } from "react"
import { usePathname } from "next/navigation"

interface PageTransitionProps {
  children: React.ReactNode
}

/**
 * PageTransition wraps page content and provides smooth fade-slide animations
 * when navigating between routes.
 *
 * Uses design tokens for consistent animation timing and respects
 * reduced-motion preferences via CSS.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const containerRef = useRef<HTMLDivElement>(null)
  const previousPathname = useRef(pathname)
  const isFirstRender = useRef(true)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Skip animation on initial mount
    if (isFirstRender.current) {
      isFirstRender.current = false
      previousPathname.current = pathname
      return
    }

    // Only animate when pathname changes
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname

      // Remove existing animation class and force reflow
      container.classList.remove("page-transition-enter")
      // Force reflow to restart animation
      void container.offsetWidth
      // Add animation class
      container.classList.add("page-transition-enter")
    }
  }, [pathname])

  return (
    <div ref={containerRef} className="page-transition">
      {children}
    </div>
  )
}
