"use client"

import { useMemo, useRef, useEffect, useState } from "react"
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

interface GroupSessionWithLayout extends GroupSession {
  columnIndex: number
  totalColumns: number
}

// A generic time block for unified overlap calculation
interface TimeBlock {
  id: string
  startMs: number
  endMs: number
}

// Check if two time blocks overlap
function blocksOverlap(a: TimeBlock, b: TimeBlock): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs
}

// Calculate column layout for a set of time blocks
function calculateBlockLayout(blocks: TimeBlock[]): Map<string, { columnIndex: number; totalColumns: number }> {
  if (blocks.length === 0) return new Map()

  const sorted = [...blocks].sort((a, b) => a.startMs - b.startMs)

  const columns: TimeBlock[][] = []

  for (const block of sorted) {
    let placed = false
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const lastInColumn = columns[colIndex][columns[colIndex].length - 1]
      if (!blocksOverlap(lastInColumn, block)) {
        columns[colIndex].push(block)
        placed = true
        break
      }
    }
    if (!placed) {
      columns.push([block])
    }
  }

  const columnMap = new Map<string, number>()
  columns.forEach((column, colIndex) => {
    column.forEach(block => columnMap.set(block.id, colIndex))
  })

  const result = new Map<string, { columnIndex: number; totalColumns: number }>()
  for (const block of sorted) {
    const colIndex = columnMap.get(block.id) || 0
    const overlapping = sorted.filter(other => blocksOverlap(block, other))
    const maxCol = Math.max(...overlapping.map(o => columnMap.get(o.id) || 0))
    result.set(block.id, { columnIndex: colIndex, totalColumns: maxCol + 1 })
  }

  return result
}

// Calculate layout for appointments and group sessions together
function calculateDayLayout(
  appointments: Appointment[],
  groupSessions: GroupSession[],
): { appointments: AppointmentWithLayout[]; groupSessions: GroupSessionWithLayout[] } {
  const blocks: TimeBlock[] = [
    ...appointments.map(apt => ({
      id: apt.id,
      startMs: new Date(apt.scheduledAt).getTime(),
      endMs: new Date(apt.endAt).getTime(),
    })),
    ...groupSessions.map(gs => ({
      id: `gs-${gs.groupId}-${gs.scheduledAt}`,
      startMs: new Date(gs.scheduledAt).getTime(),
      endMs: new Date(gs.endAt).getTime(),
    })),
  ]

  const layoutMap = calculateBlockLayout(blocks)

  const appointmentsWithLayout = appointments.map(apt => {
    const layout = layoutMap.get(apt.id) || { columnIndex: 0, totalColumns: 1 }
    return { ...apt, ...layout }
  })

  const groupSessionsWithLayout = groupSessions.map(gs => {
    const layout = layoutMap.get(`gs-${gs.groupId}-${gs.scheduledAt}`) || { columnIndex: 0, totalColumns: 1 }
    return { ...gs, ...layout }
  })

  return { appointments: appointmentsWithLayout, groupSessions: groupSessionsWithLayout }
}

export function WeeklyGrid({ weekStart, appointments, groupSessions = [], availabilitySlots, appointmentDuration, birthdayPatients = [], onAppointmentClick, onGroupSessionClick, onAlternateWeekClick, onAvailabilitySlotClick, onBiweeklyHintClick, showProfessional = false }: WeeklyGridProps) {
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const today = new Date()

  // "Now" indicator — update every minute
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const showNowLine = nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60

  // Filter out individual group appointments (they'll be shown as group sessions)
  const individualAppointments = useMemo(() => {
    return appointments.filter(apt => !apt.groupId)
  }, [appointments])

  // Create consistent color mapping for all professionals
  const professionalColorMap = useMemo(() => {
    const professionalIds = individualAppointments.map(apt => apt.professionalProfile.id)
    return createProfessionalColorMap(professionalIds)
  }, [individualAppointments])

  // Group appointments and group sessions by day and calculate unified layout
  const dayLayouts = useMemo(() => {
    const result: Record<string, { appointments: AppointmentWithLayout[]; groupSessions: GroupSessionWithLayout[] }> = {}

    for (const day of weekDays) {
      const dateStr = toDateString(day)
      const dayApts = individualAppointments.filter(
        apt => toDateString(new Date(apt.scheduledAt)) === dateStr
      )
      const dayGS = groupSessions.filter(
        gs => toDateString(new Date(gs.scheduledAt)) === dateStr
      )
      result[dateStr] = calculateDayLayout(dayApts, dayGS)
    }

    return result
  }, [weekDays, individualAppointments, groupSessions])

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
              const layout = dayLayouts[dateStr] || { appointments: [], groupSessions: [] }
              const dayAppointments = layout.appointments
              const dayGroupSessions = layout.groupSessions
              const isCurrentDay = isSameDay(day, today)
              const isPastDay = day < today && !isCurrentDay
              const weekend = isWeekend(day)

              // Find times where cancelled appointments coexist with available slots
              const dayAvailSlots = availabilitySlots?.get(dateStr) || []
              const cancelledStatuses = ["CANCELADO_PROFISSIONAL", "CANCELADO_ACORDADO", "CANCELADO_FALTA"]
              const splitTimes = new Set<string>()
              for (const slot of dayAvailSlots) {
                const hasCancelledAtTime = dayAppointments.some(apt => {
                  const t = new Date(apt.scheduledAt)
                  const timeStr = `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`
                  return timeStr === slot.time && cancelledStatuses.includes(apt.status)
                })
                if (hasCancelledAtTime) {
                  splitTimes.add(slot.time)
                }
              }

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

                  {/* "Now" indicator line */}
                  {isCurrentDay && showNowLine && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                      style={{ top: `${(nowMinutes - START_HOUR * 60) * PIXELS_PER_MINUTE}px` }}
                    >
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                      <div className="flex-1 h-[2px] bg-red-500/60" />
                    </div>
                  )}

                  {/* Appointments */}
                  {dayAppointments.map((appointment) => {
                    const isCancelled = cancelledStatuses.includes(appointment.status)
                    const t = new Date(appointment.scheduledAt)
                    const timeStr = `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}`
                    const isSplit = isCancelled && splitTimes.has(timeStr)

                    return (
                      <AppointmentBlock
                        key={appointment.id}
                        appointment={appointment}
                        onClick={onAppointmentClick}
                        onAlternateWeekClick={onAlternateWeekClick}
                        showProfessional={showProfessional}
                        columnIndex={appointment.columnIndex}
                        totalColumns={isSplit ? appointment.totalColumns + 1 : appointment.totalColumns}
                        professionalColorMap={professionalColorMap}
                      />
                    )
                  })}

                  {/* Group Sessions */}
                  {dayGroupSessions.map((session) => (
                    <GroupSessionBlock
                      key={`${session.groupId}-${session.scheduledAt}`}
                      session={session}
                      onClick={onGroupSessionClick}
                      showProfessional={showProfessional}
                      columnIndex={session.columnIndex}
                      totalColumns={session.totalColumns}
                    />
                  ))}

                  {/* Availability Slots */}
                  {availabilitySlots?.get(dateStr)?.map((slot) => (
                    <AvailabilitySlotBlock
                      key={`avail-${slot.time}`}
                      slot={slot}
                      appointmentDuration={appointmentDuration || 50}
                      halfRight={splitTimes.has(slot.time)}
                      isPast={isPastDay}
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
