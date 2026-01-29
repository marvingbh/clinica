"use client"

import { useRef, useCallback } from "react"

interface SwipeContainerProps {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
  children: React.ReactNode
  className?: string
}

export function SwipeContainer({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  children,
  className = "",
}: SwipeContainerProps) {
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const touchEndY = useRef<number | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
    touchEndY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (
      touchStartX.current === null ||
      touchStartY.current === null ||
      touchEndX.current === null ||
      touchEndY.current === null
    ) {
      return
    }

    const diffX = touchStartX.current - touchEndX.current
    const diffY = touchStartY.current - touchEndY.current

    // Only trigger horizontal swipe if horizontal movement is greater than vertical
    // This prevents accidental swipes during scrolling
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
      if (diffX > 0 && onSwipeLeft) {
        onSwipeLeft()
      } else if (diffX < 0 && onSwipeRight) {
        onSwipeRight()
      }
    }

    // Reset values
    touchStartX.current = null
    touchStartY.current = null
    touchEndX.current = null
    touchEndY.current = null
  }, [onSwipeLeft, onSwipeRight, threshold])

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`touch-pan-y ${className}`}
    >
      {children}
    </div>
  )
}
