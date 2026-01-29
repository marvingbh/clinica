"use client"

import { SwipeContainer, EmptyState } from "@/shared/components/ui"
import { formatTime, formatPhone } from "../lib/utils"
import { STATUS_LABELS, STATUS_COLORS, STATUS_BORDER_COLORS } from "../lib/constants"
import type { TimeSlot, Appointment } from "../lib/types"

export interface AgendaTimelineProps {
  timeSlots: TimeSlot[]
  selectedProfessionalId: string
  isAdmin: boolean
  onSlotClick: (slotTime: string) => void
  onAppointmentClick: (appointment: Appointment) => void
  onSwipeLeft: () => void
  onSwipeRight: () => void
}

export function AgendaTimeline({
  timeSlots,
  selectedProfessionalId,
  isAdmin,
  onSlotClick,
  onAppointmentClick,
  onSwipeLeft,
  onSwipeRight,
}: AgendaTimelineProps) {
  return (
    <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} className="max-w-4xl mx-auto px-4 py-4">
      <p className="text-xs text-muted-foreground text-center mb-4">
        Deslize para esquerda ou direita para mudar o dia
      </p>

      {timeSlots.length === 0 && (
        <EmptyState
          title="Sem disponibilidade"
          message="Nao ha horarios configurados para este dia"
          icon={
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      )}

      {timeSlots.length > 0 && (
        <div className="space-y-2">
          {timeSlots.map((slot) => (
            <div
              key={slot.time}
              className={`flex items-stretch gap-3 min-h-[4rem] ${slot.isBlocked ? "opacity-50" : ""}`}
            >
              <div className="w-14 flex-shrink-0 text-sm text-muted-foreground pt-2">
                {formatTime(slot.time)}
              </div>

              {slot.appointments.length > 0 ? (
                <div className={`flex-1 flex gap-2 ${slot.appointments.length > 1 ? "flex-wrap" : ""}`}>
                  {slot.appointments.map((appointment) => (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => onAppointmentClick(appointment)}
                      className={`${
                        slot.appointments.length > 1 ? "flex-1 min-w-[150px]" : "flex-1"
                      } bg-card border border-border rounded-lg p-3 border-l-4 text-left hover:bg-muted/50 transition-colors cursor-pointer ${
                        STATUS_BORDER_COLORS[appointment.status] || "border-l-gray-400"
                      } ${
                        ["CANCELADO_PROFISSIONAL", "CANCELADO_PACIENTE"].includes(appointment.status)
                          ? "opacity-50"
                          : ""
                      }`}
                    >
                      {/* Professional name - prominent when viewing all */}
                      {!selectedProfessionalId && (
                        <p className="text-xs font-medium text-primary mb-1 truncate">
                          {appointment.professionalProfile.user.name}
                        </p>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-foreground truncate">{appointment.patient.name}</h4>
                          <p className="text-sm text-muted-foreground">{formatPhone(appointment.patient.phone)}</p>
                        </div>
                        <span
                          className={`flex-shrink-0 text-xs px-2 py-1 rounded-full border ${
                            STATUS_COLORS[appointment.status] || "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {STATUS_LABELS[appointment.status] || appointment.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">
                          {appointment.modality === "ONLINE" ? "Online" : "Presencial"}
                        </span>
                        {appointment.recurrence && (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                            Recorrente
                          </span>
                        )}
                        {appointment.notes && (
                          <span className="text-xs text-muted-foreground truncate">• {appointment.notes}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : slot.isBlocked ? (
                <div className="flex-1 bg-muted/50 border border-dashed border-border rounded-lg p-3 flex items-center">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                      />
                    </svg>
                    <span className="text-sm">{slot.blockReason || "Bloqueado"}</span>
                  </div>
                </div>
              ) : // Only show available slots when a specific professional is selected
              selectedProfessionalId || !isAdmin ? (
                <button
                  onClick={() => onSlotClick(slot.time)}
                  className="flex-1 border border-dashed border-border rounded-lg p-3 flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm">Disponivel</span>
                </button>
              ) : (
                // Empty placeholder when viewing all professionals (no appointments at this time)
                <div className="flex-1 border border-dashed border-border/50 rounded-lg p-3" />
              )}
            </div>
          ))}
        </div>
      )}
    </SwipeContainer>
  )
}
