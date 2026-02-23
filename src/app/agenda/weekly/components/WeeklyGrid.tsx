"use client"

import { useMemo, useRef, useEffect } from "react"
import { Appointment, GroupSession, TimeSlot } from "../../lib/types"
import { getWeekDays, toDateString, isSameDay, isWeekend } from "../../lib/utils"
import { DayHeader } from "./DayHeader"
import { AppointmentBlock } from "./AppointmentBlock"
import { GroupSessionBlock } from "./GroupSessionBlock"
import { AvailabilitySlotBlock } from "./AvailabilitySlotBlock"
import { createProfessionalColorMap } from "../../lib/professional-colors"

const START_HOUR = 7
const END_HOUR = 21
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const PIXELS_PER_MINUTE = 1.6 // 48px per 30 minutes = 96px per hour
const HOUR_HEIGHT = 60 * PIXELS_PER_MINUTE // 96px per hour

interface BirthdayPatient {
  id: string
  name: string
  date?: string
}

interface WeeklyGridProps {
  weekStart: Date
  appointments: Appointment[]
  groupSessions?: GroupSession[]
  availabilitySlots?: Map<string, TimeSlot[]>
  appointmentDuration?: number
  birthdayPatients?: BirthdayPatient[]
  onAppointmentClick: (appointment: Appointment) => void
  onGroupSessionClick?: (session: GroupSession) => void
  onAlternateWeekClick?: (appointment: Appointment) => void
  onAvailabilitySlotClick?: (date: string, time: string) => void
  onBiweeklyHintClick?: (date: string, time: string) => void
  showProfessional?: boolean
}

interface AppointmentWithLayout extends Appointment {
  columnIndex: number
  totalColumns: number
}

// Check if two appointments overlap in time
function appointmentsOverlap(a: Appointment, b: Appointment): boolean {
  const aStart = new Date(a.scheduledAt).getTime()
  const aEnd = new Date(a.endAt).getTime()
  const bStart = new Date(b.scheduledAt).getTime()
  const bEnd = new Date(b.endAt).getTime()

  return aStart < bEnd && bStart < aEnd
}

// Calculate layout for overlapping appointments
function calculateAppointmentLayout(appointments: Appointment[]): AppointmentWithLayout[] {
  if (appointments.length === 0) return []

  // Sort by start time
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  )

  const result: AppointmentWithLayout[] = []
  const columns: Appointment[][] = []

  for (const apt of sorted) {
    // Find a column where this appointment doesn't overlap with the last one
    let placed = false
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const lastInColumn = columns[colIndex][columns[colIndex].length - 1]
      if (!appointmentsOverlap(lastInColumn, apt)) {
        columns[colIndex].push(apt)
        placed = true
        break
      }
    }

    // If no suitable column found, create a new one
    if (!placed) {
      columns.push([apt])
    }
  }

  // Assign column indices to appointments
  const appointmentColumnMap = new Map<string, number>()
  columns.forEach((column, colIndex) => {
    column.forEach(apt => {
      appointmentColumnMap.set(apt.id, colIndex)
    })
  })

  // For each appointment, find how many columns exist in its time range
  for (const apt of sorted) {
    const colIndex = appointmentColumnMap.get(apt.id) || 0

    // Count overlapping appointments to determine total columns in this time slot
    const overlapping = sorted.filter(other => appointmentsOverlap(apt, other))
    const maxColumnInOverlap = Math.max(
      ...overlapping.map(o => appointmentColumnMap.get(o.id) || 0)
    )
    const totalColumns = maxColumnInOverlap + 1

    result.push({
      ...apt,
      columnIndex: colIndex,
      totalColumns,
    })
  }

  return result
}

