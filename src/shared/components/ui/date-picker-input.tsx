"use client"

import { useEffect, useRef, useState } from "react"
import { DayPicker } from "react-day-picker"
import { ptBR } from "react-day-picker/locale"
import "react-day-picker/style.css"
import { CalendarIcon } from "./icons"

interface DatePickerInputProps {
  id?: string
  value: string // DD/MM/YYYY
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

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

export function DatePickerInput({
  id,
  value,
  onChange,
  placeholder = "DD/MM/AAAA",
  disabled = false,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = parseBrDate(value)

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

  function handleSelect(date: Date | undefined) {
    if (date) {
      onChange(formatToBr(date))
    } else {
      onChange("")
    }
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={10}
          disabled={disabled}
          className="w-full h-12 px-4 pr-12 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Abrir calendario"
        >
          <CalendarIcon className="w-5 h-5" />
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
            startMonth={new Date(1950, 0)}
            endMonth={new Date(2050, 11)}
          />
        </div>
      )}
    </div>
  )
}
