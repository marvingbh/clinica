"use client"

import { TimeSlot, Appointment, AppointmentStatus } from "../lib/types"
import { STATUS_LABELS, STATUS_COLORS, STATUS_BORDER_COLORS } from "../lib/constants"
import { formatTime, formatPhone } from "../lib/utils"

interface TimeSlotCardProps {
  slot: TimeSlot
  isAdmin?: boolean
  selectedProfessionalId?: string
  onAppointmentClick: (appointment: Appointment) => void
  onCreateClick: (time: string) => void
}

export function TimeSlotCard({ slot, isAdmin, selectedProfessionalId, onAppointmentClick, onCreateClick }: TimeSlotCardProps) {
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
              } ${["CANCELADO_PROFISSIONAL", "CANCELADO_PACIENTE"].includes(appointment.status) ? "opacity-50" : ""}`}
            >
              {/* Professional name - prominent when viewing all */}
              {!selectedProfessionalId && (
                <p className="text-xs font-medium text-primary mb-1 truncate">
                  {appointment.professionalProfile.user.name}
                </p>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-foreground truncate">
                    {appointment.patient.name}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {formatPhone(appointment.patient.phone)}
                  </p>
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
                <span className="text-xs text-muted-foreground">
                  {appointment.modality === "ONLINE" ? "Online" : "Presencial"}
                </span>
                {appointment.recurrence && (
                  <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Recorrente
                  </span>
                )}
                {appointment.notes && (
                  <span className="text-xs text-muted-foreground truncate">
                    • {appointment.notes}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : slot.isBlocked ? (
        <div className="flex-1 bg-muted/50 border border-dashed border-border rounded-lg p-3 flex items-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <span className="text-sm">
              {slot.blockReason || "Bloqueado"}
            </span>
          </div>
        </div>
      ) : (
        // Only show available slots when a specific professional is selected
        selectedProfessionalId || !isAdmin ? (
          <button
            onClick={() => onCreateClick(slot.time)}
            className="flex-1 border border-dashed border-border rounded-lg p-3 flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm">Disponivel</span>
          </button>
        ) : (
          // Empty placeholder when viewing all professionals (no appointments at this time)
          <div className="flex-1 border border-dashed border-border/50 rounded-lg p-3" />
        )
      )}
    </div>
  )
}
