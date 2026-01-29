"use client"

import { forwardRef } from "react"
import { PlusIcon } from "./icons"

type FABColor = "primary" | "secondary" | "destructive" | "success" | "info"
type FABSize = "sm" | "md" | "lg"
type FABElevation = "sm" | "md" | "lg" | "xl"

const colorClasses: Record<FABColor, string> = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  success: "bg-success text-success-foreground",
  info: "bg-info text-info-foreground",
}

const sizeClasses: Record<FABSize, { button: string; icon: string }> = {
  sm: { button: "w-10 h-10 min-w-[40px] min-h-[40px]", icon: "w-5 h-5" },
  md: { button: "w-14 h-14 min-w-[56px] min-h-[56px]", icon: "w-6 h-6" },
  lg: { button: "w-16 h-16 min-w-[64px] min-h-[64px]", icon: "w-7 h-7" },
}

const elevationClasses: Record<FABElevation, string> = {
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
  xl: "shadow-xl",
}

const hoverElevationClasses: Record<FABElevation, string> = {
  sm: "hover:shadow-md",
  md: "hover:shadow-lg",
  lg: "hover:shadow-xl",
  xl: "hover:shadow-2xl",
}

interface FABBaseProps {
  onClick?: () => void
  icon?: React.ReactNode
  label: string
  color?: FABColor
  size?: FABSize
  elevation?: FABElevation
  disabled?: boolean
  className?: string
}

interface FABProps extends FABBaseProps {
  extended?: false
}

interface ExtendedFABProps extends FABBaseProps {
  extended: true
}

type FABAllProps = FABProps | ExtendedFABProps

export const FAB = forwardRef<HTMLButtonElement, FABAllProps>(
  (
    {
      onClick,
      icon,
      label,
      color = "primary",
      size = "md",
      elevation = "lg",
      extended = false,
      disabled = false,
      className = "",
    },
    ref
  ) => {
    const colorClass = colorClasses[color]
    const sizeClass = sizeClasses[size]
    const shadowClass = elevationClasses[elevation]
    const hoverShadowClass = hoverElevationClasses[elevation]

    const baseClasses = `
      fixed right-4 bottom-24
      flex items-center justify-center gap-2
      rounded-full
      transition-all duration-normal ease-in-out
      focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
      touch-manipulation
      z-30
      active:scale-95
      disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
    `

    const pressAnimationClasses = `
      active:shadow-md
      [&:not(:disabled)]:hover:opacity-95
    `

    if (extended) {
      return (
        <button
          ref={ref}
          onClick={onClick}
          disabled={disabled}
          className={`
            ${baseClasses}
            ${colorClass}
            ${shadowClass}
            ${hoverShadowClass}
            ${pressAnimationClasses}
            h-14 min-h-[56px] px-4
            ${className}
          `.trim()}
          aria-label={label}
        >
          {icon || <PlusIcon className={sizeClass.icon} />}
          <span className="text-sm font-medium whitespace-nowrap">{label}</span>
        </button>
      )
    }

    return (
      <button
        ref={ref}
        onClick={onClick}
        disabled={disabled}
        className={`
          ${baseClasses}
          ${colorClass}
          ${sizeClass.button}
          ${shadowClass}
          ${hoverShadowClass}
          ${pressAnimationClasses}
          ${className}
        `.trim()}
        aria-label={label}
      >
        {icon || <PlusIcon className={sizeClass.icon} />}
      </button>
    )
  }
)

FAB.displayName = "FAB"
