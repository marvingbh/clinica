"use client"

import { useState, useRef } from "react"
import { useMountEffect } from "@/shared/hooks"
import { FIELD_TYPE_LABELS, type FormFieldType } from "@/lib/forms"

const ORDER: FormFieldType[] = [
  "section",
  "short_text",
  "long_text",
  "single_choice",
  "multiple_choice",
  "dropdown",
  "scale_0_10",
  "date",
  "yes_no",
  "info_consent",
]

interface FieldTypePickerProps {
  onAdd: (type: FormFieldType) => void
}

/** "+ Adicionar campo" button that opens a menu of field types; each item is a
 *  clickable button that appends a field of that type. */
export function FieldTypePicker({ onAdd }: FieldTypePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useMountEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  })

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-card px-3 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50 transition-colors"
      >
        + Adicionar campo
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-ink-200 bg-card py-1 shadow-[var(--shadow-lg)]"
        >
          {ORDER.map((t) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              onClick={() => {
                onAdd(t)
                setOpen(false)
              }}
              className="block w-full px-3 py-2 text-left text-[13px] text-ink-700 hover:bg-ink-50 transition-colors"
            >
              {FIELD_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
