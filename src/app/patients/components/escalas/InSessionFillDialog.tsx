"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { getScaleDefinition, isScaleCode } from "@/lib/scales"
import { Modal } from "./SendScaleDialog"
import type { ScaleOption } from "./types"

interface Props {
  patientId: string
  scales: ScaleOption[]
  onClose: () => void
  onSaved: () => void
}

/** Fill a full scale in session (the professional records every answer). */
export function InSessionFillDialog({ patientId, scales, onClose, onSaved }: Props) {
  const [scaleCode, setScaleCode] = useState(scales[0]?.code ?? "")
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)

  const def = isScaleCode(scaleCode) ? getScaleDefinition(scaleCode) : null
  const allAnswered = def ? def.items.every((i) => answers[i.id] !== undefined) : false

  function selectScale(code: string) {
    setScaleCode(code)
    setAnswers({})
  }

  async function handleSave() {
    if (!def || !allAnswered) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/patients/${patientId}/escalas/em-sessao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scaleCode, answers }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Não foi possível salvar.")
        return
      }
      toast.success("Escala registrada.")
      onSaved()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Aplicar em sessão" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Escala</span>
          <select
            value={scaleCode}
            onChange={(e) => selectScale(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
          >
            {scales.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {def && (
          <>
            <p className="rounded-lg bg-gray-50 p-2 text-xs text-gray-600">{def.stem}</p>
            <ol className="space-y-3">
              {def.items.map((item, i) => (
                <li key={item.id} className="text-sm">
                  <p className="mb-1 font-medium text-gray-800">
                    {i + 1}. {item.text}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {def.options.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAnswers((a) => ({ ...a, [item.id]: opt.value }))}
                        className={`rounded-md border px-2 py-1 text-xs ${
                          answers[item.id] === opt.value
                            ? "border-blue-600 bg-blue-50 font-medium text-blue-700"
                            : "border-gray-200 text-gray-600"
                        }`}
                      >
                        {opt.value} — {opt.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

        <button
          onClick={handleSave}
          disabled={submitting || !allAnswered}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar pontuação
        </button>
      </div>
    </Modal>
  )
}
