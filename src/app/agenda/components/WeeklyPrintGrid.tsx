"use client"

import { useMemo } from "react"
import type { Appointment, GroupSession, AppointmentStatus, CalendarEntryType } from "../lib/types"
import { CANCELLED_STATUSES, ENTRY_TYPE_COLORS, ENTRY_TYPE_LABELS, STATUS_BORDER_COLORS } from "../lib/constants"
import { getWeekDays, isWeekend, toDateString } from "../lib/utils"
import { computeHourRange } from "../lib/hour-range"
import { PROFESSIONAL_COLORS, type ProfessionalColorMap } from "../lib/professional-colors"

// Print-tuned grid geometry. Goal: a 7-21 (14h) week fits in ~590px vertical
// space on A4 landscape (~770px usable - header/day-row chrome). 14*60*0.7=588.
const PPM = 0.7
const HOUR_H = 60 * PPM // 42px
const TIME_COL_W = 32
const DEFAULT_RANGE = { startHour: 7, endHour: 21 }
const WEEKDAY_NAMES = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]

const STATUS_DOT: Record<AppointmentStatus, string> = {
  AGENDADO: "bg-blue-500",
  CONFIRMADO: "bg-green-500",
  FINALIZADO: "bg-slate-400",
  CANCELADO_ACORDADO: "bg-red-500",
  CANCELADO_FALTA: "bg-amber-500",
  CANCELADO_PROFISSIONAL: "bg-red-500",
}

interface Props {
  weekStart: Date
  appointments: Appointment[]
  groupSessions: GroupSession[]
  /** When provided (Todos view), color the block left-border by professional. */
  professionalColorMap?: ProfessionalColorMap
}

// Layout helpers (adapted from WeeklyGrid: side-by-side overlap columns).
interface TimeBlock { id: string; startMs: number; endMs: number }
interface BlockLayout { columnIndex: number; totalColumns: number }

const blocksOverlap = (a: TimeBlock, b: TimeBlock) => a.startMs < b.endMs && b.startMs < a.endMs

function calculateBlockLayout(blocks: TimeBlock[]): Map<string, BlockLayout> {
  if (blocks.length === 0) return new Map()
  const sorted = [...blocks].sort((a, b) => a.startMs - b.startMs)
  const columns: TimeBlock[][] = []
  for (const block of sorted) {
    let placed = false
    for (let i = 0; i < columns.length; i++) {
      const last = columns[i][columns[i].length - 1]
      if (!blocksOverlap(last, block)) { columns[i].push(block); placed = true; break }
    }
    if (!placed) columns.push([block])
  }
  const colMap = new Map<string, number>()
  columns.forEach((col, i) => col.forEach((b) => colMap.set(b.id, i)))
  const result = new Map<string, BlockLayout>()
  for (const block of sorted) {
    const idx = colMap.get(block.id) ?? 0
    const overlapping = sorted.filter((o) => blocksOverlap(block, o))
    const maxCol = Math.max(...overlapping.map((o) => colMap.get(o.id) ?? 0))
    result.set(block.id, { columnIndex: idx, totalColumns: maxCol + 1 })
  }
  return result
}

// Unified block model — appointments and group sessions normalized to one shape.
interface PrintBlock {
  id: string
  start: Date
  end: Date
  title: string
  isCancelled: boolean
  isFinalized: boolean
  isGroup: boolean
  type: CalendarEntryType | "GROUP"
  status: AppointmentStatus | null
  professionalProfileId: string
  hasRecurrence: boolean
  participantCount: number
  layout: BlockLayout
}

const pad = (n: number) => n.toString().padStart(2, "0")
const timeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

function appointmentToBlock(apt: Appointment, layout: BlockLayout): PrintBlock {
  const title = apt.type === "CONSULTA"
    ? apt.patient?.name ?? apt.title ?? "Sem titulo"
    : apt.title ?? ENTRY_TYPE_LABELS[apt.type]
  return {
    id: apt.id,
    start: new Date(apt.scheduledAt),
    end: new Date(apt.endAt),
    title,
    isCancelled: CANCELLED_STATUSES.includes(apt.status),
    isFinalized: apt.status === "FINALIZADO",
    isGroup: false,
    type: apt.type,
    status: apt.status,
    professionalProfileId: apt.professionalProfile.id,
    hasRecurrence: !!apt.recurrence,
    participantCount: 0,
    layout,
  }
}

