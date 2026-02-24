"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "react-day-picker/locale"
import "react-day-picker/style.css"
import { CalendarIcon } from "@/shared/components/ui/icons"

function parseBrDate(value: string): Date | undefined {
  if (!value) return undefined
  const parts = value.split("/")
  if (parts.length !== 3) return undefined
  const [day, month, year] = parts.map(Number)
  if (!day || !month || !year || year < 1900 || year > 2100) return undefined
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
    return d
  }
  return undefined
}

function formatToBr(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Date input with auto-formatting mask and optional calendar picker.
 * Typing "24022026" automatically becomes "24/02/2026".
 * Click the calendar icon to pick a date visually.
 * Compatible with react-hook-form's {...register("field")} spread.
 */
const DateInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ onChange, className, ...props }, ref) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Merge external ref with internal ref
  const setRefs = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === "function") {
        ref(node)
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current = node
      }
    },
    [ref]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8)

    let formatted: string
    if (digits.length <= 2) {
      formatted = digits
    } else if (digits.length <= 4) {
      formatted = digits.slice(0, 2) + "/" + digits.slice(2)
    } else {
      formatted = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4)
    }

    e.target.value = formatted
    onChange?.(e)
  }

  function handleSelect(date: Date | undefined) {
    if (!date || !inputRef.current) {
      setOpen(false)
      return
    }
    const formatted = formatToBr(date)
    // Use native input setter to trigger react-hook-form's onChange
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set
    nativeInputValueSetter?.call(inputRef.current, formatted)
    inputRef.current.dispatchEvent(new Event("input", { bubbles: true }))
    setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Parse current value for calendar selection
  const currentValue = inputRef.current?.value || (props.value as string) || (props.defaultValue as string) || ""
  const selected = parseBrDate(currentValue)

  return (
    <div ref={containerRef} className="relative">
      <div className="flex">
        <input
          type="text"
          inputMode="numeric"
          placeholder="DD/MM/AAAA"
          maxLength={10}
          ref={setRefs}
          className={className ? `${className} pr-10` : "pr-10"}
          {...props}
          onChange={handleChange}
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Abrir calendario"
          tabIndex={-1}
        >
          <CalendarIcon className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 bg-card border border-border rounded-lg shadow-lg p-3">
          <DayPicker
            mode="single"
            locale={ptBR}
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected}
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2050, 11)}
          />
        </div>
      )}
    </div>
  )
})

DateInput.displayName = "DateInput"

export { DateInput }
