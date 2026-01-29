"use client"

import { forwardRef, useRef, useCallback } from "react"

type ButtonVariant = "primary" | "secondary" | "outlined" | "text" | "destructive"
type ButtonSize = "sm" | "md" | "lg"

const variantClasses: Record<ButtonVariant, string> = {
  primary: `
    bg-primary text-primary-foreground
    hover:opacity-90
    active:opacity-95
  `,
  secondary: `
    bg-secondary text-secondary-foreground
    hover:bg-gray-200
    active:bg-gray-300
  `,
  outlined: `
    bg-transparent text-foreground
    border-2 border-input
    hover:bg-muted
    active:bg-gray-200
  `,
  text: `
    bg-transparent text-foreground
    hover:bg-muted
    active:bg-gray-200
  `,
  destructive: `
    bg-destructive text-destructive-foreground
    hover:opacity-90
    active:opacity-95
  `,
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm min-w-[64px]",
  md: "h-11 px-4 text-base min-w-[80px]",
  lg: "h-14 px-6 text-lg min-w-[96px]",
}

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
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
      rounded-lg
      font-medium
      transition-all duration-normal ease-in-out
      focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
      touch-manipulation
      overflow-hidden
      select-none
      disabled:opacity-50 disabled:cursor-not-allowed
      active:scale-[0.98]
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
          className="absolute inset-0 overflow-hidden rounded-lg pointer-events-none"
          aria-hidden="true"
        />

        {/* Loading spinner */}
        {loading && (
          <Spinner className={iconSizeClasses[size]} />
        )}

        {/* Left icon (hidden when loading) */}
        {leftIcon && !loading && (
          <span className={iconSizeClasses[size]} aria-hidden="true">
            {leftIcon}
          </span>
        )}

        {/* Button text */}
        <span className={loading && loadingText ? "" : loading ? "opacity-0" : ""}>
          {loading && loadingText ? loadingText : children}
        </span>

        {/* Right icon (hidden when loading) */}
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

// Spinner component for loading state
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
