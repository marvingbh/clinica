"use client"

import { useState } from "react"
import { UsersIcon, ClockIcon, PencilIcon } from "@/shared/components/ui/icons"
import { STATUS_COLORS } from "../../lib/constants"
import { DateInput } from "../DateInput"
import { TimeInput } from "../TimeInput"
import { rescheduleGroupSession } from "../../services/appointmentService"
import { toast } from "sonner"
import {
  formatDateTime,
  formatTimeRange,
  PARTICIPANT_STATUS_LABELS,
  type GroupSession,
  type AppointmentStatus,
} from "./types"

interface GroupSessionHeaderProps {
  session: GroupSession
  onStatusUpdated: () => void
  isBulkUpdating: boolean
  onBulkUpdateStatus: (status: AppointmentStatus) => void
}

export function GroupSessionHeader({
  session,
  onStatusUpdated,
  isBulkUpdating,
  onBulkUpdateStatus,
}: GroupSessionHeaderProps) {
  const [isEditingDateTime, setIsEditingDateTime] = useState(false)
  const [editDate, setEditDate] = useState(() => {
    const d = new Date(session.scheduledAt)
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
  })
  const [editTime, setEditTime] = useState(() => {
    const d = new Date(session.scheduledAt)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  })
  const [isSavingDateTime, setIsSavingDateTime] = useState(false)

  const { date } = formatDateTime(session.scheduledAt)
  const timeRange = formatTimeRange(session.scheduledAt, session.endAt)

  // Count statuses for summary
  const statusCounts = session.participants.reduce(
    (acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc },
    {} as Record<string, number>
  )
  const allSameStatus = session.participants.length > 0 &&
    session.participants.every(p => p.status === session.participants[0].status)
  const derivedStatus = allSameStatus ? session.participants[0].status : null

  const handleSaveDateTime = async () => {
    if (!session.sessionGroupId) return
    const dateMatch = editDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    const timeMatch = editTime.match(/^(\d{2}):(\d{2})$/)
    if (!dateMatch || !timeMatch) { toast.error("Data ou horário inválido"); return }

    const isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
    const newStart = new Date(`${isoDate}T${editTime}:00`)
    const origStart = new Date(session.scheduledAt)
    const origEnd = new Date(session.endAt)
    const newEnd = new Date(newStart.getTime() + (origEnd.getTime() - origStart.getTime()))

    setIsSavingDateTime(true)
    const result = await rescheduleGroupSession(session.sessionGroupId, session.scheduledAt, newStart.toISOString(), newEnd.toISOString())
    setIsSavingDateTime(false)

    if (result.error) { toast.error(result.error) }
    else { toast.success("Sessão reagendada"); setIsEditingDateTime(false); onStatusUpdated() }
  }

  return (
    <div className="px-4 py-3 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200/50 dark:border-purple-800/50">
      <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 mb-2">
        <UsersIcon className="w-5 h-5" />
        <span className="font-medium">Sessão em Grupo</span>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        {isEditingDateTime && session.sessionGroupId ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <DateInput value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm" />
              <TimeInput value={editTime} onChange={(e) => setEditTime(e.target.value)} placeholder="HH:MM" className="h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleSaveDateTime} disabled={isSavingDateTime} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {isSavingDateTime ? "..." : "Salvar"}
              </button>
              <button type="button" onClick={() => setIsEditingDateTime(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <p className="capitalize">{date}</p>
              {session.sessionGroupId && (
                <button type="button" onClick={() => setIsEditingDateTime(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Alterar data/horário">
                  <PencilIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <ClockIcon className="w-4 h-4" />
              <span>{timeRange}</span>
            </div>
          </>
        )}
        <p className="text-foreground font-medium mt-2">{session.professionalName}</p>
      </div>

      {/* Derived session status or per-status counts */}
      <div className="flex flex-wrap gap-2 mt-3">
        {derivedStatus ? (
          <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${STATUS_COLORS[derivedStatus as AppointmentStatus] || "bg-gray-100 text-gray-800"}`}>
            {PARTICIPANT_STATUS_LABELS[derivedStatus] || derivedStatus}
          </span>
        ) : (
          Object.entries(statusCounts).map(([status, count]) => (
            <span key={status} className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[status as AppointmentStatus] || "bg-gray-100 text-gray-800"}`}>
              {count} {PARTICIPANT_STATUS_LABELS[status] || status}
            </span>
          ))
        )}
      </div>

      {/* Bulk actions */}
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        <button type="button" onClick={() => onBulkUpdateStatus("CONFIRMADO" as AppointmentStatus)} disabled={isBulkUpdating} className="h-7 px-3 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {isBulkUpdating ? "..." : "Confirmar Todos"}
        </button>
        <button type="button" onClick={() => onBulkUpdateStatus("FINALIZADO" as AppointmentStatus)} disabled={isBulkUpdating} className="h-7 px-3 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
          {isBulkUpdating ? "..." : "Todos Compareceram"}
        </button>
        <button type="button" onClick={() => onBulkUpdateStatus("CANCELADO_ACORDADO" as AppointmentStatus)} disabled={isBulkUpdating} className="h-7 px-2 rounded border border-teal-200 dark:border-teal-700 text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 disabled:opacity-50 transition-colors">
          Desmarcou
        </button>
        <button type="button" onClick={() => onBulkUpdateStatus("CANCELADO_FALTA" as AppointmentStatus)} disabled={isBulkUpdating} className="h-7 px-2 rounded border border-amber-200 dark:border-amber-700 text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 transition-colors">
          Faltou
        </button>
        <button type="button" onClick={() => onBulkUpdateStatus("CANCELADO_PROFISSIONAL" as AppointmentStatus)} disabled={isBulkUpdating} className="h-7 px-2 rounded border border-red-200 dark:border-red-700 text-[11px] font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors">
          Sem cobrança
        </button>
      </div>
    </div>
  )
}
