import { TrendingUpIcon } from "./icons"
import { TrendingDown } from "lucide-react"

/* Matches `.kpi` in dashboard.css — an ink-0 card with
   overline label, 26px tabular-num value, and up/down delta row. */

type Direction = "up" | "down" | "flat"

export interface KPIProps {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  delta?: {
    direction: Direction
    /** Good state highlights in green even when trending down (e.g. no-shows). */
    intent?: "good" | "bad" | "auto"
    value: string
    sub?: string
  }
  className?: string
}

export function KPI({ label, value, icon, delta, className = "" }: KPIProps) {
  const deltaTone = (() => {
    if (!delta) return ""
    if (delta.intent === "good") return "text-ok-700"
    if (delta.intent === "bad") return "text-err-700"
    return delta.direction === "up" ? "text-ok-700" : "text-err-700"
  })()

  return (
    <div
      className={`bg-card border border-ink-200 rounded-lg px-5 py-4 ${className}`}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {icon && <span className="w-3 h-3 inline-flex">{icon}</span>}
        {label}
      </div>
      <div className="mt-2 text-[26px] font-semibold text-ink-900 leading-tight tracking-tight tabular-nums">
        {value}
      </div>
      {delta && (
        <div
          className={`mt-1.5 inline-flex items-center gap-1 text-[12px] font-mono ${deltaTone}`}
        >
          {delta.direction === "up" ? (
            <TrendingUpIcon className="w-3 h-3" strokeWidth={2} />
          ) : delta.direction === "down" ? (
            <TrendingDown className="w-3 h-3" strokeWidth={2} />
          ) : null}
          {delta.value}
          {delta.sub && (
            <span className="text-ink-500 font-sans">{delta.sub}</span>
          )}
        </div>
      )}
    </div>
  )
}

export function KPIGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
      {children}
    </div>
  )
}
