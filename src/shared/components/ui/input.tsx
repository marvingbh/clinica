"use client"

import { forwardRef, useId } from "react"
import { AlertCircleIcon } from "./icons"

type InputVariant = "default" | "floating"
type InputSize = "sm" | "md" | "lg"

/* Design system spec (components.css):
   - md (default) = 36px tall on desktop / 44px on mobile for tap targets
   - 4px radius, ink-300 border, ink-400 placeholder
   - hover: ink-400 border; focus: brand-500 border + 3px brand ring
   - error: err-500 border; helper/hint: ink-500
   The `floating` variant is kept for backward compatibility with existing
   callers but renders a standard top label + input pair per the spec. */
const sizeClasses: Record<InputSize, string> = {
  sm: "h-10 md:h-8 px-3 text-[13px]",
  md: "h-11 md:h-9 px-3 text-[13px]",
  lg: "h-12 md:h-11 px-3.5 text-sm",
}

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: string
  variant?: InputVariant
  inputSize?: InputSize
  error?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  prefix?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      inputSize = "md",
      error,
      helperText,
      leftIcon,
      rightIcon,
      prefix,
      className = "",
      disabled,
      required,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const inputId = id || generatedId

    const baseInputClasses = `
      w-full rounded-[4px] border bg-card text-ink-900
      placeholder:text-ink-400
      transition-[border-color,box-shadow] duration-[120ms] ease-out
      focus:outline-none
      disabled:bg-ink-100 disabled:text-ink-500 disabled:cursor-not-allowed
    `

    const borderClasses = error
      ? "border-err-500 hover:border-err-500 focus:border-err-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.22)]"
      : "border-ink-300 hover:border-ink-400 focus:border-brand-500 focus:shadow-[var(--shadow-focus)]"

    const paddingClasses = `
      ${leftIcon ? "pl-9" : ""}
      ${rightIcon ? "pr-9" : ""}
    `

    const wrappedInput = (
      <div className={`relative ${prefix ? "flex" : ""}`}>
        {prefix && (
          <span className="inline-flex items-center gap-1 rounded-l-[4px] border border-r-0 border-ink-300 bg-ink-100 px-2.5 text-[12px] text-ink-600 font-mono whitespace-nowrap">
            {prefix}
          </span>
        )}
        {leftIcon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none flex">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          className={`
            ${baseInputClasses}
            ${sizeClasses[inputSize]}
            ${borderClasses}
            ${paddingClasses}
            ${prefix ? "rounded-l-none" : ""}
          `.trim()}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={
            error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none flex">
            {rightIcon}
          </span>
        )}
      </div>
    )

    return (
      <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-[12px] font-medium text-ink-700"
          >
            {label}
            {required && <span className="text-err-500 ml-0.5">*</span>}
          </label>
        )}
        {wrappedInput}
        {error && (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="flex items-center gap-1 text-[12px] text-err-700"
          >
            <AlertCircleIcon className="w-3 h-3" strokeWidth={2} />
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="text-[12px] text-ink-500">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"
