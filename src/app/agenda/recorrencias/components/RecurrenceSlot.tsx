"use client"

import {
  formatFrequencyLabel,
  getWeekOfMonth,
  type BiweeklyPair,
  type RecurrenceForSlot,
  type SlotGroup,
} from "@/lib/appointments/recurrence-slots"
import { PlusIcon, UsersIcon } from "@/shared/components/ui/icons"
import type { ProfessionalColorMap } from "../../lib/professional-colors"

const WEEKDAY_SHORT_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]

interface RecurrenceSlotProps {
  slot: SlotGroup
  professionalColorMap?: ProfessionalColorMap
  showProfessional?: boolean
}

/**
 * @deprecated Kept for compatibility — the grid now renders each recurrence
 * type via the exported card components directly.
 */
export function RecurrenceSlot(_props: RecurrenceSlotProps) {
  return null
}

function professionalLine(name: string | null) {
  if (!name) return null
  return (
    <div className="text-[9px] text-ink-500 truncate" title={name}>
      {name}
    </div>
  )
}

function SlotShell({
  variant,
  children,
  title,
  conflict,
}: {
  variant: "weekly" | "biweekly" | "monthly" | "block" | "group"
  children: React.ReactNode
  title?: string
  conflict?: boolean
}) {
  const styles = {
    weekly: "bg-blue-50 border-l-blue-500 text-blue-900",
    biweekly: "bg-amber-50 border-l-amber-500 text-amber-800",
    monthly: "bg-purple-50 border-l-purple-500 text-purple-700",
    block: "bg-rose-50 border-l-rose-500 text-rose-700",
    group: "bg-teal-50 border-l-teal-500 text-teal-800",
  }[variant]
  return (
    <div
      className={`h-full overflow-hidden rounded-[3px] border-l-[3px] px-2 py-1 text-[11px] leading-tight flex flex-col gap-0.5 transition-shadow duration-100 hover:-translate-y-px hover:shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${styles} ${
        conflict ? "ring-1 ring-rose-400" : ""
      }`}
      title={title}
    >
      {children}
    </div>
  )
}

function Tag({
  variant,
  children,
}: {
  variant: "weekly" | "biweekly" | "monthly"
  children: React.ReactNode
}) {
  const styles = {
    weekly: "bg-blue-100 text-blue-700",
    biweekly: "bg-amber-100 text-amber-700",
    monthly: "bg-purple-100 text-purple-700",
  }[variant]
  return (
    <span
      className={`inline-flex items-center text-[9px] font-mono font-medium uppercase tracking-[0.02em] px-1 py-px rounded-sm ${styles}`}
    >
      {children}
    </span>
  )
}

function TimeLine({
  timeRange,
  variant,
}: {
  timeRange: string
  variant: "weekly" | "biweekly" | "monthly" | "block" | "group"
}) {
  const color = {
    weekly: "text-blue-700",
    biweekly: "text-amber-700",
    monthly: "text-purple-700",
    block: "text-rose-700/70",
    group: "text-teal-700",
  }[variant]
  return (
    <div className={`text-[10px] font-mono font-medium tabular-nums ${color}`}>{timeRange}</div>
  )
}

// ============================================================================
// Weekly
// ============================================================================

export function WeeklyCard({
  recurrence,
  timeRange,
  showProfessional,
}: {
  recurrence: RecurrenceForSlot
  timeRange: string
  professionalColorMap?: ProfessionalColorMap
  showProfessional?: boolean
}) {
  const label = recurrence.patientName || recurrence.title || "—"
  const tooltip = [`Semanal · ${timeRange}`, label, recurrence.professionalName]
    .filter(Boolean)
    .join("\n")
  return (
    <SlotShell variant="weekly" title={tooltip}>
      <div className="flex items-center gap-1.5">
        <Tag variant="weekly">{formatFrequencyLabel("WEEKLY")}</Tag>
      </div>
      <TimeLine timeRange={timeRange} variant="weekly" />
      <div className="text-[11px] font-medium text-blue-900 truncate">{label}</div>
      {showProfessional && professionalLine(recurrence.professionalName)}
    </SlotShell>
  )
}

// ============================================================================
// Biweekly (par/ímpar pair in one card)
// ============================================================================

