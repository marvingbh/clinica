"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import {
  getVisibleFields,
  computeProgress,
  type AnswerValue,
  type FormAnswers,
  type FormField,
} from "@/lib/forms"
import { ProgressHeader } from "./ProgressHeader"
import { FieldInput } from "./FieldInput"
import { DoneScreen } from "./DoneScreen"

interface FillFormProps {
  token: string
  clinicName: string
  formName: string
  fields: FormField[]
  initialAnswers: FormAnswers
}

/**
 * Orchestrates the public fill flow: derived progress/visibility (no effects),
 * debounced autosave on commit (event handler), and a final submit. The
 * initial GET happens in the server page; this component never fetches on mount.
 */
export function FillForm({ token, clinicName, formName, fields, initialAnswers }: FillFormProps) {
  const [answers, setAnswers] = useState<FormAnswers>(initialAnswers)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestAnswers = useRef<FormAnswers>(initialAnswers)

  const visible = getVisibleFields(fields, answers)
  const progress = computeProgress(fields, answers)

  function setAnswer(id: string, value: AnswerValue | undefined) {
    setAnswers((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[id]
      else next[id] = value
      latestAnswers.current = next
      return next
    })
    if (errors[id]) setErrors((e) => ({ ...e, [id]: "" }))
  }

  function scheduleAutosave() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void autosave(), 600)
  }

  async function autosave() {
    try {
      await fetch(`/api/public/forms/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: latestAnswers.current }),
      })
    } catch {
      // Autosave is best-effort; the final submit re-sends everything.
    }
  }

  async function handleSubmit() {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/forms/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: latestAnswers.current }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDone(true)
        return
      }
      if (data.errors) {
        setErrors(data.errors)
        toast.error("Há campos pendentes. Verifique os destacados.")
      } else {
        toast.error(data.error ?? "Não foi possível enviar. Tente novamente.")
      }
    } catch {
      toast.error("Não foi possível enviar. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return <DoneScreen />

  return (
    <div className="min-h-screen bg-canvas pb-28">
      <ProgressHeader clinicName={clinicName} formName={formName} percent={progress.percent} />

      <div className="max-w-md mx-auto px-4 py-4 flex flex-col gap-3">
        {visible.map((field) =>
          field.type === "section" ? (
            <h2 key={field.id} className="text-[15px] font-semibold text-ink-900 mt-3">
              {field.label}
            </h2>
          ) : (
            <div key={field.id} className="rounded-xl border border-ink-100 bg-card p-4">
              <label className="block text-[14px] font-medium text-ink-800">
                {field.label}
                {field.required ? <span className="text-red-500"> *</span> : null}
              </label>
              {field.description ? (
                <p className="text-[12px] text-ink-500 mt-0.5">{field.description}</p>
              ) : null}
              {field.type === "info_consent" && field.infoText ? (
                <p className="text-[13px] text-ink-600 mt-2 whitespace-pre-line border-l-2 border-ink-200 pl-3">
                  {field.infoText}
                </p>
              ) : null}
              <div className="mt-2">
                <FieldInput
                  field={field}
                  value={answers[field.id]}
                  error={errors[field.id]}
                  onChange={(v) => setAnswer(field.id, v)}
                  onCommit={scheduleAutosave}
                />
              </div>
              {errors[field.id] ? (
                <p className="text-[12px] text-red-500 mt-1">{errors[field.id]}</p>
              ) : null}
            </div>
          )
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-ink-100 bg-card px-4 py-3">
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="w-full max-w-md mx-auto block rounded-lg bg-ink-900 text-white py-3 text-[15px] font-medium disabled:opacity-50"
        >
          {submitting ? "Enviando..." : "Enviar respostas"}
        </button>
      </div>
    </div>
  )
}
