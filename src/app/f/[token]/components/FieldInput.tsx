"use client"

import { DatePickerInput } from "@/shared/components/ui/date-picker-input"
import type { AnswerValue, FormField } from "@/lib/forms"

interface FieldInputProps {
  field: FormField
  value: AnswerValue | undefined
  error?: string | null
  onChange: (value: AnswerValue | undefined) => void
  onCommit?: () => void
}

const inputClass =
  "w-full rounded-lg border border-ink-200 bg-card px-3 py-2 text-[15px] text-ink-900 outline-none focus:border-ink-400"

/** Renders the patient-facing input for a single field, by type. */
export function FieldInput({ field, value, error, onChange, onCommit }: FieldInputProps) {
  const errorRing = error ? "border-red-400" : ""

  switch (field.type) {
    case "section":
      return null

    case "info_consent":
      return (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={value === true}
            onChange={(e) => {
              onChange(e.target.checked)
              onCommit?.()
            }}
          />
          <span className="text-[14px] text-ink-700">Li e aceito</span>
        </label>
      )

    case "long_text":
      return (
        <textarea
          className={`${inputClass} ${errorRing} min-h-[96px] resize-y`}
          maxLength={5000}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit?.()}
        />
      )

    case "short_text":
      return (
        <input
          type="text"
          className={`${inputClass} ${errorRing}`}
          maxLength={200}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit?.()}
        />
      )

    case "date":
      return (
        <DatePickerInput
          value={typeof value === "string" ? value : ""}
          onChange={(v) => {
            onChange(v)
            onCommit?.()
          }}
          placeholder="DD/MM/AAAA"
        />
      )

    case "yes_no":
      return (
        <div className="flex gap-2">
          {[
            { label: "Sim", v: true },
            { label: "Não", v: false },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              className={`flex-1 rounded-lg border px-3 py-2 text-[14px] ${
                value === opt.v ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-700"
              }`}
              onClick={() => {
                onChange(opt.v)
                onCommit?.()
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )

    case "scale_0_10":
      return (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              className={`h-9 w-9 rounded-lg border text-[13px] ${
                value === n ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 text-ink-700"
              }`}
              onClick={() => {
                onChange(n)
                onCommit?.()
              }}
            >
              {n}
            </button>
          ))}
        </div>
      )

    case "single_choice":
      return (
        <div className="flex flex-col gap-1.5">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={field.id}
                checked={value === opt}
                onChange={() => {
                  onChange(opt)
                  onCommit?.()
                }}
              />
              <span className="text-[14px] text-ink-700">{opt}</span>
            </label>
          ))}
        </div>
      )

    case "multiple_choice": {
      const selected = Array.isArray(value) ? value : []
      return (
        <div className="flex flex-col gap-1.5">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt]
                    : selected.filter((s) => s !== opt)
                  onChange(next)
                  onCommit?.()
                }}
              />
              <span className="text-[14px] text-ink-700">{opt}</span>
            </label>
          ))}
        </div>
      )
    }

    case "dropdown":
      return (
        <select
          className={`${inputClass} ${errorRing}`}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => {
            onChange(e.target.value || undefined)
            onCommit?.()
          }}
        >
          <option value="">Selecione...</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )

    default:
      return null
  }
}