export function BiweeklyPairCard({
  pair,
  timeRange,
  showProfessional,
}: {
  pair: BiweeklyPair
  timeRange: string
  professionalColorMap?: ProfessionalColorMap
  showProfessional?: boolean
}) {
  const parLabel = pair.par
    ? `par: ${pair.par.patientName || pair.par.title || "—"}${pair.par.professionalName ? ` (${pair.par.professionalName})` : ""}`
    : "par: disponível"
  const imparLabel = pair.impar
    ? `ímpar: ${pair.impar.patientName || pair.impar.title || "—"}${pair.impar.professionalName ? ` (${pair.impar.professionalName})` : ""}`
    : "ímpar: disponível"
  const tooltip = pair.conflict
    ? `Conflito: duas recorrências quinzenais com mesma paridade neste slot\n${parLabel}\n${imparLabel}`
    : `Quinzenal · ${timeRange}\n${parLabel}\n${imparLabel}`
  return (
    <SlotShell variant="biweekly" conflict={pair.conflict} title={tooltip}>
      <div className="flex items-center gap-1.5">
        <Tag variant="biweekly">{formatFrequencyLabel("BIWEEKLY")}</Tag>
        <TimeLine timeRange={timeRange} variant="biweekly" />
      </div>
      <BiweeklyRow recurrence={pair.par} parity="PAR" showProfessional={showProfessional} />
      <div className="border-t border-dashed border-amber-300/60 mt-0.5 pt-0.5">
        <BiweeklyRow recurrence={pair.impar} parity="ÍMP" showProfessional={showProfessional} />
      </div>
    </SlotShell>
  )
}

function BiweeklyRow({
  recurrence,
  parity,
  showProfessional,
}: {
  recurrence: RecurrenceForSlot | null
  parity: "PAR" | "ÍMP"
  showProfessional?: boolean
}) {
  const parityCls =
    parity === "PAR"
      ? "bg-amber-100 text-amber-800"
      : "bg-amber-200/40 text-amber-800"
  return (
    <div className="grid items-center gap-1.5 mt-0.5" style={{ gridTemplateColumns: "32px 1fr" }}>
      <span
        className={`text-center text-[9px] font-mono font-semibold px-1 py-px rounded-sm ${parityCls}`}
      >
        {parity}
      </span>
      {recurrence ? (
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-amber-900 truncate" title={recurrence.patientName ?? recurrence.title ?? ""}>
            {recurrence.patientName || recurrence.title || "—"}
          </div>
          {showProfessional && professionalLine(recurrence.professionalName)}
        </div>
      ) : (
        <span
          className="inline-flex items-center gap-0.5 px-1 py-px rounded-sm border border-dashed border-emerald-400 bg-emerald-50 text-emerald-700"
          title="Slot disponível para novo paciente"
        >
          <PlusIcon className="w-2.5 h-2.5" />
          <span className="text-[10px] font-semibold tracking-wide uppercase">Disponível</span>
        </span>
      )}
    </div>
  )
}

// ============================================================================
// Monthly (with [1][2][3][4] week markers)
// ============================================================================

export function MonthlyCard({
  recurrence,
  timeRange,
  showProfessional,
}: {
  recurrence: RecurrenceForSlot
  timeRange: string
  professionalColorMap?: ProfessionalColorMap
  showProfessional?: boolean
}) {
  const label = recurrence.patientName || recurrence.title || "—"
  const week = getWeekOfMonth(recurrence.startDate)
  const weekdayShort = WEEKDAY_SHORT_PT[recurrence.dayOfWeek] ?? ""
  const monthlyPattern = `${week}ª ${weekdayShort} do mês`
  const tooltip = [
    `Mensal · ${monthlyPattern} · ${timeRange}`,
    label,
    recurrence.professionalName,
    "Pode mudar de dia da semana entre meses",
  ]
    .filter(Boolean)
    .join("\n")
  return (
    <SlotShell variant="monthly" title={tooltip}>
      <div className="flex items-center gap-1.5">
        <Tag variant="monthly">{formatFrequencyLabel("MONTHLY")}</Tag>
        <TimeLine timeRange={timeRange} variant="monthly" />
      </div>
      <div className="text-[11px] font-medium text-purple-900 truncate" title={label}>
        {label}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4].map((w) => (
            <span
              key={w}
              className={`grid place-items-center w-3.5 h-3.5 text-[8px] font-mono font-semibold rounded-sm ${
                w === week ? "bg-purple-500 text-white" : "bg-ink-100 text-ink-400"
              }`}
            >
              {w}
            </span>
          ))}
        </div>
        <span className="text-[9px] font-medium text-purple-700/80 uppercase tracking-wide truncate">
          {monthlyPattern}
        </span>
      </div>
      {showProfessional && professionalLine(recurrence.professionalName)}
    </SlotShell>
  )
}

