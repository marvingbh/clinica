import { forwardRef } from "react"

/* Matches `.avatar` in components.css:
   28px default circular avatar on brand-100 bg with brand-200 ring.
   Sizes small / default / large. Supports stacking via a parent flex
   container and the `-ml-2 ring-2 ring-card` technique used in the spec. */

type AvatarSize = "sm" | "md" | "lg"

const sizeClasses: Record<AvatarSize, string> = {
  sm: "w-[22px] h-[22px] text-[10px]",
  md: "w-7 h-7 text-[11px]",
  lg: "w-9 h-9 text-[13px]",
}

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  initials?: string
  name?: string
  size?: AvatarSize
  src?: string
  alt?: string
}

function computeInitials(name?: string): string {
  if (!name) return "?"
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  (
    { initials, name, size = "md", src, alt, className = "", children, ...props },
    ref
  ) => {
    const label = initials ?? computeInitials(name)
    return (
      <span
        ref={ref}
        aria-label={alt ?? name}
        className={`
          inline-grid place-items-center flex-shrink-0
          rounded-full bg-brand-100 text-brand-700 border border-brand-200
          font-semibold overflow-hidden
          ${sizeClasses[size]}
          ${className}
        `.trim()}
        {...props}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt ?? name ?? ""} className="w-full h-full object-cover" />
        ) : (
          children ?? label
        )}
      </span>
    )
  }
)

Avatar.displayName = "Avatar"

export function AvatarStack({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`inline-flex ${className}`}>
      {/* Each nested Avatar shifts left and gets a card-colored ring so
          the stacking looks intentional on any background. */}
      <style>{`.avatar-stack-inner > span + span { margin-left: -8px; box-shadow: 0 0 0 2px var(--card); }`}</style>
      <div className="avatar-stack-inner inline-flex">{children}</div>
    </div>
  )
}
