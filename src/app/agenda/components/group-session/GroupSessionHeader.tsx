"use client"

import { useState } from "react"
import {
  ClockIcon,
  PencilIcon,
  ChevronDownIcon,
  TrashIcon,
  CalendarIcon,
  UserIcon,
  UsersIcon,
  RefreshCwIcon,
  XIcon,
  CheckIcon,
} from "@/shared/components/ui/icons"
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

// Matches STATUS_BADGE in AppointmentEditor so group & single headers share tone.
const STATUS_BADGE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  AGENDADO:               { bg: "bg-brand-50",  text: "text-brand-700", border: "border-brand-100", dot: "bg-brand-500" },
  CONFIRMADO:             { bg: "bg-ok-50",     text: "text-ok-700",    border: "border-ok-100",    dot: "bg-ok-500" },
  FINALIZADO:             { bg: "bg-ink-100",   text: "text-ink-700",   border: "border-ink-200",   dot: "bg-ink-500" },
  CANCELADO_FALTA:        { bg: "bg-warn-50",   text: "text-warn-700",  border: "border-warn-100",  dot: "bg-warn-500" },
  CANCELADO_ACORDADO:     { bg: "bg-brand-50",  text: "text-brand-700", border: "border-brand-100", dot: "bg-brand-400" },
  CANCELADO_PROFISSIONAL: { bg: "bg-err-50",    text: "text-err-700",   border: "border-err-100",   dot: "bg-err-500" },
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "G"
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

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

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(session.groupName)
  const [isSavingTitle, setIsSavingTitle] = useState(false)

  const [isDeleting, setIsDeleting] = useState(false)

  const { date } = formatDateTime(session.scheduledAt)
  const timeRange = formatTimeRange(session.scheduledAt, session.endAt)
  const participantCount = session.participants.length
  const durationMin = Math.round(
    (new Date(session.endAt).getTime() - new Date(session.scheduledAt).getTime()) / 60000
  )

  const statusCounts = session.participants.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  const allSameStatus =
    session.participants.length > 0 &&
    session.participants.every((p) => p.status === session.participants[0].status)
  const derivedStatus = allSameStatus ? session.participants[0].status : null
  const derivedStatusTone = derivedStatus ? STATUS_BADGE[derivedStatus] || STATUS_BADGE.AGENDADO : null

  const handleSaveDateTime = async () => {
    if (!session.sessionGroupId) return
    const dateMatch = editDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    const timeMatch = editTime.match(/^(\d{2}):(\d{2})$/)
    if (!dateMatch || !timeMatch) {
      toast.error("Data ou horário inválido")
      return
    }
    const isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
    const newStart = new Date(`${isoDate}T${editTime}:00`)
    const origStart = new Date(session.scheduledAt)
    const origEnd = new Date(session.endAt)
    const newEnd = new Date(newStart.getTime() + (origEnd.getTime() - origStart.getTime()))
    setIsSavingDateTime(true)
    const result = await rescheduleGroupSession(
      session.sessionGroupId,
      session.scheduledAt,
      newStart.toISOString(),
      newEnd.toISOString()
    )
    setIsSavingDateTime(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Sessão reagendada")
      setIsEditingDateTime(false)
      onStatusUpdated()
    }
  }

  const handleSaveTitle = async () => {
    if (!editTitle.trim()) return
    setIsSavingTitle(true)
    try {
      if (session.groupId) {
        const res = await fetch(`/api/groups/${session.groupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editTitle.trim() }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
      } else if (session.sessionGroupId) {
        const res = await fetch("/api/group-sessions/update", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionGroupId: session.sessionGroupId,
            scheduledAt: session.scheduledAt,
            title: editTitle.trim(),
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
      }
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
    if (!session.sessionGroupId && !session.groupId) return
    if (
      !window.confirm(
        "Excluir esta sessão em grupo? Todos os agendamentos dos participantes serão removidos."
      )
    )
      return
    setIsDeleting(true)
    try {
      const appointmentIds = session.participants.map((p) => p.appointmentId)
      for (const id of appointmentIds) {
        const res = await fetch(`/api/appointments/${id}`, { method: "DELETE" })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error)
        }
      }
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
    <div className="px-6 py-4 bg-gradient-to-b from-brand-50 to-card border-b border-ink-200">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {/* Left: avatar + title + participant count + recurrence line */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 border border-brand-200 font-semibold text-[13px] grid place-items-center flex-shrink-0">
            {getInitials(session.groupName)}
          </div>
          <div className="min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle()
                    if (e.key === "Escape") setIsEditingTitle(false)
                  }}
                  className="h-8 px-2.5 rounded-[4px] border border-ink-300 bg-card text-[15px] font-semibold text-ink-900 focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)]"
                />
                <button
                  type="button"
                  onClick={handleSaveTitle}
                  disabled={isSavingTitle}
                  className="h-8 px-3 rounded-[4px] bg-brand-500 text-white text-[12px] font-medium hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <CheckIcon className="w-3.5 h-3.5" />
                  {isSavingTitle ? "..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTitle(false)
                    setEditTitle(session.groupName)
                  }}
                  className="h-8 w-8 grid place-items-center rounded-[4px] text-ink-500 hover:bg-ink-100 transition-colors"
                  aria-label="Cancelar"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-ink-100 text-ink-700 border border-ink-200 uppercase tracking-wide">
                  Grupo
                </span>
                <h3 className="text-[16px] font-semibold text-ink-900 truncate tracking-tight">
                  {session.groupName}
                </h3>
                {(session.sessionGroupId || session.groupId) && (
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    className="w-6 h-6 grid place-items-center rounded-[4px] text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
                    aria-label="Editar título"
                    title="Editar título"
                  >
                    <PencilIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-[12px] text-ink-600">
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon className="w-3.5 h-3.5 text-ink-400" />
                {participantCount} {participantCount === 1 ? "participante" : "participantes"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-ink-400" />
                {session.professionalName}
              </span>
            </div>
          </div>
        </div>

        {/* Right: badges */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {derivedStatus && derivedStatusTone ? (
            <span
              className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium border ${derivedStatusTone.bg} ${derivedStatusTone.text} ${derivedStatusTone.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${derivedStatusTone.dot}`} />
              {PARTICIPANT_STATUS_LABELS[derivedStatus] || derivedStatus}
            </span>
          ) : (
            Object.entries(statusCounts).map(([status, count]) => {
              const tone = STATUS_BADGE[status] || STATUS_BADGE.AGENDADO
              return (
                <span
                  key={status}
                  className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium border ${tone.bg} ${tone.text} ${tone.border}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                  {count} {PARTICIPANT_STATUS_LABELS[status as AppointmentStatus] || status}
                </span>
              )
            })
          )}
          {session.groupId && session.recurrenceType && (
            <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full text-[11px] font-medium bg-brand-50 text-brand-700 border border-brand-100">
              <RefreshCwIcon className="w-3 h-3" />
              {session.recurrenceType === "WEEKLY"
                ? "Semanal"
                : session.recurrenceType === "BIWEEKLY"
                  ? "Quinzenal"
                  : "Mensal"}
            </span>
          )}
        </div>
      </div>

      {/* Meta row — date / time / duration / participants */}
      {isEditingDateTime && session.sessionGroupId ? (
        <div className="mt-3 grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
          <DateInput
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            className="h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] font-mono focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)]"
          />
          <TimeInput
            value={editTime}
            onChange={(e) => setEditTime(e.target.value)}
            placeholder="HH:MM"
            className="h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] font-mono focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)]"
          />
          <button
            type="button"
            onClick={handleSaveDateTime}
            disabled={isSavingDateTime}
            className="h-9 px-3 rounded-[4px] bg-brand-500 text-white text-[12px] font-medium hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <CheckIcon className="w-3.5 h-3.5" />
            {isSavingDateTime ? "..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditingDateTime(false)}
            className="h-9 w-9 grid place-items-center rounded-[4px] text-ink-500 hover:bg-ink-100 transition-colors"
            aria-label="Cancelar"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[12px] text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-ink-400" />
            <span className="text-ink-700 font-medium font-mono tabular-nums capitalize">{date}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon className="w-3.5 h-3.5 text-ink-400" />
            <span className="text-ink-700 font-medium font-mono tabular-nums">{timeRange}</span>
            <span className="text-ink-500">· {durationMin} min</span>
            {session.sessionGroupId && (
              <button
                type="button"
                onClick={() => setIsEditingDateTime(true)}
                className="ml-1 w-5 h-5 grid place-items-center rounded-[3px] text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors"
                aria-label="Reagendar"
                title="Reagendar"
              >
                <PencilIcon className="w-3 h-3" />
              </button>
            )}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {(session.sessionGroupId || session.groupId) && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="h-8 w-8 grid place-items-center rounded-[4px] text-ink-500 hover:text-err-700 hover:bg-err-50 transition-colors disabled:opacity-50"
                title="Excluir sessão"
                aria-label="Excluir sessão"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowBulkMenu(!showBulkMenu)}
                disabled={isBulkUpdating}
                className="h-8 px-3 rounded-[4px] border border-ink-300 bg-card text-[12px] font-medium text-ink-800 hover:bg-ink-50 hover:border-ink-400 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
              >
                {isBulkUpdating ? "..." : "Marcar todos"}
                <ChevronDownIcon className="w-3.5 h-3.5" />
              </button>
              {showBulkMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowBulkMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-card border border-ink-200 rounded-[4px] shadow-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleBulkAction("CONFIRMADO" as AppointmentStatus)}
                      className="w-full px-3 py-2.5 text-left text-[13px] text-brand-700 hover:bg-ink-50 transition-colors"
                    >
                      Confirmar todos
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkAction("FINALIZADO" as AppointmentStatus)}
                      className="w-full px-3 py-2.5 text-left text-[13px] text-ok-700 hover:bg-ink-50 transition-colors"
                    >
                      Todos compareceram
                    </button>
                    <div className="h-px bg-ink-100" />
                    <button
                      type="button"
                      onClick={() => handleBulkAction("CANCELADO_ACORDADO" as AppointmentStatus)}
                      className="w-full px-3 py-2.5 text-left text-[13px] text-brand-700 hover:bg-ink-50 transition-colors"
                    >
                      Desmarcou
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkAction("CANCELADO_FALTA" as AppointmentStatus)}
                      className="w-full px-3 py-2.5 text-left text-[13px] text-warn-700 hover:bg-ink-50 transition-colors"
                    >
                      Faltou
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkAction("CANCELADO_PROFISSIONAL" as AppointmentStatus)}
                      className="w-full px-3 py-2.5 text-left text-[13px] text-err-700 hover:bg-ink-50 transition-colors"
                    >
                      Sem cobrança
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