function groupSessionToBlock(gs: GroupSession, layout: BlockLayout): PrintBlock {
  const total = gs.participants.length
  const cancelledCount = gs.participants.filter((p) => CANCELLED_STATUSES.includes(p.status)).length
  return {
    id: `gs-${gs.sessionGroupId || gs.groupId}-${gs.scheduledAt}`,
    start: new Date(gs.scheduledAt),
    end: new Date(gs.endAt),
    title: gs.groupName,
    isCancelled: total > 0 && cancelledCount === total,
    isFinalized: false,
    isGroup: true,
    type: "GROUP",
    status: null,
    professionalProfileId: gs.professionalProfileId,
    hasRecurrence: !!gs.recurrenceType,
    participantCount: total,
    layout,
  }
}

function PrintBlockView({
  block, startHour, professionalColorMap,
}: { block: PrintBlock; startHour: number; professionalColorMap?: ProfessionalColorMap }) {
  const hour = block.start.getHours()
  const minutes = block.start.getMinutes()
  const durationMin = Math.max(1, Math.round((block.end.getTime() - block.start.getTime()) / 60000))
  const top = ((hour - startHour) * 60 + minutes) * PPM
  // Floor of 14px keeps short (15min) blocks readable without overlapping neighbors.
  const height = Math.max(durationMin * PPM, 14)
  const colW = 100 / block.layout.totalColumns
  const leftPct = block.layout.columnIndex * colW

  // Color: groups always purple-ish; otherwise entry-type colors. Left border
  // is overridden by professional color when colorMap is provided (Todos view).
  const profIdx = professionalColorMap?.get(block.professionalProfileId)
  const profColor = profIdx !== undefined ? PROFESSIONAL_COLORS[profIdx] : null
  let bgClass: string, borderL: string, textClass: string
  if (block.isGroup) {
    bgClass = "bg-purple-50"
    borderL = profColor?.border ?? "border-l-purple-500"
    textClass = "text-purple-800"
  } else {
    const ec = ENTRY_TYPE_COLORS[block.type as CalendarEntryType] ?? ENTRY_TYPE_COLORS.CONSULTA
    bgClass = ec.bg
    borderL = profColor?.border ?? (block.status ? STATUS_BORDER_COLORS[block.status] : ec.borderLeft)
    textClass = ec.text
  }

  const dotClass = block.status ? STATUS_DOT[block.status] : null
  const opacity = block.isCancelled ? "opacity-60" : block.isFinalized ? "opacity-75" : ""
  const titleClass = block.isCancelled ? "line-through text-slate-600" : "text-slate-900"
  const showTime = height >= 24
  const showSecond = height >= 32

  return (
    <div
      style={{ position: "absolute", top: `${top}px`, height: `${height}px`, left: `calc(${leftPct}% + 1px)`, width: `calc(${colW}% - 2px)` }}
      className={`border border-slate-300 rounded-sm border-l-[3px] ${borderL} ${bgClass} overflow-hidden ${opacity}`}
    >
      <div className="h-full flex flex-col px-[2px] py-[1px] gap-0 leading-tight">
        <div className="flex items-center gap-0.5">
          {dotClass && <span className={`inline-block w-1 h-1 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />}
          {block.hasRecurrence && (
            <span className="text-[6px] text-blue-600 leading-none shrink-0" aria-hidden="true" title="Recorrente">↻</span>
          )}
          {!block.isGroup && block.type !== "CONSULTA" && (
            <span className={`text-[6px] uppercase font-semibold shrink-0 ${textClass}`}>
              {ENTRY_TYPE_LABELS[block.type as CalendarEntryType].slice(0, 3)}
            </span>
          )}
          <span className={`text-[7px] font-semibold truncate flex-1 ${titleClass}`}>{block.title}</span>
        </div>
        {showTime && (
          <div className="text-[6px] font-mono tabular-nums text-slate-600 leading-none">
            {timeStr(block.start)}–{timeStr(block.end)}
            {block.isGroup && block.participantCount > 0 && (
              <span className="ml-0.5 text-purple-700 font-semibold">({block.participantCount})</span>
            )}
          </div>
        )}
        {showSecond && block.isGroup && (
          <div className="text-[6px] text-purple-700 truncate leading-none">Grupo</div>
        )}
      </div>
    </div>
  )
}

export function WeeklyPrintGrid({ weekStart, appointments, groupSessions, professionalColorMap }: Props) {
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  // Filter individual appointments inside groups out (the group session block covers them).
  const individualAppointments = useMemo(
    () => appointments.filter((a) => !a.groupId && !a.sessionGroupId),
    [appointments],
  )

  const { startHour, endHour } = useMemo(
    () => computeHourRange([...individualAppointments, ...groupSessions], DEFAULT_RANGE),
    [individualAppointments, groupSessions],
  )
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  )

  const blocksByDay = useMemo(() => {
    const result: Record<string, PrintBlock[]> = {}
    for (const day of weekDays) {
      const dateStr = toDateString(day)
      const dayApts = individualAppointments.filter((a) => toDateString(new Date(a.scheduledAt)) === dateStr)
      const dayGss = groupSessions.filter((gs) => toDateString(new Date(gs.scheduledAt)) === dateStr)
      const tb: TimeBlock[] = [
        ...dayApts.map((a) => ({ id: a.id, startMs: new Date(a.scheduledAt).getTime(), endMs: new Date(a.endAt).getTime() })),
        ...dayGss.map((gs) => ({
          id: `gs-${gs.sessionGroupId || gs.groupId}-${gs.scheduledAt}`,
          startMs: new Date(gs.scheduledAt).getTime(),
          endMs: new Date(gs.endAt).getTime(),
        })),
      ]
      const layoutMap = calculateBlockLayout(tb)
      const fallback: BlockLayout = { columnIndex: 0, totalColumns: 1 }
      result[dateStr] = [
        ...dayApts.map((a) => appointmentToBlock(a, layoutMap.get(a.id) ?? fallback)),
        ...dayGss.map((gs) => groupSessionToBlock(
          gs,
          layoutMap.get(`gs-${gs.sessionGroupId || gs.groupId}-${gs.scheduledAt}`) ?? fallback,
        )),
      ]
    }
    return result
  }, [weekDays, individualAppointments, groupSessions])

  const gridHeight = hours.length * HOUR_H

  return (
    <div className="agenda-print-only text-slate-900 bg-white">
      {/* Day headers row */}
      <div className="flex border-b-2 border-slate-700">
        <div className="shrink-0 border-r border-slate-300" style={{ width: `${TIME_COL_W}px` }} />
        {weekDays.map((day) => (
          <div key={day.toISOString()} className={`flex-1 border-r border-slate-300 last:border-r-0 px-1 py-0.5 text-center ${isWeekend(day) ? "bg-slate-50" : ""}`}>
            <div className="text-[8px] font-bold uppercase tracking-wider text-slate-700 leading-none">
              {WEEKDAY_NAMES[day.getDay()]} {pad(day.getDate())}/{pad(day.getMonth() + 1)}
            </div>
          </div>
        ))}
      </div>

      {/* Grid body: time column + 7 day columns */}
      <div className="flex" style={{ height: `${gridHeight}px` }}>
        <div className="shrink-0 border-r border-slate-300 relative" style={{ width: `${TIME_COL_W}px` }}>
          {hours.map((hour) => (
            <div key={hour} className="absolute left-0 right-0 flex items-start justify-end pr-1" style={{ top: `${(hour - startHour) * HOUR_H}px`, height: `${HOUR_H}px` }}>
              <span className="text-[7px] font-mono tabular-nums text-slate-500 -mt-[3px]">{pad(hour)}:00</span>
            </div>
          ))}
        </div>

        {weekDays.map((day) => {
          const dateStr = toDateString(day)
          const blocks = blocksByDay[dateStr] ?? []
          return (
            <div key={day.toISOString()} className={`flex-1 border-r border-slate-300 last:border-r-0 relative ${isWeekend(day) ? "bg-slate-50" : ""}`} style={{ height: `${gridHeight}px` }}>
              {hours.map((hour) => (
                <div key={hour} className="absolute left-0 right-0 border-b border-slate-200" style={{ top: `${(hour - startHour) * HOUR_H}px`, height: `${HOUR_H}px` }}>
                  <div className="absolute left-0 right-0 border-b border-slate-100" style={{ top: `${HOUR_H / 2}px` }} />
                </div>
              ))}
              {blocks.map((block) => (
                <PrintBlockView key={block.id} block={block} startHour={startHour} professionalColorMap={professionalColorMap} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
