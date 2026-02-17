"use client"

import { SwipeContainer, EmptyState, ClockIcon, BanIcon, PlusIcon } from "@/shared/components/ui"
import { ArrowLeftRightIcon } from "@/shared/components/ui/icons"
import { formatTime, isSlotInPast } from "../lib/utils"
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from "../lib/constants"
import { AppointmentCard } from "./AppointmentCard"
import { GroupSessionCard } from "./GroupSessionCard"
import { AgendaTimelineSkeleton } from "./AgendaSkeleton"
import type { TimeSlot, Appointment, GroupSession, CalendarEntryType } from "../lib/types"
import type { FullDayBlock } from "../hooks/useTimeSlots"
import { ProfessionalColorMap } from "../lib/professional-colors"

export interface AgendaTimelineProps {
  timeSlots: TimeSlot[]
  groupSessions: GroupSession[]
  fullDayBlock: FullDayBlock | null
  selectedDate: string
  selectedProfessionalId: string
  isAdmin: boolean
  isLoading?: boolean
  onSlotClick: (slotTime: string) => void
  onAppointmentClick: (appointment: Appointment) => void
  onGroupSessionClick: (session: GroupSession) => void
  onAlternateWeekClick?: (appointment: Appointment) => void
  onBiweeklyHintClick?: (time: string) => void
  onSwipeLeft: () => void
  onSwipeRight: () => void
  professionalColorMap?: ProfessionalColorMap
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

// Helper to get time string (HH:mm) from ISO date
function getTimeFromISO(isoString: string): string {
  const date = new Date(isoString)
  return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`
}

export function AgendaTimeline({
  timeSlots,
  groupSessions,
  fullDayBlock,
  selectedDate,
  selectedProfessionalId,
  isAdmin,
  isLoading = false,
  onSlotClick,
  onAppointmentClick,
  onGroupSessionClick,
  onAlternateWeekClick,
  onBiweeklyHintClick,
  onSwipeLeft,
  onSwipeRight,
  professionalColorMap,
}: AgendaTimelineProps) {
  // Show skeleton while loading data
  if (isLoading) {
    return <AgendaTimelineSkeleton />
  }
  // Create a map of group sessions by their start time
  const groupSessionsByTime = new Map<string, GroupSession[]>()
  for (const session of groupSessions) {
    const time = getTimeFromISO(session.scheduledAt)
    const existing = groupSessionsByTime.get(time) || []
    groupSessionsByTime.set(time, [...existing, session])
  }

  // Build group session time ranges for overlap checking
  const groupSessionRanges = groupSessions.map((session) => {
    const start = new Date(session.scheduledAt)
    const end = new Date(session.endAt)
    return {
      startMin: start.getHours() * 60 + start.getMinutes(),
      endMin: end.getHours() * 60 + end.getMinutes(),
    }
  })

  // Pre-compute which slots to hide (within ongoing group sessions)
  // and how many extra slots each group session start spans
  const hiddenSlotTimes = new Set<string>()
  const groupSessionSpanCount = new Map<string, number>()

  for (const session of groupSessions) {
    const startTime = getTimeFromISO(session.scheduledAt)
    const endTime = getTimeFromISO(session.endAt)
    let count = 0
    for (const slot of timeSlots) {
      if (slot.time > startTime && slot.time < endTime) {
        hiddenSlotTimes.add(slot.time)
        count++
      }
    }
    if (count > 0) {
      groupSessionSpanCount.set(startTime, Math.max(groupSessionSpanCount.get(startTime) || 0, count))
    }
  }

  return (
    <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} className="max-w-4xl mx-auto px-4 py-6">
      {/* Swipe hint */}
      <p className="text-xs text-muted-foreground text-center mb-6 flex items-center justify-center gap-2">
        <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
        Deslize para mudar o dia
        <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
      </p>

      {/* Full day block message */}
      {fullDayBlock && (
        <EmptyState
          title={fullDayBlock.reason || "Dia bloqueado"}
          message={fullDayBlock.isClinicWide
            ? "Bloqueio para toda a clínica"
            : "Bloqueio de disponibilidade"}
          icon={<BanIcon className="w-8 h-8 text-red-500" />}
        />
      )}

      {/* No availability (no block, just no rules configured) */}
      {timeSlots.length === 0 && !fullDayBlock && (
        <EmptyState
          title="Sem disponibilidade"
          message="Não há horários configurados para este dia"
          icon={<ClockIcon className="w-8 h-8 text-muted-foreground" />}
        />
      )}

      {timeSlots.length > 0 && (
        <div className="space-y-1">
          {timeSlots.map((slot) => {
            // Skip slots hidden by an ongoing group session (they're visually merged into the session start slot)
            if (hiddenSlotTimes.has(slot.time)) return null

            const hasAppointments = slot.appointments.length > 0
            const slotGroupSessions = groupSessionsByTime.get(slot.time) || []
            const hasGroupSessions = slotGroupSessions.length > 0
            const [slotH, slotM] = slot.time.split(":").map(Number)
            const slotMin = slotH * 60 + slotM
            const isOccupiedByOngoingSession = groupSessionRanges.some(
              (r) => r.startMin < slotMin && r.endMin > slotMin
            )
            const hasContent = hasAppointments || hasGroupSessions
            const isBlocked = slot.isBlocked
            const isPast = isSlotInPast(selectedDate, slot.time)
            const canShowAvailableButton = slot.isAvailable && !isBlocked && !isPast && (!!selectedProfessionalId || !isAdmin)

            // Check if all appointments in the slot are cancelled
            const cancelledStatuses = ["CANCELADO_PACIENTE", "CANCELADO_PROFISSIONAL"]
            const allAppointmentsCancelled = hasAppointments && slot.appointments.every(
              apt => cancelledStatuses.includes(apt.status)
            )

            // Show available slot button when no appointments/groups, or when all appointments are cancelled
            const showAvailableSlot = !hasContent && canShowAvailableButton
            const showAvailableWithCancelled = allAppointmentsCancelled && !hasGroupSessions && canShowAvailableButton

            // Determine if the timeline connector should be active
            const hasActiveContent = (hasAppointments && !allAppointmentsCancelled) || hasGroupSessions

            // Filter out appointments that belong to a group session (they're shown in the group card)
            const individualAppointments = slot.appointments.filter(apt => !apt.groupId)
            // Split into blocking (full cards) and non-blocking (indicator chips)
            const blockingAppointments = individualAppointments.filter(apt => apt.blocksTime)
            const nonBlockingAppointments = individualAppointments.filter(apt => !apt.blocksTime)
            const hasBlockingAppointments = blockingAppointments.length > 0
            const hasNonBlockingAppointments = nonBlockingAppointments.length > 0
            const hasIndividualAppointments = individualAppointments.length > 0
            const hasAnyContent = hasIndividualAppointments || hasGroupSessions

            // Recalculate allAppointmentsCancelled for blocking appointments only
            const allBlockingCancelled = hasBlockingAppointments && blockingAppointments.every(
              apt => cancelledStatuses.includes(apt.status)
            )
            // Show available button based on blocking content only:
            // 1. All blocking appointments are cancelled, or
            // 2. Only non-blocking entries exist (no blocking appointments at all)
            const noActiveBlockingContent = !hasGroupSessions && !isOccupiedByOngoingSession && (
              (hasBlockingAppointments && allBlockingCancelled) ||
              (!hasBlockingAppointments)
            )
            const showAvailableWithCancelledRecalc = noActiveBlockingContent && canShowAvailableButton
            // Non-blocking entries alone don't make the slot "active"
            const hasActiveContentRecalc = (hasBlockingAppointments && !allBlockingCancelled) || hasGroupSessions || isOccupiedByOngoingSession

            // Extra height for group sessions that span multiple slots
            const extraSpan = groupSessionSpanCount.get(slot.time) || 0

            return (
              <div
                key={slot.time}
                className={`flex items-stretch min-h-[4.5rem] ${isBlocked && !hasAnyContent ? "opacity-50" : ""}`}
                style={extraSpan > 0 ? { minHeight: `${4.5 + extraSpan * 4.75}rem` } : undefined}
              >
                <TimeLabel time={slot.time} hasAppointments={hasActiveContentRecalc} />
                <TimelineConnector isActive={hasActiveContentRecalc} />

                <div className="flex-1 pl-4 pb-2">
                  <div className="space-y-1.5">
                    {/* Main slot content: blocking appointments, group sessions, available button, or blocked message */}
                    {(hasBlockingAppointments || hasGroupSessions) ? (
                      <div className="flex flex-wrap gap-2">
                        {slotGroupSessions.map((session) => (
                          <div key={`group-${session.groupId}-${session.scheduledAt}`} className="flex-1 min-w-0">
                            <GroupSessionCard
                              session={session}
                              onClick={() => onGroupSessionClick(session)}
                              showProfessional={!selectedProfessionalId}
                              compact={hasBlockingAppointments || slotGroupSessions.length > 1}
                            />
                          </div>
                        ))}
                        {blockingAppointments.map((appointment) => (
                          <div key={appointment.id} className="flex-1 min-w-0">
                            <AppointmentCard
                              appointment={appointment}
                              onClick={() => onAppointmentClick(appointment)}
                              onAlternateWeekClick={onAlternateWeekClick}
                              showProfessional={!selectedProfessionalId}
                              compact={blockingAppointments.length > 1 || hasGroupSessions || showAvailableWithCancelledRecalc}
                              professionalColorMap={professionalColorMap}
                            />
                          </div>
                        ))}
                        {showAvailableWithCancelledRecalc && (
                          slot.biweeklyHint ? (
                            <button
                              onClick={() => onBiweeklyHintClick?.(slot.time)}
                              className="flex-1 min-w-0 min-h-[3rem] border border-dashed border-purple-300 dark:border-purple-700 rounded-xl p-3 flex items-center text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-400 dark:hover:border-purple-600 transition-all duration-normal group"
                            >
                              <ArrowLeftRightIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                              <span className="text-sm font-medium">
                                Disponivel p/ quinzenal <span className="mx-1 font-normal">·</span> Alterna com: {slot.biweeklyHint.patientName}
                              </span>
                            </button>
                          ) : (
                            <button
                              onClick={() => onSlotClick(slot.time)}
                              className="flex-1 min-w-0 min-h-[3rem] border border-dashed border-border rounded-xl p-3 flex items-center justify-center text-muted-foreground hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-normal group"
                            >
                              <PlusIcon className="w-4 h-4 mr-2 transition-transform group-hover:scale-110" />
                              <span className="text-sm font-medium">Disponivel</span>
                            </button>
                          )
                        )}
                      </div>
                    ) : isBlocked && !hasNonBlockingAppointments ? (
                      <div className="h-full min-h-[3rem] bg-muted/30 border border-dashed border-border rounded-xl p-3 flex items-center">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <BanIcon className="w-4 h-4" />
                          <span className="text-sm">{slot.blockReason || "Bloqueado"}</span>
                        </div>
                      </div>
                    ) : canShowAvailableButton ? (
                      slot.biweeklyHint ? (
                        <button
                          onClick={() => onBiweeklyHintClick?.(slot.time)}
                          className="w-full h-full min-h-[3rem] border border-dashed border-purple-300 dark:border-purple-700 rounded-xl p-3 flex items-center text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-400 dark:hover:border-purple-600 transition-all duration-normal group"
                        >
                          <ArrowLeftRightIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                          <span className="text-sm font-medium">
                            Disponivel p/ quinzenal <span className="mx-1 font-normal">·</span> Alterna com: {slot.biweeklyHint.patientName}
                          </span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onSlotClick(slot.time)}
                          className="w-full h-full min-h-[3rem] border border-dashed border-border rounded-xl p-3 flex items-center justify-center text-muted-foreground hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-normal group"
                        >
                          <PlusIcon className="w-4 h-4 mr-2 transition-transform group-hover:scale-110" />
                          <span className="text-sm font-medium">Disponivel</span>
                        </button>
                      )
                    ) : !hasNonBlockingAppointments ? (
                      <div className="h-full min-h-[3rem]" />
                    ) : null}

                    {/* Non-blocking entries always shown as indicator chips */}
                    {hasNonBlockingAppointments && (
                      <div className="flex flex-wrap gap-1.5 pl-1">
                        {nonBlockingAppointments.map((appointment) => {
                          const entryColors = ENTRY_TYPE_COLORS[appointment.type as CalendarEntryType]
                          return (
                            <button
                              key={appointment.id}
                              onClick={() => onAppointmentClick(appointment)}
                              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border cursor-pointer hover:opacity-80 transition-opacity ${
                                entryColors ? `${entryColors.bg} ${entryColors.text} ${entryColors.border}` : "bg-muted text-muted-foreground border-border"
                              }`}
                            >
                              <span className="font-medium">{ENTRY_TYPE_LABELS[appointment.type as CalendarEntryType] || appointment.type}</span>
                              {appointment.title && (
                                <span className="truncate max-w-[120px]">{appointment.title}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SwipeContainer>
  )
}
