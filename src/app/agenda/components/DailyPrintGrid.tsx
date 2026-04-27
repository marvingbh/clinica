"use client"

import { useMemo } from "react"
import type { Appointment, GroupSession, AppointmentStatus, CalendarEntryType } from "../lib/types"
import { STATUS_LABELS, CANCELLED_STATUSES, ENTRY_TYPE_LABELS } from "../lib/constants"
import { formatDateHeader, toDateString } from "../lib/utils"
import { PROFESSIONAL_COLORS, type ProfessionalColorMap } from "../lib/professional-colors"
import { computeHourRange } from "../lib/hour-range"

// Print-specific scale: tighter than the screen grid so a 7-21h day fits in
// ~720px on A4 landscape. Screen uses 2.4 px/min — print uses 0.85.
const PX_PER_MIN = 0.85
const HOUR_HEIGHT = 60 * PX_PER_MIN // ~51px per hour
const TIME_COL_WIDTH = 36
const SLOT_LEFT_MARGIN = 6
const BLOCK_VGAP = 1
const DEFAULT_RANGE = { startHour: 7, endHour: 21 }

interface LayoutItem { id: string; scheduledAt: string; endAt: string }
interface LayoutResult { columnIndex: number; totalColumns: number }

function itemsOverlap(a: LayoutItem, b: LayoutItem): boolean {
  return new Date(a.scheduledAt).getTime() < new Date(b.endAt).getTime()
    && new Date(b.scheduledAt).getTime() < new Date(a.endAt).getTime()
}

/** Column-index layout for overlapping items (copied from DailyOverviewGrid). */
function calculateLayout(items: LayoutItem[]): Map<string, LayoutResult> {
  const result = new Map<string, LayoutResult>()
  if (items.length === 0) return result
  const sorted = [...items].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  )
  const columns: LayoutItem[][] = []
  for (const item of sorted) {
    let placed = false
    for (let i = 0; i < columns.length; i++) {
      const last = columns[i][columns[i].length - 1]
      if (!itemsOverlap(last, item)) { columns[i].push(item); placed = true; break }
    }
    if (!placed) columns.push([item])
  }
  const colMap = new Map<string, number>()
  columns.forEach((col, i) => col.forEach((it) => colMap.set(it.id, i)))
  for (const item of sorted) {
    const overlapping = sorted.filter((o) => itemsOverlap(item, o))
    const total = Math.max(...overlapping.map((o) => colMap.get(o.id) || 0)) + 1
    result.set(item.id, { columnIndex: colMap.get(item.id) || 0, totalColumns: total })
  }
  return result
}

const STATUS_BG: Record<AppointmentStatus, string> = {
  AGENDADO: "bg-blue-50",
  CONFIRMADO: "bg-green-50",
  FINALIZADO: "bg-slate-50",
  CANCELADO_ACORDADO: "bg-red-50",
  CANCELADO_FALTA: "bg-amber-50",
  CANCELADO_PROFISSIONAL: "bg-red-50",
}
const STATUS_BORDER: Record<AppointmentStatus, string> = {
  AGENDADO: "border-l-blue-500",
  CONFIRMADO: "border-l-green-500",
  FINALIZADO: "border-l-slate-400",
  CANCELADO_ACORDADO: "border-l-red-400",
  CANCELADO_FALTA: "border-l-amber-400",
  CANCELADO_PROFISSIONAL: "border-l-red-400",
}
const STATUS_CHIP: Record<AppointmentStatus, string> = {
  AGENDADO: "bg-blue-100 text-blue-800",
  CONFIRMADO: "bg-green-100 text-green-800",
  FINALIZADO: "bg-slate-200 text-slate-700",
  CANCELADO_ACORDADO: "bg-red-100 text-red-800",
  CANCELADO_FALTA: "bg-amber-100 text-amber-800",
  CANCELADO_PROFISSIONAL: "bg-red-100 text-red-800",
}
const TYPE_CHIP: Record<CalendarEntryType | "GROUP", string> = {
  CONSULTA: "bg-blue-100 text-blue-800",
  LEMBRETE: "bg-amber-100 text-amber-800",
  NOTA: "bg-slate-100 text-slate-700",
  TAREFA: "bg-indigo-100 text-indigo-800",
  REUNIAO: "bg-purple-100 text-purple-800",
  GROUP: "bg-fuchsia-100 text-fuchsia-800",
}
const TYPE_LABEL: Record<CalendarEntryType | "GROUP", string> = {
  CONSULTA: "Consulta",
  LEMBRETE: ENTRY_TYPE_LABELS.LEMBRETE,
  NOTA: ENTRY_TYPE_LABELS.NOTA,
  TAREFA: ENTRY_TYPE_LABELS.TAREFA,
  REUNIAO: ENTRY_TYPE_LABELS.REUNIAO,
  GROUP: "Grupo",
}

const pad = (n: number) => n.toString().padStart(2, "0")
const timeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

