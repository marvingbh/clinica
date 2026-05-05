import type { CSSProperties } from "react"

export type NavBadgeTone = "brand" | "warn" | "ok" | "neutral"

export interface NavBadgeProps {
  label: string
  tone: NavBadgeTone
  /** Layout override; default `ml-auto` matches the sidebar nav. */
  className?: string
  style?: CSSProperties
}

const toneClass: Record<NavBadgeTone, string> = {
  brand: "bg-brand-50 text-brand-700 border border-brand-100",
  warn: "bg-warn-50 text-warn-700 border border-warn-100",
  ok: "bg-ok-50 text-ok-700 border border-ok-100",
  neutral: "bg-ink-100 text-ink-700 border border-ink-200",
}

/**
 * Pill-shaped count badge for nav items. Shared between the sidebar and
 * the desktop header so the tone palette stays in one place.
 */
export function NavBadge({ label, tone, className, style }: NavBadgeProps) {
  return (
    <span
      style={style}
      className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium tracking-wide ${toneClass[tone]} ${className ?? "ml-auto"}`}
    >
      {label}
    </span>
  )
}
