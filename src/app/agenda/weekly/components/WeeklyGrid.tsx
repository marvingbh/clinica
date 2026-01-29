"use client"

import { useMemo } from "react"
import { Appointment } from "../../lib/types"
import { getWeekDays, toDateString, isSameDay, isWeekend } from "../../lib/utils"
import { DayHeader } from "./DayHeader"
import { AppointmentBlock } from "./AppointmentBlock"

const START_HOUR = 7
const END_HOUR = 21
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const PIXELS_PER_MINUTE = 1.6 // 48px per 30 minutes = 96px per hour
const HOUR_HEIGHT = 60 * PIXELS_PER_MINUTE // 96px per hour

interface WeeklyGridProps {
  weekStart: Date
  appointments: Appointment[]
  onAppointmentClick: (appointment: Appointment) => void
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

export function WeeklyGrid({ weekStart, appointments, onAppointmentClick, showProfessional = false }: WeeklyGridProps) {
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const today = new Date()

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
    for (const apt of appointments) {
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
  }, [weekDays, appointments])

  const gridHeight = HOURS.length * HOUR_HEIGHT

  return (
    <div className="flex flex-col border border-border rounded-lg bg-card overflow-hidden">
      {/* Day Headers Row */}
      <div className="flex border-b border-border sticky top-0 bg-card z-10">
        {/* Time column spacer */}
        <div className="w-14 shrink-0 border-r border-border" />

        {/* Day headers */}
        <div className="flex flex-1 min-w-0 overflow-x-auto">
          {weekDays.map((day, index) => (
            <div
              key={index}
              className={`
                flex-1 min-w-[120px] border-r border-border last:border-r-0
                ${isSameDay(day, today) ? "bg-primary/5" : ""}
                ${isWeekend(day) ? "bg-muted/30" : ""}
              `}
            >
              <DayHeader date={day} />
            </div>
          ))}
        </div>
      </div>

      {/* Grid Body */}
      <div className="flex overflow-x-auto">
        {/* Time Column */}
        <div className="w-14 shrink-0 border-r border-border">
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
        <div className="flex flex-1 min-w-0">
          {weekDays.map((day, dayIndex) => {
            const dateStr = toDateString(day)
            const dayAppointments = appointmentsByDay[dateStr] || []
            const isCurrentDay = isSameDay(day, today)
            const weekend = isWeekend(day)

            return (
              <div
                key={dayIndex}
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
                    showProfessional={showProfessional}
                    columnIndex={appointment.columnIndex}
                    totalColumns={appointment.totalColumns}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
