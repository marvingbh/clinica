"use client"

import { useState, useEffect } from "react"
import { Sheet } from "./Sheet"
import { UsersIcon, ClockIcon, CheckCircleIcon, XIcon, CheckIcon } from "@/shared/components/ui/icons"
import { STATUS_LABELS, STATUS_COLORS } from "../lib/constants"
import { updateStatus, updateAppointment } from "../services/appointmentService"
import { toast } from "sonner"
import type { GroupSession, AppointmentStatus, Professional } from "../lib/types"

interface GroupSessionSheetProps {
  isOpen: boolean
  onClose: () => void
  session: GroupSession | null
  onStatusUpdated: () => void
  professionals?: Professional[]
  isAdmin?: boolean
}

function formatDateTime(isoString: string): { date: string; time: string } {
  const dateObj = new Date(isoString)
  return {
    date: dateObj.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    time: dateObj.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }
}

function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
  const end = new Date(endIso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })
  return `${start} - ${end}`
}

export function GroupSessionSheet({
  isOpen,
  onClose,
  session,
  onStatusUpdated,
  professionals = [],
  isAdmin = false,
}: GroupSessionSheetProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [sessionProfIds, setSessionProfIds] = useState<string[]>([])
  const [isSavingProfs, setIsSavingProfs] = useState(false)
  const [isEditingProfs, setIsEditingProfs] = useState(false)

  // Initialize session professional IDs when session changes
  useEffect(() => {
    if (session) {
      setSessionProfIds(
        session.additionalProfessionals?.map(ap => ap.professionalProfileId) || []
      )
      setIsEditingProfs(false)
    }
  }, [session])

  if (!session) return null

  const handleSaveSessionProfessionals = async () => {
    if (!session) return
    setIsSavingProfs(true)
    try {
      // PATCH all appointments in this session with new additional professionals
      const results = await Promise.all(
        session.participants.map(p =>
          updateAppointment(p.appointmentId, {
            additionalProfessionalIds: sessionProfIds,
          })
        )
      )
      const hasError = results.find(r => r.error)
      if (hasError) {
        toast.error(hasError.error)
      } else {
        toast.success("Profissionais da sessão atualizados")
        setIsEditingProfs(false)
        onStatusUpdated()
      }
    } catch {
      toast.error("Erro ao atualizar profissionais")
    } finally {
      setIsSavingProfs(false)
    }
  }

  const { date } = formatDateTime(session.scheduledAt)
  const timeRange = formatTimeRange(session.scheduledAt, session.endAt)

  const handleUpdateStatus = async (
    appointmentId: string,
    newStatus: AppointmentStatus,
    patientName: string
  ) => {
    setUpdatingId(appointmentId)
    try {
      const result = await updateStatus(appointmentId, newStatus)
      if (result.error) {
        toast.error(result.error)
      } else {
        const statusMessages: Record<string, string> = {
          FINALIZADO: `${patientName} marcado como compareceu`,
          CANCELADO_FALTA: `${patientName} marcado como falta`,
          CANCELADO_ACORDADO: `${patientName} marcado como desmarcou`,
          CANCELADO_PROFISSIONAL: `${patientName} marcado como sem cobrança`,
          CONFIRMADO: `${patientName} confirmado`,
          AGENDADO: `${patientName} reagendado`,
        }
        toast.success(statusMessages[newStatus] || "Status atualizado")
        onStatusUpdated()
      }
    } catch {
      toast.error("Erro ao atualizar status")
    } finally {
      setUpdatingId(null)
    }
  }

  // Count statuses for summary
  const statusCounts = session.participants.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={session.groupName}>
      {/* Session Header */}
      <div className="px-4 py-3 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200/50 dark:border-purple-800/50">
        <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 mb-2">
          <UsersIcon className="w-5 h-5" />
          <span className="font-medium">Sessão em Grupo</span>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <p className="capitalize">{date}</p>
          <div className="flex items-center gap-1.5">
            <ClockIcon className="w-4 h-4" />
            <span>{timeRange}</span>
          </div>
          <p className="text-foreground font-medium mt-2">
            {session.professionalName}
          </p>
        </div>

        {/* Status Summary */}
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(statusCounts).map(([status, count]) => (
            <span
              key={status}
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                STATUS_COLORS[status as AppointmentStatus] || "bg-gray-100 text-gray-800"
              }`}
            >
              {count} {STATUS_LABELS[status as AppointmentStatus] || status}
            </span>
          ))}
        </div>
      </div>

      {/* Additional Professionals */}
      {isAdmin && professionals.length > 1 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Profissionais adicionais
            </h3>
            {!isEditingProfs ? (
              <button
                type="button"
                onClick={() => setIsEditingProfs(true)}
                className="text-xs text-primary hover:underline"
              >
                Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveSessionProfessionals}
                  disabled={isSavingProfs}
                  className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {isSavingProfs ? "..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSessionProfIds(
                      session.additionalProfessionals?.map(ap => ap.professionalProfileId) || []
                    )
                    setIsEditingProfs(false)
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {isEditingProfs ? (
            <div className="space-y-2 p-2 rounded-lg border border-input bg-background">
              {professionals
                .filter(p => p.professionalProfile?.id && p.professionalProfile.id !== session.professionalProfileId)
                .map(prof => (
                  <label key={prof.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sessionProfIds.includes(prof.professionalProfile!.id)}
                      onChange={() => {
                        const profId = prof.professionalProfile!.id
                        setSessionProfIds(prev =>
                          prev.includes(profId)
                            ? prev.filter(id => id !== profId)
                            : [...prev, profId]
                        )
                      }}
                      className="w-4 h-4 rounded border-input text-primary focus:ring-ring/40"
                    />
                    <span className="text-sm">{prof.name}</span>
                  </label>
                ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {session.additionalProfessionals && session.additionalProfessionals.length > 0 ? (
                session.additionalProfessionals.map(ap => (
                  <span
                    key={ap.professionalProfileId}
                    className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"
                  >
                    {ap.professionalName}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">Nenhum</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Participants List */}
      <div className="px-4 pt-3 pb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Participantes ({session.participants.length})
        </h3>

        <div className="divide-y divide-border">
          {session.participants.map((participant) => {
            const isUpdating = updatingId === participant.appointmentId
            const isCancelled = ["CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL"].includes(
              participant.status
            )
            const canMarkStatus = ["AGENDADO", "CONFIRMADO"].includes(participant.status)
            const canConfirm = participant.status === "AGENDADO"
            const isFinalized = participant.status === "FINALIZADO"

            return (
              <div
                key={participant.appointmentId}
                className={`py-2.5 ${isCancelled ? "opacity-60" : ""}`}
              >
                {/* Name row */}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm text-foreground truncate ${isFinalized || isCancelled ? "" : "font-medium"}`}>
                      {participant.patientName}
                    </p>
                  </div>
                  {/* Status badge for terminal states */}
                  {(isFinalized || isCancelled) && (
                    <span
                      className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        STATUS_COLORS[participant.status as AppointmentStatus] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {STATUS_LABELS[participant.status as AppointmentStatus] || participant.status}
                    </span>
                  )}
                </div>

                {/* Action buttons for active appointments */}
                {canMarkStatus && (
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {/* Primary action: Confirmar (AGENDADO) or Compareceu (CONFIRMADO) */}
                    {canConfirm ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(participant.appointmentId, "CONFIRMADO", participant.patientName)}
                        disabled={isUpdating}
                        title="Confirmar"
                        className="h-7 px-3 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isUpdating ? "..." : <>
                          <CheckIcon className="w-3.5 h-3.5 inline mr-1" />Confirmar
                        </>}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(participant.appointmentId, "FINALIZADO", participant.patientName)}
                        disabled={isUpdating}
                        title="Compareceu"
                        className="h-7 px-3 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {isUpdating ? "..." : <>
                          <CheckCircleIcon className="w-3.5 h-3.5 inline mr-1" />Compareceu
                        </>}
                      </button>
                    )}
                    {/* Cancel actions */}
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(participant.appointmentId, "CANCELADO_ACORDADO", participant.patientName)}
                      disabled={isUpdating}
                      title="Desmarcou (gera crédito)"
                      className="h-7 px-2 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 dark:hover:text-teal-400 dark:hover:border-teal-700 dark:hover:bg-teal-950/30 disabled:opacity-50 transition-colors"
                    >
                      Desmarcou
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(participant.appointmentId, "CANCELADO_FALTA", participant.patientName)}
                      disabled={isUpdating}
                      title="Faltou (cobra normalmente)"
                      className="h-7 px-2 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:border-amber-700 dark:hover:bg-amber-950/30 disabled:opacity-50 transition-colors"
                    >
                      Faltou
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(participant.appointmentId, "CANCELADO_PROFISSIONAL", participant.patientName)}
                      disabled={isUpdating}
                      title="Sem cobrança (não cobra)"
                      className="h-7 px-2 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                    >
                      Sem cobrança
                    </button>
                  </div>
                )}

                {/* Status change buttons for cancelled appointments */}
                {isCancelled && (
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    <span className="text-[10px] text-muted-foreground mr-1">Alterar:</span>
                    {participant.status !== "CANCELADO_ACORDADO" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(participant.appointmentId, "CANCELADO_ACORDADO", participant.patientName)}
                        disabled={isUpdating}
                        className="h-6 px-2 rounded border border-teal-200 dark:border-teal-800 text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 disabled:opacity-50 transition-colors"
                      >
                        Desmarcou
                      </button>
                    )}
                    {participant.status !== "CANCELADO_FALTA" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(participant.appointmentId, "CANCELADO_FALTA", participant.patientName)}
                        disabled={isUpdating}
                        className="h-6 px-2 rounded border border-amber-200 dark:border-amber-800 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 transition-colors"
                      >
                        Faltou
                      </button>
                    )}
                    {participant.status !== "CANCELADO_PROFISSIONAL" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(participant.appointmentId, "CANCELADO_PROFISSIONAL", participant.patientName)}
                        disabled={isUpdating}
                        className="h-6 px-2 rounded border border-red-200 dark:border-red-800 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                      >
                        Sem cobrança
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(participant.appointmentId, "AGENDADO", participant.patientName)}
                      disabled={isUpdating}
                      title="Reverter para Agendado"
                      className="h-6 px-2 rounded border border-blue-200 dark:border-blue-800 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50 transition-colors"
                    >
                      Reagendar
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <button
          type="button"
          onClick={onClose}
          className="w-full h-10 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted"
        >
          Fechar
        </button>
      </div>
    </Sheet>
  )
}
