"use client"

import { useState } from "react"
import { getVisibleFields, computeProgress, type FormAnswers, type FormField } from "@/lib/forms"
import { FieldInput } from "@/app/f/[token]/components/FieldInput"

interface MobilePreviewProps {
  fields: FormField[]
}

/** Live mobile preview that mirrors the public fill page (interactive locally). */
export function MobilePreview({ fields }: MobilePreviewProps) {
  const [answers, setAnswers] = useState<FormAnswers>({})
  const visible = getVisibleFields(fields, answers)
  const progress = computeProgress(fields, answers)

  return (
    <div className="rounded-2xl border border-ink-200 bg-canvas overflow-hidden">
      <div className="bg-card border-b border-ink-100 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-400">Pré-visualização</p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
          <div className="h-full bg-ink-900 transition-[width]" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
      <div className="max-h-[60vh] overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {visible.length === 0 ? (
          <p className="text-[13px] text-ink-400 py-6 text-center">Adicione campos para visualizar.</p>
        ) : (
          visible.map((field) =>
            field.type === "section" ? (
              <h3 key={field.id} className="text-[14px] font-semibold text-ink-900 mt-2">
                {field.label}
              </h3>
            ) : (
              <div key={field.id} className="rounded-xl border border-ink-100 bg-card p-3">
                <label className="block text-[13px] font-medium text-ink-800">
                  {field.label}
                  {field.required ? <span className="text-red-500"> *</span> : null}
                </label>
                {field.type === "info_consent" && field.infoText ? (
                  <p className="text-[12px] text-ink-600 mt-1 whitespace-pre-line border-l-2 border-ink-200 pl-2">
                    {field.infoText}
                  </p>
                ) : null}
                <div className="mt-2">
                  <FieldInput
                    field={field}
                    value={answers[field.id]}
                    onChange={(v) =>
                      setAnswers((prev) => {
                        const next = { ...prev }
                        if (v === undefined) delete next[field.id]
                        else next[field.id] = v
                        return next
                      })
                    }
                  />
                </div>
              </div>
            )
          )
        )}
      </div>
    </div>
  )
}
