"use client"

import { useState } from "react"
import { ClockIcon, PencilIcon, ChevronDownIcon, TrashIcon } from "@/shared/components/ui/icons"
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
  onDeleted?: () => void
  isBulkUpdating: boolean
  onBulkUpdateStatus: (status: AppointmentStatus) => void
}

export function GroupSessionHeader({
  session,
  onStatusUpdated,
  onDeleted,
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

  // Title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(session.groupName)
  const [isSavingTitle, setIsSavingTitle] = useState(false)

  // Delete
  const [isDeleting, setIsDeleting] = useState(false)

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

  const handleSaveTitle = async () => {
    if (!session.sessionGroupId || !editTitle.trim()) return
    setIsSavingTitle(true)
    try {
      const res = await fetch("/api/group-sessions/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionGroupId: session.sessionGroupId, scheduledAt: session.scheduledAt, title: editTitle.trim() }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success("Título atualizado")
      setIsEditingTitle(false)
      onStatusUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar título")
    } finally {
      setIsSavingTitle(false)
    }
  }

  const handleDelete = async () => {
    if (!session.sessionGroupId) return
    if (!window.confirm("Excluir esta sessão em grupo? Todos os agendamentos dos participantes serão removidos.")) return
    setIsDeleting(true)
    try {
      const params = new URLSearchParams({ sessionGroupId: session.sessionGroupId, scheduledAt: session.scheduledAt })
      const res = await fetch(`/api/group-sessions/update?${params}`, { method: "DELETE" })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
      toast.success("Sessão excluída")
      onDeleted?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir sessão")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBulkAction = (status: AppointmentStatus) => {
    setShowBulkMenu(false)
    onBulkUpdateStatus(status)
  }

  return (
    <div className="px-4 py-3 border-b border-border">
      {/* Title — editable */}
      {session.sessionGroupId && (
        <div className="mb-2">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="flex-1 h-9 px-3 rounded-xl border border-input bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") setIsEditingTitle(false) }}
              />
              <button type="button" onClick={handleSaveTitle} disabled={isSavingTitle} className="text-xs px-3 py-1.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                {isSavingTitle ? "..." : "Salvar"}
              </button>
              <button type="button" onClick={() => { setIsEditingTitle(false); setEditTitle(session.groupName) }} className="text-xs text-muted-foreground hover:text-foreground">
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setIsEditingTitle(true)} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group">
              <PencilIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-xs">Editar título</span>
            </button>
          )}
        </div>
      )}

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

      {/* Status summary + bulk action + delete */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex flex-wrap gap-1.5">
          {derivedStatus ? (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[derivedStatus as AppointmentStatus] || "bg-gray-100 text-gray-800"}`}>
              {PARTICIPANT_STATUS_LABELS[derivedStatus] || derivedStatus}
            </span>
          ) : (
            Object.entries(statusCounts).map(([status, count]) => (
              <span key={status} className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[status as AppointmentStatus] || "bg-gray-100 text-gray-800"}`}>
                {count} {PARTICIPANT_STATUS_LABELS[status as AppointmentStatus] || status}
              </span>
            ))
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Delete session */}
          {session.sessionGroupId && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="h-8 w-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              title="Excluir sessão"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          )}

          {/* Bulk action trigger */}
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
    </div>
  )
}
