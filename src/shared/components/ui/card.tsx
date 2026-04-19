"use client"

import { forwardRef } from "react"

/* Matches `.panel` / `.demo` in the design system — 8px radius,
   ink-200 border, ink-0 surface, subtle shadow. */

type Elevation = "none" | "sm" | "md" | "lg" | "xl"

const elevationClasses: Record<Elevation, string> = {
  none: "",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
  xl: "shadow-xl",
}

const hoverElevationClasses: Record<Elevation, string> = {
  none: "hover:shadow-sm",
  sm: "hover:shadow-md",
  md: "hover:shadow-lg",
  lg: "hover:shadow-xl",
  xl: "hover:shadow-2xl",
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation
  hoverable?: boolean
  children: React.ReactNode
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    { elevation = "none", hoverable = false, className = "", children, ...props },
    ref
  ) => {
    const hasBgOverride = className.includes("bg-")
    const baseClasses = `${hasBgOverride ? "" : "bg-card "}text-card-foreground rounded-lg border border-ink-200`
    const shadowClass = elevationClasses[elevation]
    const hoverClass = hoverable ? hoverElevationClasses[elevation] : ""
    const transitionClass = hoverable
      ? "transition-shadow duration-[120ms] ease-out"
      : ""

    return (
      <div
        ref={ref}
        className={`${baseClasses} ${shadowClass} ${hoverClass} ${transitionClass} ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = "Card"

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-ink-200 ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    )
  }
)

CardHeader.displayName = "CardHeader"

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ as: Tag = "h3", className = "", children, ...props }, ref) => {
    return (
      <Tag
        ref={ref}
        className={`text-sm font-semibold text-ink-900 leading-tight ${className}`.trim()}
        {...props}
      >
        {children}
      </Tag>
    )
  }
)

CardTitle.displayName = "CardTitle"

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode
}

export const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={`text-[13px] text-ink-500 mt-1 ${className}`.trim()}
        {...props}
      >
        {children}
      </p>
    )
  }
)

CardDescription.displayName = "CardDescription"

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`px-5 py-4 ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    )
  }
)

CardContent.displayName = "CardContent"

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className = "", children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`px-5 py-4 border-t border-ink-200 ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    )
  }
)

CardFooter.displayName = "CardFooter"
