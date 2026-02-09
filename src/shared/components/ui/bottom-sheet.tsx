"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { createPortal } from "react-dom"

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  showHandle?: boolean
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  showHandle = true,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef<number | null>(null)
  const touchCurrentY = useRef<number | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }

    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  // Handle swipe down to close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (touchStartY.current === null || touchCurrentY.current === null) return

    const diff = touchCurrentY.current - touchStartY.current
    const threshold = 100

    if (diff > threshold) {
      onClose()
    }

    touchStartY.current = null
    touchCurrentY.current = null
  }, [onClose])

  if (!isOpen || !mounted) return null

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet Container - centered on larger screens */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center">
        {/* Sheet - full width on mobile, max-width on larger screens */}
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? "sheet-title" : undefined}
          className="w-full max-w-4xl bg-background rounded-t-2xl shadow-xl max-h-[90vh] overflow-hidden animate-slide-up"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
        {/* Handle */}
        {showHandle && (
          <div className="sticky top-0 bg-background pt-3 pb-2 px-4 border-b border-border z-10">
            <div
              className="w-10 h-1 bg-muted rounded-full mx-auto mb-3 cursor-grab active:cursor-grabbing"
              aria-hidden="true"
            />
            {title && (
              <div className="flex items-center justify-between">
                <h2
                  id="sheet-title"
                  className="text-xl font-semibold text-foreground"
                >
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Fechar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-60px)] overscroll-contain">
          {children}
        </div>
        </div>
      </div>

      {/* Styles */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </>
  )

  // Render in portal to escape any CSS containment
  return createPortal(content, document.body)
}

interface BottomSheetActionProps {
  icon?: React.ReactNode
  label: string
  description?: string
  onClick: () => void
  variant?: "default" | "destructive"
}

export function BottomSheetAction({
  icon,
  label,
  description,
  onClick,
  variant = "default",
}: BottomSheetActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-4 py-4 min-h-[56px] text-left transition-colors touch-manipulation ${
        variant === "destructive"
          ? "text-destructive hover:bg-destructive/10 active:bg-destructive/20"
          : "text-foreground hover:bg-muted active:bg-muted/80"
      }`}
    >
      {icon && (
        <div className={`flex-shrink-0 ${variant === "destructive" ? "text-destructive" : "text-muted-foreground"}`}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium">{label}</p>
        {description && (
          <p className="text-sm text-muted-foreground truncate">{description}</p>
        )}
      </div>
    </button>
  )
}

export function BottomSheetDivider() {
  return <div className="h-px bg-border mx-4" />
}
