"use client"

import React from "react"

/**
 * Time input with auto-formatting mask.
 * Typing "0800" automatically becomes "08:00".
 * Compatible with react-hook-form's {...register("field")} spread.
 */
const TimeInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ onChange, ...props }, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 4)

    let formatted: string
    if (digits.length <= 2) {
      formatted = digits
    } else {
      formatted = digits.slice(0, 2) + ":" + digits.slice(2)
    }

    e.target.value = formatted
    onChange?.(e)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      ref={ref}
      {...props}
      onChange={handleChange}
    />
  )
})

TimeInput.displayName = "TimeInput"

export { TimeInput }
