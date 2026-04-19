"use client"

import { forwardRef, useRef, useCallback } from "react"

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outlined"
  | "text"
  | "destructive"
  | "ghost"
  | "success"
type ButtonSize = "sm" | "md" | "lg"

/* Colors, hover, and borders mirror the Clinica design system
   (buttons spec in components.css from the handoff bundle). Radius is
   the conservative 4px (`rounded`) set by --r-sm. */
const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-brand-500 text-white border border-brand-500
    hover:bg-brand-600 hover:border-brand-600
    active:bg-brand-700 active:border-brand-700
  `,
  secondary: `
    bg-card text-ink-800 border border-ink-300
    hover:bg-ink-50 hover:border-ink-400
    active:bg-ink-100
  `,
  outlined: `
    bg-transparent text-foreground border border-input
    hover:bg-ink-50
    active:bg-ink-100
  `,
  text: `
    bg-transparent text-ink-700 border border-transparent
    hover:bg-ink-100 hover:text-ink-900
    active:bg-ink-200
  `,
  ghost: `
    bg-transparent text-ink-700 border border-transparent
    hover:bg-ink-100 hover:text-ink-900
    active:bg-ink-200
  `,
  destructive: `
    bg-err-500 text-white border border-err-500
    hover:bg-err-700 hover:border-err-700
    active:bg-err-700
  `,
  success: `
    bg-ok-500 text-white border border-ok-500
    hover:bg-ok-700 hover:border-ok-700
    active:bg-ok-700
  `,
}

/* Mobile-first sizing: taps stay >=44px on phones, tightens on md+
   to the design system's 28/36/44 spec. */
const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-10 md:h-7 px-3 text-xs min-w-[56px]",
  md: "h-11 md:h-9 px-3.5 text-[13px] min-w-[72px]",
  lg: "h-12 md:h-11 px-[18px] text-sm min-w-[88px]",
}

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-4 h-4",
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  disableRipple?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disableRipple = false,
      disabled,
      className = "",
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const buttonRef = useRef<HTMLButtonElement | null>(null)
    const rippleContainerRef = useRef<HTMLSpanElement>(null)

    const createRipple = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (disableRipple || disabled || loading) return

        const button = buttonRef.current
        const container = rippleContainerRef.current
        if (!button || !container) return

        const rect = button.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height)
        const x = event.clientX - rect.left - size / 2
        const y = event.clientY - rect.top - size / 2

        const ripple = document.createElement("span")
        ripple.style.width = ripple.style.height = `${size}px`
        ripple.style.left = `${x}px`
        ripple.style.top = `${y}px`
        ripple.className = `
          absolute rounded-full
          bg-current opacity-20
          animate-ripple
          pointer-events-none
        `

        container.appendChild(ripple)

        ripple.addEventListener("animationend", () => {
          ripple.remove()
        })
      },
      [disableRipple, disabled, loading]
    )

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      createRipple(event)
      onClick?.(event)
    }

    const setRefs = useCallback(
      (element: HTMLButtonElement | null) => {
        buttonRef.current = element
        if (typeof ref === "function") {
          ref(element)
        } else if (ref) {
          ref.current = element
        }
      },
      [ref]
    )

    const isDisabled = disabled || loading

    const baseClasses = `
      relative
      inline-flex items-center justify-center gap-2
      rounded-md
      font-medium leading-none tracking-normal
      transition-colors duration-[120ms] ease-out
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/25
      touch-manipulation
      overflow-hidden
      select-none
      disabled:opacity-50 disabled:cursor-not-allowed
      active:scale-[0.99]
      disabled:active:scale-100
    `

    return (
      <button
        ref={setRefs}
        disabled={isDisabled}
        onClick={handleClick}
        className={`
          ${baseClasses}
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${fullWidth ? "w-full" : ""}
          ${className}
        `.trim()}
        aria-busy={loading}
        aria-disabled={isDisabled}
        {...props}
      >
        {/* Ripple container */}
        <span
          ref={rippleContainerRef}
          className="absolute inset-0 overflow-hidden rounded-md pointer-events-none"
          aria-hidden="true"
        />

        {loading && <Spinner className={iconSizeClasses[size]} />}

        {leftIcon && !loading && (
          <span className={iconSizeClasses[size]} aria-hidden="true">
            {leftIcon}
          </span>
        )}

        <span className={loading && loadingText ? "" : loading ? "opacity-0" : ""}>
          {loading && loadingText ? loadingText : children}
        </span>

        {rightIcon && !loading && (
          <span className={iconSizeClasses[size]} aria-hidden="true">
            {rightIcon}
          </span>
        )}
      </button>
    )
  }
)

Button.displayName = "Button"

interface SpinnerProps {
  className?: string
}

const Spinner = ({ className = "" }: SpinnerProps) => (
  <svg
    className={`animate-spin ${className}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

export { Spinner }
