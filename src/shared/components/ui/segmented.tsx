"use client"

/* Chip-group segmented control — the "quiet" pattern for setting toggles
   that sit alongside input fields. Borderless pills with a soft ink-100
   inactive background and brand-50 + inset brand ring for the active
   state. Sits lower in the visual hierarchy than proper Inputs so it
   doesn't compete for attention in dense forms. */

type SegmentedSize = "sm" | "md"

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: SegmentedSize
  ariaLabel?: string
  className?: string
}

const sizeClasses: Record<SegmentedSize, string> = {
  sm: "h-7 px-3 text-[12px]",
  md: "h-8 px-3.5 text-[13px]",
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  ariaLabel,
  className = "",
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex flex-wrap gap-1 ${className}`.trim()}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-pressed={active}
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            className={`
              ${sizeClasses[size]}
              inline-flex items-center gap-1.5 rounded-full
              font-medium leading-none whitespace-nowrap
              transition-colors duration-[120ms] ease-out
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                active
                  ? "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100"
                  : "bg-ink-100/60 text-ink-600 hover:bg-ink-100 hover:text-ink-800"
              }
            `}
          >
            {opt.icon && <span className="inline-flex shrink-0">{opt.icon}</span>}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* Helper for the inline "overline label + chip group" row used across
   appointment forms. Keeps Modalidade / Frequência / Terminar visually
   consistent and lets multiple ChipFields share a single row. */
export function ChipField({
  label,
  children,
  className = "",
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center flex-wrap gap-2 ${className}`.trim()}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </span>
      {children}
    </div>
  )
}
