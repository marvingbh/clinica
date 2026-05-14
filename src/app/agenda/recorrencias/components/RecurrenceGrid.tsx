"use client"

import { useMemo } from "react"
import {
  buildLayoutEntries,
  type FreeWeeklySlot,
  type LayoutEntry,
  type RecurrenceForSlot,
} from "@/lib/appointments/recurrence-slots"
import { minutesToPixel } from "../../lib/grid-geometry"
import { WEEKLY_GRID } from "../../lib/grid-config"
import { dayGridTemplate, TIME_COL_WIDTH_PX } from "../../lib/utils"
import {
  BiweeklyPairCard,
  BlockCard,
  FreeWeeklySlotCard,
  GroupCard,
  MonthlyCard,
  WeeklyCard,
} from "./RecurrenceSlot"
import type { ProfessionalColorMap } from "../../lib/professional-colors"

const WEEKDAY_LABELS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"]
const WEEKDAY_DOWS = [1, 2, 3, 4, 5, 6, 0]

interface RecurrenceGridProps {
  recurrences: RecurrenceForSlot[]
  freeSlots?: FreeWeeklySlot[]
  professionalColorMap?: ProfessionalColorMap
  showProfessional?: boolean
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number)
  return h * 60 + m
}

type GridItem =
  | { kind: "entry"; entry: LayoutEntry; startMin: number; endMin: number; key: string }
  | { kind: "free"; free: FreeWeeklySlot; startMin: number; endMin: number; key: string }

interface PositionedItem {
  item: GridItem
  columnIndex: number
  totalColumns: number
}

function layoutDay(items: GridItem[]): PositionedItem[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin)
  const columns: GridItem[][] = []
  for (const item of sorted) {
    let placed = false
    for (const col of columns) {
      const last = col[col.length - 1]
      if (last.endMin <= item.startMin) {
        col.push(item)
        placed = true
        break
      }
    }
    if (!placed) columns.push([item])
  }
  const colByKey = new Map<string, number>()
  columns.forEach((col, idx) => col.forEach((it) => colByKey.set(it.key, idx)))
  return sorted.map((item) => {
    const overlapping = sorted.filter(
      (other) => item.startMin < other.endMin && other.startMin < item.endMin,
    )
    const maxCol = Math.max(...overlapping.map((o) => colByKey.get(o.key) ?? 0))
    return {
      item,
      columnIndex: colByKey.get(item.key) ?? 0,
      totalColumns: maxCol + 1,
    }
  })
}

function entryKey(entry: LayoutEntry): string {
  if (entry.kind === "biweekly-pair") return `bi-${entry.key}`
  return `s-${entry.recurrence.id}`
}

