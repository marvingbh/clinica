"use client"

import { useState } from "react"
import { ClockIcon, PencilIcon, ChevronDownIcon } from "@/shared/components/ui/icons"
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
  const [showBulkMenu, setShowBulkMenu] = useState(false)

  const { date } = formatDateTime(session.scheduledAt)
  const timeRange = formatTimeRange(session.scheduledAt, session.endAt)

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

  const handleBulkAction = (status: AppointmentStatus) => {
    setShowBulkMenu(false)
    onBulkUpdateStatus(status)
  }

  return (
    <div className="px-4 py-3 border-b border-border">
      {/* Date/time + professional */}
      <div className="text-sm text-muted-foreground">
        {isEditingDateTime && session.sessionGroupId ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <DateInput value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-9 px-3 rounded-xl border border-input bg-background text-foreground text-sm" />
              <TimeInput value={editTime} onChange={(e) => setEditTime(e.target.value)} placeholder="HH:MM" className="h-9 px-3 rounded-xl border border-input bg-background text-foreground text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleSaveDateTime} disabled={isSavingDateTime} className="text-xs px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {isSavingDateTime ? "..." : "Salvar"}
              </button>
              <button type="button" onClick={() => setIsEditingDateTime(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4 flex-shrink-0" />
            <span className="capitalize">{date}</span>
            <span className="opacity-40">|</span>
            <span>{timeRange}</span>
            {session.sessionGroupId && (
              <button type="button" onClick={() => setIsEditingDateTime(true)} className="text-muted-foreground hover:text-foreground ml-1">
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
        <p className="text-foreground font-medium mt-1">{session.professionalName}</p>
      </div>

      {/* Status summary + bulk action */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex flex-wrap gap-1.5">
          {derivedStatus ? (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[derivedStatus as AppointmentStatus] || "bg-gray-100 text-gray-800"}`}>
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

        {/* Single bulk action trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowBulkMenu(!showBulkMenu)}
            disabled={isBulkUpdating}
            className="h-8 px-3 rounded-xl bg-muted text-xs font-medium text-foreground hover:bg-muted/80 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {isBulkUpdating ? "..." : "Marcar todos"}
            <ChevronDownIcon className="w-3.5 h-3.5" />
          </button>

          {showBulkMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowBulkMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
                <button type="button" onClick={() => handleBulkAction("CONFIRMADO" as AppointmentStatus)} className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors text-blue-600 dark:text-blue-400">
                  Confirmar Todos
                </button>
                <button type="button" onClick={() => handleBulkAction("FINALIZADO" as AppointmentStatus)} className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors text-green-600 dark:text-green-400">
                  Todos Compareceram
                </button>
                <div className="border-t border-border" />
                <button type="button" onClick={() => handleBulkAction("CANCELADO_ACORDADO" as AppointmentStatus)} className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors text-teal-600 dark:text-teal-400">
                  Desmarcou
                </button>
                <button type="button" onClick={() => handleBulkAction("CANCELADO_FALTA" as AppointmentStatus)} className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors text-amber-600 dark:text-amber-400">
                  Faltou
                </button>
                <button type="button" onClick={() => handleBulkAction("CANCELADO_PROFISSIONAL" as AppointmentStatus)} className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors text-red-600 dark:text-red-400">
                  Sem cobrança
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
