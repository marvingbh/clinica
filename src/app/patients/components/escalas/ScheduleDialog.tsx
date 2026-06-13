"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Modal } from "./SendScaleDialog"
import type { ScaleOption } from "./types"

interface Props {
  patientId: string
  scales: ScaleOption[]
  onClose: () => void
  onCreated: () => void
}

/** Create an automatic-send schedule (cadence) for a scale. */
export function ScheduleDialog({ patientId, scales, onClose, onCreated }: Props) {
  const [scaleCode, setScaleCode] = useState(scales[0]?.code ?? "")
  const [cadenceType, setCadenceType] = useState<"ANTES_DE_SESSAO" | "A_CADA_N_SEMANAS">(
    "A_CADA_N_SEMANAS"
  )
  const [intervalWeeks, setIntervalWeeks] = useState(4)
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate() {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = { scaleCode, cadenceType }
      if (cadenceType === "A_CADA_N_SEMANAS") body.intervalWeeks = intervalWeeks
      const res = await fetch(`/api/patients/${patientId}/escalas/agendamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? "Não foi possível agendar.")
        return
      }
      toast.success("Envio automático agendado.")
      onCreated()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Agendar envios" onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Escala</span>
          <select
            value={scaleCode}
            onChange={(e) => setScaleCode(e.target.value)}
            className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
          >
            {scales.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Cadência</span>
          <select
            value={cadenceType}
            onChange={(e) =>
              setCadenceType(e.target.value as "ANTES_DE_SESSAO" | "A_CADA_N_SEMANAS")
            }
            className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
          >
            <option value="A_CADA_N_SEMANAS">A cada N semanas</option>
            <option value="ANTES_DE_SESSAO">Antes de cada sessão</option>
          </select>
        </label>

        {cadenceType === "A_CADA_N_SEMANAS" && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Intervalo (semanas)</span>
            <input
              type="number"
              min={1}
              max={26}
              value={intervalWeeks}
              onChange={(e) => setIntervalWeeks(Number(e.target.value))}
              className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm"
            />
          </label>
        )}

        <button
          onClick={handleCreate}
          disabled={submitting || !scaleCode}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Agendar
        </button>
      </div>
    </Modal>
  )
}
