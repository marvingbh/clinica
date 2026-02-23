"use client"

import { RefreshCwIcon, BanIcon, PlusIcon, ArrowLeftRightIcon } from "@/shared/components/ui/icons"
import { TimeSlot, Appointment, AppointmentStatus } from "../lib/types"
import { STATUS_LABELS, STATUS_COLORS, STATUS_BORDER_COLORS } from "../lib/constants"
import { formatTime, formatPhone, isRecurrenceModified } from "../lib/utils"

interface TimeSlotCardProps {
  slot: TimeSlot
  isAdmin?: boolean
  selectedProfessionalId?: string
  onAppointmentClick: (appointment: Appointment) => void
  onCreateClick: (time: string) => void
  onAlternateWeekClick?: (appointment: Appointment) => void
  onBiweeklyHintClick?: (time: string) => void
}

export function TimeSlotCard({ slot, isAdmin, selectedProfessionalId, onAppointmentClick, onCreateClick, onAlternateWeekClick, onBiweeklyHintClick }: TimeSlotCardProps) {
  return (
    <div className="flex items-stretch gap-3">
      {/* Time Label */}
      <div className="w-14 flex-shrink-0 text-sm text-muted-foreground pt-3">
        {formatTime(slot.time)}
      </div>

      {/* Slot Content */}
      {slot.appointments.length > 0 ? (
        <div className={`flex-1 flex gap-2 ${slot.appointments.length > 1 ? 'flex-wrap' : ''}`}>
          {slot.appointments.map((appointment) => (
            <button
              key={appointment.id}
              onClick={() => onAppointmentClick(appointment)}
              className={`${slot.appointments.length > 1 ? 'flex-1 min-w-[150px]' : 'flex-1'} bg-card border border-border rounded-lg p-3 text-left hover:shadow-md transition-all border-l-4 ${
                STATUS_BORDER_COLORS[appointment.status as AppointmentStatus] || "border-l-gray-500"
              } ${["CANCELADO_PROFISSIONAL", "CANCELADO_ACORDADO", "CANCELADO_FALTA"].includes(appointment.status) ? "opacity-50" : ""}`}
            >
              {/* Professional name - prominent when viewing all */}
              {!selectedProfessionalId && (
                <p className="text-xs font-medium text-primary mb-1 truncate">
                  {appointment.professionalProfile.user.name}
                  {(appointment.additionalProfessionals?.length ?? 0) > 0 && (
                    <span className="text-muted-foreground font-normal"> +{appointment.additionalProfessionals!.length}</span>
                  )}
                </p>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-foreground truncate">
                    {appointment.patient?.name || appointment.title || "Sem titulo"}
                  </h4>
                  {appointment.patient?.motherName && (
                    <p className="text-xs text-muted-foreground truncate">
                      Mãe: {appointment.patient.motherName}
                    </p>
                  )}
                  {appointment.patient && (
                    <p className="text-sm text-muted-foreground">
                      {formatPhone(appointment.patient.phone)}
                    </p>
                  )}
                </div>
                <span
                  className={`flex-shrink-0 text-xs px-2 py-1 rounded-full border ${
                    STATUS_COLORS[appointment.status as AppointmentStatus] || "bg-gray-100 text-gray-800"
                  }`}
                >
                  {STATUS_LABELS[appointment.status as AppointmentStatus] || appointment.status}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {appointment.modality && (
                  <span className="text-xs text-muted-foreground">
                    {appointment.modality === "ONLINE" ? "Online" : "Presencial"}
                  </span>
                )}
                {appointment.recurrence && (
                  <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <RefreshCwIcon className="w-3 h-3" />
                    {appointment.recurrence.recurrenceType === "WEEKLY" ? "Semanal" :
                     appointment.recurrence.recurrenceType === "BIWEEKLY" ? "Quinzenal" : "Mensal"}
                    {isRecurrenceModified(appointment) && (
                      <span className="text-amber-600 dark:text-amber-400"> · alterado</span>
                    )}
                  </span>
                )}
                {appointment.notes && (
                  <span className="text-xs text-muted-foreground truncate">
                    • {appointment.notes}
                  </span>
                )}
              </div>
              {/* Alternate week info for biweekly appointments */}
              {appointment.recurrence?.recurrenceType === "BIWEEKLY" && appointment.alternateWeekInfo && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAlternateWeekClick?.(appointment)
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onAlternateWeekClick?.(appointment) } }}
                  className="mt-1.5 text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1 hover:text-purple-800 dark:hover:text-purple-200 cursor-pointer transition-colors"
                >
                  <ArrowLeftRightIcon className="w-3 h-3" />
                  <span>Alterna com:</span>
                  {appointment.alternateWeekInfo.pairedPatientName ? (
                    <span className="font-medium underline">{appointment.alternateWeekInfo.pairedPatientName}</span>
                  ) : appointment.alternateWeekInfo.isAvailable ? (
                    <span className="text-green-600 dark:text-green-400 font-medium underline">Disponivel - Agendar</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-medium">Bloqueado</span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      ) : slot.isBlocked ? (
        <div className="flex-1 bg-muted/50 border border-dashed border-border rounded-lg p-3 flex items-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <BanIcon className="w-4 h-4" />
            <span className="text-sm">
              {slot.blockReason || "Bloqueado"}
            </span>
          </div>
        </div>
      ) : (
        // Only show available slots when a specific professional is selected
        selectedProfessionalId || !isAdmin ? (
          slot.biweeklyHint ? (
            <button
              onClick={() => onBiweeklyHintClick?.(slot.time)}
              className="flex-1 border border-dashed border-purple-300 dark:border-purple-700 rounded-lg p-3 flex items-center text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-400 dark:hover:border-purple-600 transition-colors cursor-pointer"
            >
              <ArrowLeftRightIcon className="w-4 h-4 mr-2 flex-shrink-0" />
              <span className="text-sm">
                Disponivel p/ quinzenal <span className="mx-1">·</span> Alterna com: <span className="font-medium">{slot.biweeklyHint.patientName}</span>
              </span>
            </button>
          ) : (
            <button
              onClick={() => onCreateClick(slot.time)}
              className="flex-1 border border-dashed border-border rounded-lg p-3 flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              <span className="text-sm">Disponivel</span>
            </button>
          )
        ) : (
          // Empty placeholder when viewing all professionals (no appointments at this time)
          <div className="flex-1 border border-dashed border-border/50 rounded-lg p-3" />
        )
      )}
    </div>
  )
}
