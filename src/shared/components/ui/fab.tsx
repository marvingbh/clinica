"use client"

import { forwardRef } from "react"

interface FABProps {
  onClick: () => void
  icon?: React.ReactNode
  label: string
  className?: string
}

export const FAB = forwardRef<HTMLButtonElement, FABProps>(
  ({ onClick, icon, label, className = "" }, ref) => {
    return (
      <button
        ref={ref}
        onClick={onClick}
        className={`fixed right-4 bottom-24 w-14 h-14 min-w-[56px] min-h-[56px] rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-all z-30 flex items-center justify-center touch-manipulation ${className}`}
        aria-label={label}
      >
        {icon || (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        )}
      </button>
    )
  }
)

FAB.displayName = "FAB"