export function RecurrenceGrid({
  recurrences,
  freeSlots = [],
  professionalColorMap,
  showProfessional = false,
}: RecurrenceGridProps) {
  const entries = useMemo(() => buildLayoutEntries(recurrences), [recurrences])

  const { startHour, endHour } = useMemo(() => {
    const allStartMin: number[] = [
      ...entries.map((e) => parseHHMM(e.startTime)),
      ...freeSlots.map((f) => parseHHMM(f.startTime)),
    ]
    const allEndMin: number[] = [
      ...entries.map((e) => parseHHMM(e.endTime)),
      ...freeSlots.map((f) => parseHHMM(f.endTime)),
    ]
    if (allStartMin.length === 0) return { startHour: 7, endHour: 20 }
    const minH = Math.floor(Math.min(...allStartMin) / 60)
    const maxEnd = Math.max(...allEndMin)
    const maxH = Math.ceil(maxEnd / 60)
    return {
      startHour: Math.max(0, Math.min(minH - 1, WEEKLY_GRID.startHour)),
      endHour: Math.min(24, Math.max(maxH + 1, WEEKLY_GRID.endHour)),
    }
  }, [entries, freeSlots])

  const gridConfig = { pixelsPerMinute: WEEKLY_GRID.pixelsPerMinute, startHour }
  const bodyHeight = (endHour - startHour) * WEEKLY_GRID.hourHeight

  const layoutByDow = useMemo(() => {
    const map = new Map<number, PositionedItem[]>()
    for (const dow of WEEKDAY_DOWS) {
      const items: GridItem[] = []
      for (const e of entries) {
        if (e.dayOfWeek !== dow) continue
        items.push({
          kind: "entry",
          entry: e,
          startMin: parseHHMM(e.startTime),
          endMin: parseHHMM(e.endTime),
          key: entryKey(e),
        })
      }
      for (const f of freeSlots) {
        if (f.dayOfWeek !== dow) continue
        items.push({
          kind: "free",
          free: f,
          startMin: parseHHMM(f.startTime),
          endMin: parseHHMM(f.endTime),
          key: `f-${f.dayOfWeek}-${f.startTime}`,
        })
      }
      map.set(dow, layoutDay(items))
    }
    return map
  }, [entries, freeSlots])

  const hourRows: number[] = []
  for (let h = startHour; h < endHour; h++) hourRows.push(h)

  const pseudoDays = useMemo(
    () => WEEKDAY_DOWS.map((dow) => new Date(2000, 0, 2 + dow)),
    [],
  )
  const gridTemplate = dayGridTemplate(pseudoDays)

  function renderItem(item: GridItem): React.ReactNode {
    if (item.kind === "free") {
      return <FreeWeeklySlotCard startTime={item.free.startTime} endTime={item.free.endTime} />
    }
    const e = item.entry
    if (e.kind === "biweekly-pair") {
      return (
        <BiweeklyPairCard
          pair={e.pair}
          timeRange={`${e.startTime}–${e.endTime}`}
          professionalColorMap={professionalColorMap}
          showProfessional={showProfessional}
        />
      )
    }
    const r = e.recurrence
    const timeRange = `${e.startTime}–${e.endTime}`
    if (r.type === "GROUP") {
      return <GroupCard recurrence={r} timeRange={timeRange} showProfessional={showProfessional} />
    }
    if (r.type !== "CONSULTA") {
      return <BlockCard recurrence={r} timeRange={timeRange} showProfessional={showProfessional} />
    }
    if (r.recurrenceType === "MONTHLY") {
      return (
        <MonthlyCard
          recurrence={r}
          timeRange={timeRange}
          professionalColorMap={professionalColorMap}
          showProfessional={showProfessional}
        />
      )
    }
    return (
      <WeeklyCard
        recurrence={r}
        timeRange={timeRange}
        professionalColorMap={professionalColorMap}
        showProfessional={showProfessional}
      />
    )
  }

  return (
    <div className="rounded-md border border-ink-200 bg-ink-0 overflow-hidden">
      <div className="grid border-b border-ink-200" style={{ gridTemplateColumns: gridTemplate }}>
        <div className="bg-ink-50 border-r border-ink-100" style={{ width: TIME_COL_WIDTH_PX }} />
        {WEEKDAY_DOWS.map((dow, i) => (
          <div
            key={dow}
            className={`px-3 py-2.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-ink-500 ${
              i < 6 ? "border-r border-ink-100" : ""
            } ${dow === 0 || dow === 6 ? "bg-ink-100" : "bg-ink-50"}`}
          >
            {WEEKDAY_LABELS[i]}
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: gridTemplate, height: bodyHeight }}>
        <div
          className="relative bg-ink-50 border-r border-ink-100"
          style={{ width: TIME_COL_WIDTH_PX, height: bodyHeight }}
        >
          {hourRows.map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 px-2 text-right text-[10px] text-ink-400 font-mono font-medium tabular-nums"
              style={{ top: minutesToPixel(h * 60, gridConfig) - 1 }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {WEEKDAY_DOWS.map((dow, i) => {
          const positioned = layoutByDow.get(dow) ?? []
          const isWeekend = dow === 0 || dow === 6
          return (
            <div
              key={dow}
              className={`relative ${i < 6 ? "border-r border-ink-100" : ""} ${
                isWeekend ? "bg-ink-50" : ""
              }`}
              style={{ height: bodyHeight }}
            >
              {hourRows.map((h, idx) => (
                <div
                  key={h}
                  className={`absolute left-0 right-0 ${
                    idx === 0 ? "" : "border-t border-dashed border-ink-100"
                  }`}
                  style={{ top: minutesToPixel(h * 60, gridConfig) }}
                />
              ))}

              {positioned.map(({ item, columnIndex, totalColumns }) => {
                const top = minutesToPixel(item.startMin, gridConfig)
                const height = (item.endMin - item.startMin) * WEEKLY_GRID.pixelsPerMinute
                const widthPct = 100 / totalColumns
                const leftPct = columnIndex * widthPct
                return (
                  <div
                    key={item.key}
                    className="absolute px-0.5"
                    style={{
                      top,
                      height,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                    }}
                  >
                    {renderItem(item)}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
