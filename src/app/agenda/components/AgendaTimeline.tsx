"use client"

import { SwipeContainer, EmptyState, ClockIcon, BanIcon, PlusIcon } from "@/shared/components/ui"
import { formatTime } from "../lib/utils"
import { AppointmentCard } from "./AppointmentCard"
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

function TimeLabel({ time, hasAppointments }: { time: string; hasAppointments: boolean }) {
  return (
    <div className="w-16 flex-shrink-0 flex flex-col items-end pr-3">
      <span className={`text-sm font-medium ${hasAppointments ? "text-foreground" : "text-muted-foreground"}`}>
        {formatTime(time)}
      </span>
    </div>
  )
}

function TimelineConnector({ isActive }: { isActive: boolean }) {
  return (
    <div className="w-px flex-shrink-0 relative">
      <div className={`absolute top-0 bottom-0 w-px ${isActive ? "bg-primary" : "bg-border"}`} />
      <div className={`absolute top-3 -left-1 w-2.5 h-2.5 rounded-full border-2 ${
        isActive
          ? "bg-primary border-primary"
          : "bg-background border-border"
      }`} />
    </div>
  )
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
    <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} className="max-w-4xl mx-auto px-4 py-6">
      {/* Swipe hint */}
      <p className="text-xs text-muted-foreground text-center mb-6 flex items-center justify-center gap-2">
        <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
        Deslize para mudar o dia
        <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
      </p>

      {timeSlots.length === 0 && (
        <EmptyState
          title="Sem disponibilidade"
          message="Nao ha horarios configurados para este dia"
          icon={<ClockIcon className="w-8 h-8 text-muted-foreground" />}
        />
      )}

      {timeSlots.length > 0 && (
        <div className="space-y-1">
          {timeSlots.map((slot) => {
            const hasAppointments = slot.appointments.length > 0
            const isBlocked = slot.isBlocked
            const showAvailableSlot = !hasAppointments && !isBlocked && (selectedProfessionalId || !isAdmin)

            return (
              <div
                key={slot.time}
                className={`flex items-stretch min-h-[4.5rem] ${isBlocked && !hasAppointments ? "opacity-50" : ""}`}
              >
                <TimeLabel time={slot.time} hasAppointments={hasAppointments} />
                <TimelineConnector isActive={hasAppointments} />

                <div className="flex-1 pl-4 pb-2">
                  {hasAppointments ? (
                    <div className={`space-y-2 ${slot.appointments.length > 1 ? "" : ""}`}>
                      {slot.appointments.map((appointment) => (
                        <AppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          onClick={() => onAppointmentClick(appointment)}
                          showProfessional={!selectedProfessionalId}
                          compact={slot.appointments.length > 1}
                        />
                      ))}
                    </div>
                  ) : isBlocked ? (
                    <div className="h-full min-h-[3rem] bg-muted/30 border border-dashed border-border rounded-xl p-3 flex items-center">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <BanIcon className="w-4 h-4" />
                        <span className="text-sm">{slot.blockReason || "Bloqueado"}</span>
                      </div>
                    </div>
                  ) : showAvailableSlot ? (
                    <button
                      onClick={() => onSlotClick(slot.time)}
                      className="w-full h-full min-h-[3rem] border border-dashed border-border rounded-xl p-3 flex items-center justify-center text-muted-foreground hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-normal group"
                    >
                      <PlusIcon className="w-4 h-4 mr-2 transition-transform group-hover:scale-110" />
                      <span className="text-sm font-medium">Disponivel</span>
                    </button>
                  ) : (
                    // Empty space when viewing all professionals with no appointments
                    <div className="h-full min-h-[3rem]" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SwipeContainer>
  )
}
