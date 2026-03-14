"use client"

import { useState, useEffect } from "react"
import { SwipeContainer, EmptyState, ClockIcon, BanIcon } from "@/shared/components/ui"
import type { BirthdayPatient } from "../services/appointmentService"
import { DailyOverviewGrid } from "./DailyOverviewGrid"
import { AgendaTimelineSkeleton } from "./AgendaSkeleton"
import type { TimeSlot, Appointment, GroupSession } from "../lib/types"
import type { FullDayBlock } from "../hooks/useTimeSlots"
import { ProfessionalColorMap } from "../lib/professional-colors"

export interface AgendaTimelineProps {
  appointments?: Appointment[]
  timeSlots: TimeSlot[]
  groupSessions: GroupSession[]
  birthdayPatients?: BirthdayPatient[]
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
  canWriteAgenda?: boolean
}

export function AgendaTimeline({
  appointments = [],
  timeSlots,
  groupSessions,
  birthdayPatients = [],
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
  canWriteAgenda = false,
}: AgendaTimelineProps) {
  // "Now" indicator — update every minute (must be before any early returns)
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Show skeleton while loading data
  if (isLoading) {
    return <AgendaTimelineSkeleton />
  }

  const birthdayBanner = birthdayPatients.length > 0 ? (
    <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
      {birthdayPatients.map(p => (
        <p key={p.id} className="text-sm font-medium text-amber-800 dark:text-amber-200">
          <span className="mr-1.5">🎂</span>
          {p.name}
        </p>
      ))}
    </div>
  ) : null

  // Admin "Todos" mode: time-proportional grid with all professionals
  if (isAdmin && !selectedProfessionalId) {
    return (
      <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} className="max-w-4xl mx-auto px-4 py-6">
        {/* Swipe hint */}
        <p className="text-xs text-muted-foreground text-center mb-6 flex items-center justify-center gap-2">
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
          Deslize para mudar o dia
          <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
        </p>

        {birthdayBanner}

        <DailyOverviewGrid
          appointments={appointments}
          groupSessions={groupSessions}
          selectedDate={selectedDate}
          showProfessional
          professionalColorMap={professionalColorMap}
          onAppointmentClick={onAppointmentClick}
          onGroupSessionClick={onGroupSessionClick}
          onSlotClick={onSlotClick}
        />
      </SwipeContainer>
    )
  }

  // Compute appointment duration from time slot intervals
  const computedDuration = timeSlots.length >= 2
    ? (() => {
        const [h1, m1] = timeSlots[0].time.split(":").map(Number)
        const [h2, m2] = timeSlots[1].time.split(":").map(Number)
        return (h2 * 60 + m2) - (h1 * 60 + m1)
      })()
    : 50

  // Single professional view: time-proportional grid with column layout
  return (
    <SwipeContainer onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} className="max-w-4xl mx-auto px-4 py-6">
      {/* Swipe hint */}
      <p className="text-xs text-muted-foreground text-center mb-6 flex items-center justify-center gap-2">
        <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
        Deslize para mudar o dia
        <span className="w-8 h-0.5 bg-muted-foreground/30 rounded-full" />
      </p>

      {birthdayBanner}

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
        <DailyOverviewGrid
          appointments={appointments}
          groupSessions={groupSessions}
          selectedDate={selectedDate}
          onAppointmentClick={onAppointmentClick}
          onGroupSessionClick={onGroupSessionClick}
          onSlotClick={onSlotClick}
          timeSlots={timeSlots}
          appointmentDuration={computedDuration}
          onBiweeklyHintClick={onBiweeklyHintClick}
          canWriteAgenda={canWriteAgenda}
        />
      )}
    </SwipeContainer>
  )
}
