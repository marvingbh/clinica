"use client"

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

/** "Adicionar campo" dropdown listing all field types by pt-BR label. */
export function FieldTypePicker({ onAdd }: FieldTypePickerProps) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value as FormFieldType)
        e.currentTarget.value = ""
      }}
      className="rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-700 outline-none focus:border-ink-400"
    >
      <option value="">+ Adicionar campo</option>
      {ORDER.map((t) => (
        <option key={t} value={t}>
          {FIELD_TYPE_LABELS[t]}
        </option>
      ))}
    </select>
  )
}
