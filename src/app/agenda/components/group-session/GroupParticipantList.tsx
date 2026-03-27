"use client"

import { CheckCircleIcon, CheckIcon } from "@/shared/components/ui/icons"
import { STATUS_COLORS, CANCELLED_STATUSES } from "../../lib/constants"
import { PARTICIPANT_STATUS_LABELS, type AppointmentStatus, type CancelVariant } from "./types"

interface Participant {
  appointmentId: string
  patientId: string
  patientName: string
  status: string
}

interface GroupParticipantListProps {
  participants: Participant[]
  updatingId: string | null
  isBulkUpdating: boolean
  onUpdateStatus: (appointmentId: string, status: string, patientName: string) => void
  onOpenCancel: (variant: CancelVariant, appointmentId: string, patientName: string) => void
}

export function GroupParticipantList({
  participants,
  updatingId,
  isBulkUpdating,
  onUpdateStatus,
  onOpenCancel,
}: GroupParticipantListProps) {
  return (
    <div className="px-4 pt-3 pb-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Participantes ({participants.length})
      </h3>

      <div className="divide-y divide-border">
        {participants.map((participant) => (
          <ParticipantRow
            key={participant.appointmentId}
            participant={participant}
            isUpdating={updatingId === participant.appointmentId || isBulkUpdating}
            onUpdateStatus={onUpdateStatus}
            onOpenCancel={onOpenCancel}
          />
        ))}
      </div>
    </div>
  )
}

function ParticipantRow({
  participant,
  isUpdating,
  onUpdateStatus,
  onOpenCancel,
}: {
  participant: Participant
  isUpdating: boolean
  onUpdateStatus: (appointmentId: string, status: string, patientName: string) => void
  onOpenCancel: (variant: CancelVariant, appointmentId: string, patientName: string) => void
}) {
  const isCancelled = CANCELLED_STATUSES.includes(participant.status as AppointmentStatus)
  const canMarkStatus = ["AGENDADO", "CONFIRMADO"].includes(participant.status)
  const canConfirm = participant.status === "AGENDADO"
  const isFinalized = participant.status === "FINALIZADO"

  return (
    <div className={`py-2.5 ${isCancelled ? "opacity-60" : ""}`}>
      {/* Name row */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-sm text-foreground truncate ${isFinalized || isCancelled ? "" : "font-medium"}`}>
            {participant.patientName}
          </p>
        </div>
        {(isFinalized || isCancelled) && (
          <span className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[participant.status as AppointmentStatus] || "bg-gray-100 text-gray-800"}`}>
            {PARTICIPANT_STATUS_LABELS[participant.status] || participant.status}
          </span>
        )}
      </div>

      {/* Action buttons for active appointments */}
      {canMarkStatus && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {canConfirm ? (
            <>
              <button type="button" onClick={() => onUpdateStatus(participant.appointmentId, "CONFIRMADO" , participant.patientName)} disabled={isUpdating} title="Confirmar" className="h-7 px-3 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {isUpdating ? "..." : <><CheckIcon className="w-3.5 h-3.5 inline mr-1" />Confirmar</>}
              </button>
              <button type="button" onClick={() => onUpdateStatus(participant.appointmentId, "FINALIZADO" , participant.patientName)} disabled={isUpdating} title="Compareceu" className="h-7 px-3 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                {isUpdating ? "..." : <><CheckCircleIcon className="w-3.5 h-3.5 inline mr-1" />Compareceu</>}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => onUpdateStatus(participant.appointmentId, "FINALIZADO" , participant.patientName)} disabled={isUpdating} title="Compareceu" className="h-7 px-3 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              {isUpdating ? "..." : <><CheckCircleIcon className="w-3.5 h-3.5 inline mr-1" />Compareceu</>}
            </button>
          )}
          <CancelButtons appointmentId={participant.appointmentId} patientName={participant.patientName} isUpdating={isUpdating} onOpenCancel={onOpenCancel} size="normal" />
        </div>
      )}

      {/* Status change buttons for cancelled appointments */}
      {isCancelled && (
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1">Alterar:</span>
          {participant.status !== "CANCELADO_ACORDADO" && (
            <button type="button" onClick={() => onOpenCancel("desmarcou", participant.appointmentId, participant.patientName)} disabled={isUpdating} className="h-6 px-2 rounded border border-teal-200 dark:border-teal-800 text-[10px] font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 disabled:opacity-50 transition-colors">
              Desmarcou
            </button>
          )}
          {participant.status !== "CANCELADO_FALTA" && (
            <button type="button" onClick={() => onOpenCancel("faltou", participant.appointmentId, participant.patientName)} disabled={isUpdating} className="h-6 px-2 rounded border border-amber-200 dark:border-amber-800 text-[10px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 transition-colors">
              Faltou
            </button>
          )}
          {participant.status !== "CANCELADO_PROFISSIONAL" && (
            <button type="button" onClick={() => onOpenCancel("sem_cobranca", participant.appointmentId, participant.patientName)} disabled={isUpdating} className="h-6 px-2 rounded border border-red-200 dark:border-red-800 text-[10px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors">
              Sem cobrança
            </button>
          )}
          <button type="button" onClick={() => onUpdateStatus(participant.appointmentId, "AGENDADO" , participant.patientName)} disabled={isUpdating} title="Reverter para Agendado" className="h-6 px-2 rounded border border-blue-200 dark:border-blue-800 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50 transition-colors">
            Reagendar
          </button>
        </div>
      )}
    </div>
  )
}

function CancelButtons({
  appointmentId, patientName, isUpdating, onOpenCancel, size,
}: {
  appointmentId: string; patientName: string; isUpdating: boolean
  onOpenCancel: (variant: CancelVariant, appointmentId: string, patientName: string) => void
  size: "normal" | "small"
}) {
  const h = size === "small" ? "h-6" : "h-7"
  const text = size === "small" ? "text-[10px]" : "text-[11px]"
  return (
    <>
      <button type="button" onClick={() => onOpenCancel("desmarcou", appointmentId, patientName)} disabled={isUpdating} title="Desmarcou (gera crédito)" className={`${h} px-2 rounded border border-border ${text} font-medium text-muted-foreground hover:text-teal-600 hover:border-teal-300 hover:bg-teal-50 dark:hover:text-teal-400 dark:hover:border-teal-700 dark:hover:bg-teal-950/30 disabled:opacity-50 transition-colors`}>
        Desmarcou
      </button>
      <button type="button" onClick={() => onOpenCancel("faltou", appointmentId, patientName)} disabled={isUpdating} title="Faltou (cobra normalmente)" className={`${h} px-2 rounded border border-border ${text} font-medium text-muted-foreground hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:border-amber-700 dark:hover:bg-amber-950/30 disabled:opacity-50 transition-colors`}>
        Faltou
      </button>
      <button type="button" onClick={() => onOpenCancel("sem_cobranca", appointmentId, patientName)} disabled={isUpdating} title="Sem cobrança (não cobra)" className={`${h} px-2 rounded border border-border ${text} font-medium text-muted-foreground hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors`}>
        Sem cobrança
      </button>
    </>
  )
}
