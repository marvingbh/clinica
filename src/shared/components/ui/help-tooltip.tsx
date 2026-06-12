"use client"

import { useState, type ReactNode } from "react"
import { HelpCircle } from "lucide-react"

interface HelpTooltipProps {
  /** Accessible name for the trigger button (e.g. "O que significam os formatos?"). */
  label: string
  children: ReactNode
  className?: string
  /** Which edge the panel anchors to. Use "right" when the icon sits near the
   *  right edge so the panel opens leftward and does not overflow. */
  align?: "left" | "right"
}

/**
 * A small "?" help affordance. Reveals its content on mouse hover, on keyboard
 * focus (Tab), and on click (touch). No useEffect — purely event-driven state.
 */
export function HelpTooltip({ label, children, className, align = "left" }: HelpTooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        aria-label={label}
        className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-3 text-left text-xs font-normal leading-relaxed text-popover-foreground shadow-md ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  )
}