export function WeeklyGrid({ weekStart, appointments, groupSessions = [], availabilitySlots, appointmentDuration, birthdayPatients = [], onAppointmentClick, onGroupSessionClick, onAlternateWeekClick, onAvailabilitySlotClick, onBiweeklyHintClick, showProfessional = false }: WeeklyGridProps) {
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const today = new Date()

  // Filter out individual group appointments (they'll be shown as group sessions)
  const individualAppointments = useMemo(() => {
    return appointments.filter(apt => !apt.groupId)
  }, [appointments])

  // Create consistent color mapping for all professionals
  const professionalColorMap = useMemo(() => {
    const professionalIds = individualAppointments.map(apt => apt.professionalProfile.id)
    return createProfessionalColorMap(professionalIds)
  }, [individualAppointments])

  // Group appointments by day and calculate layout
  const appointmentsByDay = useMemo(() => {
    const grouped: Record<string, AppointmentWithLayout[]> = {}
    for (const day of weekDays) {
      grouped[toDateString(day)] = []
    }

    // Group by date first
    const byDate: Record<string, Appointment[]> = {}
    for (const day of weekDays) {
      byDate[toDateString(day)] = []
    }
    for (const apt of individualAppointments) {
      const aptDate = toDateString(new Date(apt.scheduledAt))
      if (byDate[aptDate]) {
        byDate[aptDate].push(apt)
      }
    }

    // Calculate layout for each day
    for (const dateStr of Object.keys(byDate)) {
      grouped[dateStr] = calculateAppointmentLayout(byDate[dateStr])
    }

    return grouped
  }, [weekDays, individualAppointments])

  // Group birthday patients by day from API data
  const birthdaysByDay = useMemo(() => {
    const result: Record<string, string[]> = {}
    for (const bp of birthdayPatients) {
      if (!bp.date) continue
      if (!result[bp.date]) result[bp.date] = []
      result[bp.date].push(bp.name)
    }
    return result
  }, [birthdayPatients])

  // Group sessions by day
  const groupSessionsByDay = useMemo(() => {
    const grouped: Record<string, GroupSession[]> = {}
    for (const day of weekDays) {
      grouped[toDateString(day)] = []
    }
    for (const session of groupSessions) {
      const sessionDate = toDateString(new Date(session.scheduledAt))
      if (grouped[sessionDate]) {
        grouped[sessionDate].push(session)
      }
    }
    return grouped
  }, [weekDays, groupSessions])

  const gridHeight = HOURS.length * HOUR_HEIGHT

  // Minimum width for the scrollable content: time column (56px) + 7 days * 120px
  const minContentWidth = 56 + weekDays.length * 120

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to center today's column on mount and week changes
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const todayCol = container.querySelector('[data-today]') as HTMLElement | null
    if (!todayCol) return

    // Use getBoundingClientRect for accurate positioning regardless of nesting
    const containerRect = container.getBoundingClientRect()
    const colRect = todayCol.getBoundingClientRect()

    const colCenterInContainer = (colRect.left - containerRect.left) + container.scrollLeft + colRect.width / 2
    const targetScroll = colCenterInContainer - containerRect.width / 2

    container.scrollLeft = Math.max(0, targetScroll)
  }, [weekStart])

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Single horizontal scroll container for synchronized header + body scrolling */}
      <div className="overflow-x-auto overscroll-x-contain" ref={scrollContainerRef}>
        <div style={{ minWidth: `${minContentWidth}px` }}>
          {/* Day Headers Row */}
          <div className="flex border-b border-border sticky top-0 bg-card z-10">
            {/* Time column spacer - sticky left */}
            <div className="w-14 shrink-0 border-r border-border sticky left-0 bg-card z-20" />

            {/* Day headers */}
            {weekDays.map((day, index) => (
              <div
                key={index}
                className={`
                  flex-1 min-w-[120px] border-r border-border last:border-r-0
                  ${isSameDay(day, today) ? "bg-primary/5" : ""}
                  ${isWeekend(day) ? "bg-muted/30" : ""}
                `}
              >
                <DayHeader date={day} birthdayNames={birthdaysByDay[toDateString(day)] || []} />
              </div>
            ))}
          </div>

          {/* Grid Body */}
          <div className="flex">
            {/* Time Column - sticky left so it stays visible while scrolling */}
            <div className="w-14 shrink-0 border-r border-border sticky left-0 bg-card z-[5]">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border last:border-b-0 flex items-start justify-end pr-2 text-xs text-muted-foreground"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="-mt-2">{hour.toString().padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {weekDays.map((day, dayIndex) => {
              const dateStr = toDateString(day)
              const dayAppointments = appointmentsByDay[dateStr] || []
              const dayGroupSessions = groupSessionsByDay[dateStr] || []
              const isCurrentDay = isSameDay(day, today)
              const weekend = isWeekend(day)

              return (
                <div
                  key={dayIndex}
                  {...(isCurrentDay ? { "data-today": true } : {})}
                  className={`
                    flex-1 min-w-[120px] border-r border-border last:border-r-0 relative
                    ${isCurrentDay ? "bg-primary/5" : ""}
                    ${weekend ? "bg-muted/30" : ""}
                  `}
                  style={{ height: `${gridHeight}px` }}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-b border-border"
                      style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                    >
                      {/* 30-minute line */}
                      <div
                        className="absolute left-0 right-0 border-b border-border/50"
                        style={{ top: `${HOUR_HEIGHT / 2}px` }}
                      />
                    </div>
                  ))}

                  {/* Appointments */}
                  {dayAppointments.map((appointment) => (
                    <AppointmentBlock
                      key={appointment.id}
                      appointment={appointment}
                      onClick={onAppointmentClick}
                      onAlternateWeekClick={onAlternateWeekClick}
                      showProfessional={showProfessional}
                      columnIndex={appointment.columnIndex}
                      totalColumns={appointment.totalColumns}
                      professionalColorMap={professionalColorMap}
                    />
                  ))}

                  {/* Group Sessions */}
                  {dayGroupSessions.map((session) => (
                    <GroupSessionBlock
                      key={`${session.groupId}-${session.scheduledAt}`}
                      session={session}
                      onClick={onGroupSessionClick}
                      showProfessional={showProfessional}
                    />
                  ))}

                  {/* Availability Slots */}
                  {availabilitySlots?.get(dateStr)?.map((slot) => (
                    <AvailabilitySlotBlock
                      key={`avail-${slot.time}`}
                      slot={slot}
                      appointmentDuration={appointmentDuration || 50}
                      onClick={() => {
                        if (slot.biweeklyHint) {
                          onBiweeklyHintClick?.(dateStr, slot.time)
                        } else {
                          onAvailabilitySlotClick?.(dateStr, slot.time)
                        }
                      }}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
