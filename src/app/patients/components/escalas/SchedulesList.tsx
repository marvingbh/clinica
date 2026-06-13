"use client"

import { toast } from "sonner"
import { Pause, Play, Trash2 } from "lucide-react"
import {
  describeCadence,
  PAUSED_REASON_LABELS,
  getScaleDefinition,
  isScaleCode,
} from "@/lib/scales"
import type { ScheduleRow } from "./types"

interface Props {
  patientId: string
  schedules: ScheduleRow[]
  canWrite: boolean
  onChanged: () => void
}

export function SchedulesList({ patientId, schedules, canWrite, onChanged }: Props) {
  async function patchSchedule(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/patients/${patientId}/escalas/agendamentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Não foi possível atualizar.")
      return
    }
    onChanged()
  }

  async function removeSchedule(id: string) {
    const res = await fetch(`/api/patients/${patientId}/escalas/agendamentos/${id}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      toast.error("Não foi possível excluir.")
      return
    }
    toast.success("Agendamento removido.")
    onChanged()
  }

  if (schedules.length === 0) {
    return <p className="text-sm text-gray-500">Nenhum envio automático configurado.</p>
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
      {schedules.map((s) => {
        const def = isScaleCode(s.scaleCode) ? getScaleDefinition(s.scaleCode) : null
        return (
          <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div>
              <p className="font-medium text-gray-800">{def?.shortName ?? s.scaleCode}</p>
              <p className="text-xs text-gray-500">
                {describeCadence(s.cadenceType, s.intervalWeeks)}
                {" · "}
                {s.active
                  ? "Ativo"
                  : s.pausedReason
                    ? PAUSED_REASON_LABELS[s.pausedReason] ?? "Pausado"
                    : "Pausado"}
              </p>
            </div>
            {canWrite && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => patchSchedule(s.id, { active: !s.active })}
                  className="text-gray-400 hover:text-gray-700"
                  title={s.active ? "Pausar" : "Reativar"}
                >
                  {s.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => removeSchedule(s.id)}
                  className="text-gray-400 hover:text-red-600"
                  title="Excluir"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
