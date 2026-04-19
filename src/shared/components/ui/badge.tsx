import { forwardRef } from "react"

/* Matches `.badge-*` in components.css:
   20px pill, 8px horizontal padding, 11px font, optional colored dot. */

type BadgeTone = "neutral" | "brand" | "ok" | "warn" | "err"

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-700 border-ink-200",
  brand: "bg-brand-50 text-brand-700 border-brand-100",
  ok: "bg-ok-50 text-ok-700 border-ok-100",
  warn: "bg-warn-50 text-warn-700 border-warn-100",
  err: "bg-err-50 text-err-700 border-err-100",
}

const dotClasses: Record<BadgeTone, string> = {
  neutral: "bg-ink-500",
  brand: "bg-brand-500",
  ok: "bg-ok-500",
  warn: "bg-warn-500",
  err: "bg-err-500",
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  dot?: boolean
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ tone = "neutral", dot = false, className = "", children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={`
          inline-flex items-center gap-1 h-5 px-2
          rounded-full border
          text-[11px] font-medium tracking-wide whitespace-nowrap
          ${toneClasses[tone]}
          ${className}
        `.trim()}
        {...props}
      >
        {dot && (
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full ${dotClasses[tone]}`}
          />
        )}
        {children}
      </span>
    )
  }
)

Badge.displayName = "Badge"
