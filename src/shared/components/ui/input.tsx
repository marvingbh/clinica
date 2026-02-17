"use client"

import { forwardRef, useState, useId, useRef, useCallback, useEffect } from "react"

type InputVariant = "default" | "floating"
type InputSize = "sm" | "md" | "lg"

const sizeClasses: Record<InputSize, { input: string; label: string; labelFloat: string }> = {
  sm: {
    input: "h-10 px-3 text-sm",
    label: "text-sm left-3",
    labelFloat: "text-xs -top-2 left-2 px-1",
  },
  md: {
    input: "h-12 px-4 text-base",
    label: "text-base left-4",
    labelFloat: "text-xs -top-2 left-3 px-1",
  },
  lg: {
    input: "h-14 px-4 text-lg",
    label: "text-base left-4",
    labelFloat: "text-xs -top-2 left-3 px-1",
  },
}

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string
  variant?: InputVariant
  inputSize?: InputSize
  error?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      variant = "floating",
      inputSize = "md",
      error,
      helperText,
      leftIcon,
      rightIcon,
      className = "",
      disabled,
      required,
      id,
      value,
      defaultValue,
      placeholder,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const inputId = id || generatedId
    const internalRef = useRef<HTMLInputElement>(null)
    const [isFocused, setIsFocused] = useState(false)
    const [hasValue, setHasValue] = useState(
      Boolean(value || defaultValue || placeholder)
    )

    const setRefs = useCallback((node: HTMLInputElement | null) => {
      internalRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node
    }, [ref])

    // Sync hasValue with actual DOM value (handles react-hook-form reset() which sets values via ref)
    useEffect(() => {
      const node = internalRef.current
      if (node) {
        const hasActualValue = Boolean(node.value)
        if (hasActualValue !== hasValue) {
          setHasValue(hasActualValue)
        }
      }
    })

    const sizes = sizeClasses[inputSize]
    const isFloating = variant === "floating"
    const shouldFloat = isFocused || hasValue || placeholder

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true)
      onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false)
      setHasValue(Boolean(e.target.value))
      onBlur?.(e)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(Boolean(e.target.value))
      props.onChange?.(e)
    }

    const baseInputClasses = `
      w-full
      rounded-lg
      border
      bg-background
      text-foreground
      placeholder:text-transparent
      transition-all duration-normal ease-in-out
      focus:outline-none focus:ring-2 focus:ring-offset-0
      disabled:opacity-50 disabled:cursor-not-allowed
    `

    const borderClasses = error
      ? "border-destructive focus:border-destructive focus:ring-destructive/20"
      : "border-input focus:border-primary focus:ring-primary/20"

    const paddingClasses = `
      ${leftIcon ? "pl-11" : ""}
      ${rightIcon ? "pr-11" : ""}
    `

    if (isFloating && label) {
      return (
        <div className={`relative ${className}`}>
          <div className="relative">
            {leftIcon && (
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                {leftIcon}
              </div>
            )}
            <input
              ref={setRefs}
              id={inputId}
              disabled={disabled}
              required={required}
              value={value}
              defaultValue={defaultValue}
              placeholder={placeholder || " "}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={handleChange}
              className={`
                ${baseInputClasses}
                ${sizes.input}
                ${borderClasses}
                ${paddingClasses}
                peer
              `.trim()}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
              {...props}
            />
            <label
              htmlFor={inputId}
              className={`
                absolute
                pointer-events-none
                transition-all duration-normal ease-in-out
                ${shouldFloat ? sizes.labelFloat : `${sizes.label} top-1/2 -translate-y-1/2`}
                ${shouldFloat ? "bg-background" : "bg-transparent"}
                ${error ? "text-destructive" : isFocused ? "text-primary" : "text-muted-foreground"}
                ${leftIcon && !shouldFloat ? "left-11" : ""}
                peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2
                peer-placeholder-shown:${sizes.label}
                peer-focus:${sizes.labelFloat}
                peer-focus:bg-background
                peer-focus:text-primary
              `}
            >
              {label}
              {required && <span className="text-destructive ml-0.5">*</span>}
            </label>
            {rightIcon && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                {rightIcon}
              </div>
            )}
          </div>
          {error && (
            <p id={`${inputId}-error`} className="mt-1.5 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {helperText && !error && (
            <p id={`${inputId}-helper`} className="mt-1.5 text-sm text-muted-foreground">
              {helperText}
            </p>
          )}
        </div>
      )
    }

    // Default variant (bordered, no floating label)
    return (
      <div className={`relative ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground mb-2"
          >
            {label}
            {required && <span className="text-destructive ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={setRefs}
            id={inputId}
            disabled={disabled}
            required={required}
            value={value}
            defaultValue={defaultValue}
            placeholder={placeholder}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            className={`
              ${baseInputClasses}
              ${sizes.input}
              ${borderClasses}
              ${paddingClasses}
              placeholder:text-muted-foreground
            `.trim()}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="mt-1.5 text-sm text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"
