"use client"

import { useState } from "react"
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
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="px-4 pt-3 pb-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Participantes ({participants.length})
      </h3>
      <div className="space-y-1">
        {participants.map((p) => (
          <ParticipantRow
            key={p.appointmentId}
            participant={p}
            isExpanded={expandedId === p.appointmentId}
            onToggle={() => setExpandedId(expandedId === p.appointmentId ? null : p.appointmentId)}
            isUpdating={updatingId === p.appointmentId || isBulkUpdating}
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
  isExpanded,
  onToggle,
  isUpdating,
  onUpdateStatus,
  onOpenCancel,
}: {
  participant: Participant
  isExpanded: boolean
  onToggle: () => void
  isUpdating: boolean
  onUpdateStatus: (appointmentId: string, status: string, patientName: string) => void
  onOpenCancel: (variant: CancelVariant, appointmentId: string, patientName: string) => void
}) {
  const isCancelled = CANCELLED_STATUSES.includes(participant.status as AppointmentStatus)
  const isTerminal = isCancelled || participant.status === "FINALIZADO"
  const initial = participant.patientName.charAt(0).toUpperCase()

  return (
    <div className={`rounded-xl transition-colors ${isExpanded ? "bg-muted/40" : ""}`}>
      {/* Compact row — tap to expand */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${isCancelled ? "opacity-50" : ""}`}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
          participant.status === "FINALIZADO"
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
            : participant.status === "CONFIRMADO"
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
            : isCancelled
            ? "bg-muted text-muted-foreground"
            : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400"
        }`}>
          {initial}
        </div>
        <span className="flex-1 min-w-0 text-sm text-foreground truncate">
          {participant.patientName}
        </span>
        <span className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium ${
          STATUS_COLORS[participant.status as AppointmentStatus] || "bg-gray-100 text-gray-800"
        }`}>
          {PARTICIPANT_STATUS_LABELS[participant.status] || participant.status}
        </span>
      </button>

      {/* Expanded actions */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0.5">
          {!isTerminal ? (
            // Active appointment actions
            <div className="flex gap-1.5">
              {participant.status === "AGENDADO" && (
                <ActionButton
                  label="Confirmar"
                  onClick={() => onUpdateStatus(participant.appointmentId, "CONFIRMADO", participant.patientName)}
                  disabled={isUpdating}
                  color="blue"
                />
              )}
              <ActionButton
                label="Compareceu"
                onClick={() => onUpdateStatus(participant.appointmentId, "FINALIZADO", participant.patientName)}
                disabled={isUpdating}
                color="green"
              />
              <ActionButton
                label="Desmarcou"
                onClick={() => onOpenCancel("desmarcou", participant.appointmentId, participant.patientName)}
                disabled={isUpdating}
                color="teal"
                variant="outline"
              />
              <ActionButton
                label="Faltou"
                onClick={() => onOpenCancel("faltou", participant.appointmentId, participant.patientName)}
                disabled={isUpdating}
                color="amber"
                variant="outline"
              />
              <ActionButton
                label="S/ cobr."
                onClick={() => onOpenCancel("sem_cobranca", participant.appointmentId, participant.patientName)}
                disabled={isUpdating}
                color="red"
                variant="outline"
              />
            </div>
          ) : (
            // Terminal state — allow changing
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-0.5">Alterar:</span>
              {isCancelled && (
                <ActionButton
                  label="Reagendar"
                  onClick={() => onUpdateStatus(participant.appointmentId, "AGENDADO", participant.patientName)}
                  disabled={isUpdating}
                  color="blue"
                  variant="outline"
                  small
                />
              )}
              {participant.status !== "CANCELADO_ACORDADO" && participant.status !== "FINALIZADO" && (
                <ActionButton label="Desmarcou" onClick={() => onOpenCancel("desmarcou", participant.appointmentId, participant.patientName)} disabled={isUpdating} color="teal" variant="outline" small />
              )}
              {participant.status !== "CANCELADO_FALTA" && participant.status !== "FINALIZADO" && (
                <ActionButton label="Faltou" onClick={() => onOpenCancel("faltou", participant.appointmentId, participant.patientName)} disabled={isUpdating} color="amber" variant="outline" small />
              )}
              {participant.status !== "CANCELADO_PROFISSIONAL" && participant.status !== "FINALIZADO" && (
                <ActionButton label="S/ cobr." onClick={() => onOpenCancel("sem_cobranca", participant.appointmentId, participant.patientName)} disabled={isUpdating} color="red" variant="outline" small />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const COLOR_MAP = {
  blue: { solid: "bg-blue-600 text-white hover:bg-blue-700", outline: "border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30" },
  green: { solid: "bg-green-600 text-white hover:bg-green-700", outline: "border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-950/30" },
  teal: { solid: "bg-teal-600 text-white hover:bg-teal-700", outline: "border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30" },
  amber: { solid: "bg-amber-600 text-white hover:bg-amber-700", outline: "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30" },
  red: { solid: "bg-red-600 text-white hover:bg-red-700", outline: "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30" },
}

function ActionButton({ label, onClick, disabled, color, variant = "solid", small = false }: {
  label: string; onClick: () => void; disabled: boolean
  color: keyof typeof COLOR_MAP; variant?: "solid" | "outline"; small?: boolean
}) {
  const h = small ? "h-7" : "h-8"
  const text = small ? "text-[11px]" : "text-xs"
  const colors = COLOR_MAP[color][variant]
  const border = variant === "outline" ? "border" : ""
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`${h} px-2 rounded-lg ${border} ${text} font-medium ${colors} disabled:opacity-50 transition-colors`}>
      {label}
    </button>
  )
}