function recurrenceLabel(apt: Appointment): string | undefined {
  if (!apt.recurrence) return undefined
  const t = apt.recurrence.recurrenceType
  return t === "WEEKLY" ? "Semanal" : t === "BIWEEKLY" ? "Quinzenal" : t === "MONTHLY" ? "Mensal" : "Recorrente"
}

function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block px-1 rounded text-[7px] font-semibold leading-tight ${className}`}>
      {children}
    </span>
  )
}

interface PrintBlockData {
  id: string
  start: Date
  end: Date
  title: string
  type: CalendarEntryType | "GROUP"
  professionalProfileId: string
  professionalName: string
  status: AppointmentStatus | null
  isCancelled: boolean
  isFinalized: boolean
  modality?: "ONLINE" | "PRESENCIAL" | null
  notes?: string | null
  recurrenceLabel?: string
  patientLine?: string // shown when not the title
  participantsLabel?: string
}

function appointmentToData(apt: Appointment): PrintBlockData {
  const isCancelled = CANCELLED_STATUSES.includes(apt.status)
  return {
    id: apt.id,
    start: new Date(apt.scheduledAt),
    end: new Date(apt.endAt),
    title: apt.type === "CONSULTA"
      ? apt.patient?.name ?? apt.title ?? "Sem título"
      : apt.title ?? ENTRY_TYPE_LABELS[apt.type],
    type: apt.type,
    professionalProfileId: apt.professionalProfile.id,
    professionalName: apt.professionalProfile.user.name,
    status: apt.status,
    isCancelled,
    isFinalized: apt.status === "FINALIZADO",
    modality: apt.modality,
    notes: apt.notes,
    recurrenceLabel: recurrenceLabel(apt),
    patientLine: apt.type !== "CONSULTA" ? apt.patient?.name ?? undefined : undefined,
  }
}

function groupSessionToData(gs: GroupSession): PrintBlockData {
  const total = gs.participants.length
  const cancelledCount = gs.participants.filter((p) => CANCELLED_STATUSES.includes(p.status)).length
  return {
    id: `group-${gs.sessionGroupId || gs.groupId}-${gs.scheduledAt}`,
    start: new Date(gs.scheduledAt),
    end: new Date(gs.endAt),
    title: gs.groupName,
    type: "GROUP",
    professionalProfileId: gs.professionalProfileId,
    professionalName: gs.professionalName,
    status: null,
    isCancelled: total > 0 && cancelledCount === total,
    isFinalized: false,
    recurrenceLabel: gs.recurrenceType ? "Recorrente" : undefined,
    participantsLabel: `${total} paciente${total === 1 ? "" : "s"}`,
  }
}

function PrintBlock({
  data,
  layout,
  startHour,
  professionalColorMap,
}: {
  data: PrintBlockData
  layout: LayoutResult
  startHour: number
  professionalColorMap?: ProfessionalColorMap
}) {
  const profIdx = professionalColorMap?.get(data.professionalProfileId)
  const profColor = profIdx !== undefined ? PROFESSIONAL_COLORS[profIdx] : null

  const startMin = data.start.getHours() * 60 + data.start.getMinutes()
  const durationMin = Math.max(15, Math.round((data.end.getTime() - data.start.getTime()) / 60000))
  const top = (startMin - startHour * 60) * PX_PER_MIN + BLOCK_VGAP
  const height = Math.max(durationMin * PX_PER_MIN - BLOCK_VGAP * 2, 18)
  const columnWidth = 100 / layout.totalColumns
  const leftPercent = layout.columnIndex * columnWidth

  const isGroup = data.type === "GROUP"
  const borderClass = profColor?.border
    ?? (data.status ? STATUS_BORDER[data.status] : isGroup ? "border-l-fuchsia-500" : "border-l-slate-400")
  const bgClass = data.status ? STATUS_BG[data.status] : isGroup ? "bg-fuchsia-50" : "bg-white"
  const outerBorder = isGroup ? "border-fuchsia-300" : "border-slate-300"

  return (
    <div
      style={{
        position: "absolute",
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPercent}% + ${SLOT_LEFT_MARGIN}px)`,
        width: `calc(${columnWidth}% - ${SLOT_LEFT_MARGIN + 2}px)`,
      }}
      className={`rounded border ${outerBorder} border-l-2 ${borderClass} ${bgClass} px-1 py-[1px] overflow-hidden ${
        data.isCancelled ? "opacity-60" : data.isFinalized ? "opacity-80" : ""
      }`}
    >
      <div className="flex items-baseline gap-1 leading-tight">
        <span className="text-[7px] font-mono tabular-nums text-slate-700 shrink-0">
          {timeStr(data.start)}–{timeStr(data.end)}
        </span>
        <span
          className={`text-[8px] font-semibold flex-1 ${
            data.isCancelled ? "line-through text-slate-500" : "text-slate-900"
          }`}
          style={{ whiteSpace: "normal", wordBreak: "break-word" }}
        >
          {data.title}
        </span>
      </div>
      <div className="flex items-baseline gap-0.5 flex-wrap mt-[1px]">
        <Chip className={TYPE_CHIP[data.type]}>{TYPE_LABEL[data.type]}</Chip>
        {data.status && <Chip className={STATUS_CHIP[data.status]}>{STATUS_LABELS[data.status]}</Chip>}
        {data.modality && (
          <Chip className={data.modality === "ONLINE" ? "bg-sky-100 text-sky-800" : "bg-stone-100 text-stone-700"}>
            {data.modality === "ONLINE" ? "Online" : "Presencial"}
          </Chip>
        )}
        {data.recurrenceLabel && <Chip className="bg-violet-100 text-violet-800">{data.recurrenceLabel}</Chip>}
        {data.participantsLabel && <Chip className="bg-fuchsia-100 text-fuchsia-800">{data.participantsLabel}</Chip>}
      </div>
      {data.professionalName && (
        <div className={`text-[7px] leading-tight flex items-center gap-1 ${profColor?.text ?? "text-slate-600"}`}>
          {profColor && <span className={`inline-block w-1.5 h-1.5 rounded-full ${profColor.accent}`} aria-hidden="true" />}
          <span className="truncate">{data.professionalName}</span>
        </div>
      )}
      {data.patientLine && (
        <div className="text-[7px] text-slate-700 leading-tight truncate">
          Paciente: <span className="font-medium">{data.patientLine}</span>
        </div>
      )}
      {data.notes && height >= 36 && (
        <div className="text-[7px] italic text-slate-600 leading-tight" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
          {data.notes}
        </div>
      )}
    </div>
  )
}