// ============================================================================
// Block (non-CONSULTA — supervisão, terapia, reunião)
// ============================================================================

/**
 * Subtle dashed-green card representing an open weekly slot inside the
 * professional's availability that no current recurrence touches. Visually
 * subordinate to occupied cards so the eye still lands on real bookings first.
 */
export function FreeWeeklySlotCard({
  startTime,
  endTime,
}: {
  startTime: string
  endTime: string
}) {
  return (
    <div
      className="h-full overflow-hidden rounded-[3px] border border-dashed border-emerald-400 bg-emerald-50/70 px-2 py-1 text-[11px] leading-tight text-emerald-800 flex flex-col gap-0.5"
      title="Slot semanal disponível para novo paciente"
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center text-[9px] font-mono font-semibold uppercase tracking-[0.04em] px-1 py-px rounded-sm bg-emerald-100 text-emerald-700">
          <PlusIcon className="w-2.5 h-2.5 mr-0.5" />
          Disponível
        </span>
        <span className="text-[10px] font-mono font-medium tabular-nums text-emerald-700">
          {startTime}–{endTime}
        </span>
      </div>
      <div className="text-[10px] font-medium text-emerald-700/80 italic">semanal</div>
    </div>
  )
}

export function BlockCard({
  recurrence,
  timeRange,
  showProfessional,
}: {
  recurrence: RecurrenceForSlot
  timeRange: string
  showProfessional?: boolean
}) {
  const label = recurrence.title || recurrence.patientName || "Bloqueio"
  const freqLabel = formatFrequencyLabel(recurrence.recurrenceType)
  const tooltip = [`Bloqueio · ${freqLabel} · ${timeRange}`, label, recurrence.professionalName]
    .filter(Boolean)
    .join("\n")
  return (
    <SlotShell variant="block" title={tooltip}>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center text-[9px] font-mono font-medium uppercase tracking-[0.02em] px-1 py-px rounded-sm bg-rose-100 text-rose-700">
          {freqLabel}
        </span>
        <TimeLine timeRange={timeRange} variant="block" />
      </div>
      <div className="text-[10px] font-semibold tracking-[0.04em] uppercase text-rose-700 truncate">
        {label}
      </div>
      {showProfessional && professionalLine(recurrence.professionalName)}
    </SlotShell>
  )
}

// ============================================================================
// Therapy group (own recurrence pattern via TherapyGroup model)
// ============================================================================

export function GroupCard({
  recurrence,
  timeRange,
  showProfessional,
}: {
  recurrence: RecurrenceForSlot
  timeRange: string
  showProfessional?: boolean
}) {
  const label = recurrence.title || "Grupo"
  const freqLabel = formatFrequencyLabel(recurrence.recurrenceType)
  const memberCount = recurrence.groupMemberCount ?? 0
  const tooltip = [
    `Grupo · ${freqLabel} · ${timeRange}`,
    label,
    `${memberCount} ${memberCount === 1 ? "membro" : "membros"}`,
    recurrence.professionalName,
  ]
    .filter(Boolean)
    .join("\n")
  return (
    <SlotShell variant="group" title={tooltip}>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-0.5 text-[9px] font-mono font-semibold uppercase tracking-[0.04em] px-1 py-px rounded-sm bg-teal-100 text-teal-700">
          <UsersIcon className="w-2.5 h-2.5" />
          Grupo
        </span>
        <span className="inline-flex items-center text-[9px] font-mono font-medium uppercase tracking-[0.02em] px-1 py-px rounded-sm bg-teal-100 text-teal-700">
          {freqLabel}
        </span>
      </div>
      <TimeLine timeRange={timeRange} variant="group" />
      <div className="text-[11px] font-medium text-teal-900 truncate">{label}</div>
      <div className="text-[10px] text-teal-700/80">
        {memberCount} {memberCount === 1 ? "membro" : "membros"}
      </div>
      {showProfessional && professionalLine(recurrence.professionalName)}
    </SlotShell>
  )
}
