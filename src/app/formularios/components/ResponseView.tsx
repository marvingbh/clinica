"use client"

import { getVisibleFields, type FormAnswers, type FormField } from "@/lib/forms"

interface ResponseViewProps {
  fields: FormField[]
  answers: FormAnswers
}

function formatAnswer(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === "") return ""
  if (field.type === "yes_no" || field.type === "info_consent") return value === true ? "Sim" : "Não"
  if (Array.isArray(value)) return value.join(", ")
  return String(value)
}

/** Read-only question → answer rendering against the answered version. */
export function ResponseView({ fields, answers }: ResponseViewProps) {
  const visible = getVisibleFields(fields, answers)
  return (
    <div className="flex flex-col gap-3">
      {visible.map((field) => {
        if (field.type === "section") {
          return (
            <h3 key={field.id} className="text-[15px] font-semibold text-ink-900 mt-3 border-b border-ink-100 pb-1">
              {field.label}
            </h3>
          )
        }
        const answer = formatAnswer(field, answers[field.id])
        return (
          <div key={field.id} className="rounded-lg border border-ink-100 p-3">
            <p className="text-[13px] font-medium text-ink-700">{field.label}</p>
            {answer ? (
              <p className="text-[14px] text-ink-900 mt-1 whitespace-pre-line">{answer}</p>
            ) : (
              <p className="text-[13px] text-ink-400 italic mt-1">(sem resposta)</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
