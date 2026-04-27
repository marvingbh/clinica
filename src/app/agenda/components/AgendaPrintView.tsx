"use client"

import { useMemo } from "react"
import type { Appointment, GroupSession } from "../lib/types"
import { formatDateHeader, getWeekDays, toDateString } from "../lib/utils"
import { PROFESSIONAL_COLORS, type ProfessionalColorMap } from "../lib/professional-colors"
import { DailyPrintGrid } from "./DailyPrintGrid"
import { WeeklyPrintGrid } from "./WeeklyPrintGrid"

interface AgendaPrintViewProps {
  mode: "daily" | "weekly"
  /** For daily: the selected day. For weekly: the week start (or any day in the week). */
  refDate: Date
  /** For weekly: optional explicit week start. */
  weekStart?: Date
  appointments: Appointment[]
  groupSessions: GroupSession[]
  /** Optional caption shown next to the title (e.g., "Profissional: Marcus" or "Todos os profissionais"). */
  caption?: string
  /** When provided (typically for "Todos" view), colors each block by the professional. */
  professionalColorMap?: ProfessionalColorMap
  /** Names keyed by professional profile ID, used for the legend. */
  professionalNames?: Map<string, string>
}

export function AgendaPrintView({
  mode,
  refDate,
  weekStart,
  appointments,
  groupSessions,
  caption,
  professionalColorMap,
  professionalNames,
}: AgendaPrintViewProps) {
  // Build a legend of professionals that actually appear in the visible data
  const legend = useMemo(() => {
    if (!professionalColorMap || professionalColorMap.size === 0) return []
    const seen = new Set<string>()
    for (const apt of appointments) seen.add(apt.professionalProfile.id)
    for (const gs of groupSessions) seen.add(gs.professionalProfileId)
    const entries: { id: string; name: string; colorIdx: number }[] = []
    seen.forEach((id) => {
      const colorIdx = professionalColorMap.get(id)
      if (colorIdx === undefined) return
      const name = professionalNames?.get(id) ?? "—"
      entries.push({ id, name, colorIdx })
    })
    return entries.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [professionalColorMap, professionalNames, appointments, groupSessions])

  const headerTitle = useMemo(() => {
    if (mode === "daily") return formatDateHeader(refDate)
    const start = weekStart ?? refDate
    const days = getWeekDays(start)
    if (days.length === 0) return ""
    const first = days[0]
    const last = days[days.length - 1]
    const fmt = (d: Date, withYear: boolean) =>
      d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        ...(withYear ? { year: "numeric" } : {}),
      })
    return `${fmt(first, false)} – ${fmt(last, true)}`
  }, [mode, refDate, weekStart])

  // Filter to the date(s) being printed so the grid receives only relevant items.
  const filteredAppointments = useMemo(() => {
    if (mode === "daily") {
      const ds = toDateString(refDate)
      return appointments.filter((a) => toDateString(new Date(a.scheduledAt)) === ds)
    }
    const start = weekStart ?? refDate
    const days = getWeekDays(start).map(toDateString)
    const set = new Set(days)
    return appointments.filter((a) => set.has(toDateString(new Date(a.scheduledAt))))
  }, [mode, refDate, weekStart, appointments])

  const filteredGroupSessions = useMemo(() => {
    if (mode === "daily") {
      const ds = toDateString(refDate)
      return groupSessions.filter((gs) => toDateString(new Date(gs.scheduledAt)) === ds)
    }
    const start = weekStart ?? refDate
    const days = getWeekDays(start).map(toDateString)
    const set = new Set(days)
    return groupSessions.filter((gs) => set.has(toDateString(new Date(gs.scheduledAt))))
  }, [mode, refDate, weekStart, groupSessions])

  const isEmpty = filteredAppointments.length === 0 && filteredGroupSessions.length === 0

  return (
    <div className="agenda-print-only text-slate-900 bg-white">
      <div className="flex items-baseline justify-between border-b-2 border-slate-700 pb-1 mb-2">
        <div>
          <div className="text-[8px] uppercase tracking-wider text-slate-500">
            Agenda — {mode === "daily" ? "Diária" : "Semanal"}
          </div>
          <h1 className="text-base font-bold leading-tight text-slate-900">{headerTitle}</h1>
        </div>
        {caption && <div className="text-[9px] text-slate-700">{caption}</div>}
      </div>

      {legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-2 text-[8px] text-slate-700">
          <span className="font-semibold text-slate-500 uppercase tracking-wide">Profissionais:</span>
          {legend.map((item) => {
            const color = PROFESSIONAL_COLORS[item.colorIdx]
            return (
              <span key={item.id} className="inline-flex items-center gap-1">
                <span className={`inline-block w-2 h-2 rounded-full ${color.accent}`} aria-hidden="true" />
                <span className={color.text}>{item.name}</span>
              </span>
            )
          })}
        </div>
      )}

      {isEmpty ? (
        <div className="text-[10px] text-slate-500 italic">Nenhum agendamento.</div>
      ) : mode === "daily" ? (
        <DailyPrintGrid
          refDate={refDate}
          appointments={filteredAppointments}
          groupSessions={filteredGroupSessions}
          professionalColorMap={professionalColorMap}
        />
      ) : (
        <WeeklyPrintGrid
          weekStart={weekStart ?? refDate}
          appointments={filteredAppointments}
          groupSessions={filteredGroupSessions}
          professionalColorMap={professionalColorMap}
        />
      )}
    </div>
  )
}