interface Props {
  refDate: Date
  appointments: Appointment[]
  groupSessions: GroupSession[]
  /** When provided, color the block left-border by professional (Todos view). */
  professionalColorMap?: ProfessionalColorMap
}

export function DailyPrintGrid({ refDate, appointments, groupSessions, professionalColorMap }: Props) {
  const dateStr = toDateString(refDate)

  const blocks = useMemo<PrintBlockData[]>(() => {
    const apts = appointments
      .filter((a) => !a.groupId && !a.sessionGroupId && toDateString(new Date(a.scheduledAt)) === dateStr)
      .map(appointmentToData)
    const groups = groupSessions
      .filter((g) => toDateString(new Date(g.scheduledAt)) === dateStr)
      .map(groupSessionToData)
    return [...apts, ...groups].sort((a, b) => a.start.getTime() - b.start.getTime())
  }, [appointments, groupSessions, dateStr])

  const { startHour, endHour } = useMemo(
    () => computeHourRange(
      blocks.map((b) => ({ scheduledAt: b.start, endAt: b.end })),
      DEFAULT_RANGE,
    ),
    [blocks],
  )

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const gridHeight = hours.length * HOUR_HEIGHT

  const layoutMap = useMemo(
    () => calculateLayout(blocks.map((b) => ({ id: b.id, scheduledAt: b.start.toISOString(), endAt: b.end.toISOString() }))),
    [blocks],
  )

  return (
    <div className="agenda-print-only text-slate-900 bg-white">
      <div className="flex items-baseline justify-between border-b-2 border-slate-700 pb-1 mb-2">
        <div>
          <div className="text-[8px] uppercase tracking-wider text-slate-500">Agenda — Diária</div>
          <h1 className="text-base font-bold leading-tight text-slate-900">{formatDateHeader(refDate)}</h1>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="text-[10px] text-slate-500 italic">Nenhum agendamento.</div>
      ) : (
        <div className="relative flex" style={{ height: `${gridHeight}px` }}>
          {/* Time column */}
          <div className="shrink-0 relative" style={{ width: `${TIME_COL_WIDTH}px` }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute right-0 pr-2"
                style={{ top: `${(hour - startHour) * HOUR_HEIGHT - 4}px` }}
              >
                <span className="text-[8px] font-medium text-slate-500 tabular-nums">{pad(hour)}:00</span>
              </div>
            ))}
          </div>

          {/* Connector + hour dots */}
          <div className="w-px shrink-0 relative">
            <div className="absolute top-0 bottom-0 w-px bg-slate-300" />
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute -left-1 w-1.5 h-1.5 rounded-full border bg-white border-slate-400"
                style={{ top: `${(hour - startHour) * HOUR_HEIGHT - 2}px` }}
              />
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 relative">
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-b border-slate-200"
                style={{ top: `${(hour - startHour) * HOUR_HEIGHT}px` }}
              />
            ))}
            {blocks.map((data) => {
              const layout = layoutMap.get(data.id)
              if (!layout) return null
              return (
                <PrintBlock
                  key={data.id}
                  data={data}
                  layout={layout}
                  startHour={startHour}
                  professionalColorMap={professionalColorMap}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
