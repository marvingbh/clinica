"use client"

import { useMemo, useState } from "react"
import { CalendarIcon, RefreshCwIcon } from "@/shared/components/ui/icons"
import { Segmented, ChipField, type SegmentedOption } from "@/shared/components/ui/segmented"
import { DateInput } from "./DateInput"
import { RecurrenceType, RecurrenceEndType } from "../lib/types"
import { MAX_RECURRENCE_OCCURRENCES } from "../lib/constants"
import { addMonthsToDate } from "../lib/utils"

// Extended appointment type that includes SINGLE (one-time)
export type AppointmentType = RecurrenceType | "SINGLE"

const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  SINGLE: "Unico",
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]
const FULL_DAY_NAMES = ["domingo", "segunda-feira", "terca-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sabado"]

// Parse date string as local time (not UTC) to get correct day of week
// Supports both DD/MM/YYYY (Brazilian) and YYYY-MM-DD (ISO) formats
function parseLocalDate(dateStr: string): Date {
  if (dateStr.includes("/")) {
    // DD/MM/YYYY format
    const [day, month, year] = dateStr.split("/").map(Number)
    return new Date(year, month - 1, day)
  }
  // YYYY-MM-DD format
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day)
}

interface RecurrenceOptionsProps {
  appointmentType: AppointmentType
  onAppointmentTypeChange: (type: AppointmentType) => void
  recurrenceEndType: RecurrenceEndType
  onRecurrenceEndTypeChange: (type: RecurrenceEndType) => void
  occurrences: number
  onOccurrencesChange: (count: number) => void
  endDate: string
  onEndDateChange: (date: string) => void
  minDate?: string
  startDate?: string
  startTime?: string
  /** When true, the Frequência chip row is skipped and rendered by the
      parent instead — lets forms put Modalidade + Frequência on one line. */
  hideFrequency?: boolean
}

export const FREQUENCY_OPTIONS: SegmentedOption<AppointmentType>[] = (
  Object.keys(APPOINTMENT_TYPE_LABELS) as AppointmentType[]
).map((type) => ({ value: type, label: APPOINTMENT_TYPE_LABELS[type] }))

export function RecurrenceOptions({
  appointmentType,
  onAppointmentTypeChange,
  recurrenceEndType,
  onRecurrenceEndTypeChange,
  occurrences,
  onOccurrencesChange,
  endDate,
  onEndDateChange,
  startDate,
  startTime,
  hideFrequency = false,
}: RecurrenceOptionsProps) {
  const [showPreview, setShowPreview] = useState(false)

  const isRecurring = appointmentType !== "SINGLE"

  // Derived state: preview dates computed from recurrence parameters
  const previewDates = useMemo(() => {
    if (!startDate || !startTime || !isRecurring) {
      return []
    }

    const dates: string[] = []
    const start = parseLocalDate(startDate)

    let intervalDays = 7
    if (appointmentType === "BIWEEKLY") intervalDays = 14

    let numOccurrences = 1
    if (recurrenceEndType === "BY_OCCURRENCES") {
      numOccurrences = Math.min(occurrences, MAX_RECURRENCE_OCCURRENCES)
    } else if (recurrenceEndType === "BY_DATE" && endDate) {
      const end = parseLocalDate(endDate)
      let count = 0
      let current = new Date(start)
      while (current <= end && count < MAX_RECURRENCE_OCCURRENCES) {
        count++
        if (appointmentType === "MONTHLY") {
          current = addMonthsToDate(start, count)
        } else {
          current = new Date(start.getTime() + count * intervalDays * 24 * 60 * 60 * 1000)
        }
      }
      numOccurrences = count
    } else if (recurrenceEndType === "INDEFINITE") {
      const sixMonthsFromNow = addMonthsToDate(start, 6)
      let count = 0
      let current = new Date(start)
      while (current <= sixMonthsFromNow && count < MAX_RECURRENCE_OCCURRENCES) {
        count++
        if (appointmentType === "MONTHLY") {
          current = addMonthsToDate(start, count)
        } else {
          current = new Date(start.getTime() + count * intervalDays * 24 * 60 * 60 * 1000)
        }
      }
      numOccurrences = count
    }

    for (let i = 0; i < numOccurrences; i++) {
      let current: Date
      if (appointmentType === "MONTHLY") {
        current = addMonthsToDate(start, i)
      } else {
        current = new Date(start.getTime() + i * intervalDays * 24 * 60 * 60 * 1000)
      }

      const [hours, minutes] = startTime.split(":").map(Number)
      current.setHours(hours, minutes, 0, 0)

      dates.push(current.toLocaleDateString("pt-BR", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }))
    }

    return dates
  }, [appointmentType, recurrenceEndType, endDate, occurrences, startDate, startTime, isRecurring])

  const endTypeOptions: SegmentedOption<RecurrenceEndType>[] = [
    { value: "BY_OCCURRENCES", label: "Nº de sessões" },
    { value: "BY_DATE", label: "Até uma data" },
    { value: "INDEFINITE", label: "Sem fim" },
  ]

  return (
    <div className="space-y-3">
      {/* Frequência — optional; parents can render it inline with
          Modalidade for a tighter layout. */}
      {!hideFrequency && (
        <ChipField label="Frequência">
          <Segmented
            options={FREQUENCY_OPTIONS}
            value={appointmentType}
            onChange={(type) => {
              onAppointmentTypeChange(type)
              if (type === "SINGLE") setShowPreview(false)
            }}
            size="sm"
            ariaLabel="Frequência"
          />
        </ChipField>
      )}

      {/* Recurrence End Options - only show for recurring types */}
      {isRecurring && (
        <div className="space-y-3">
          {/* Day of Week Indicator */}
          {startDate && (() => {
            const dayOfWeek = parseLocalDate(startDate).getDay()
            return (
              <div className="flex items-center gap-2 text-[12px]">
                <RefreshCwIcon className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                <span className="text-ink-500">
                  Toda{" "}
                  <span className="font-medium text-ink-800">{FULL_DAY_NAMES[dayOfWeek]}</span>
                </span>
              </div>
            )
          })()}

          {/* Recurrence End Type */}
          <ChipField label="Terminar">
            <Segmented
              options={endTypeOptions}
              value={recurrenceEndType}
              onChange={onRecurrenceEndTypeChange}
              size="sm"
              ariaLabel="Término da recorrência"
            />
          </ChipField>

          {/* Occurrences Input */}
          {recurrenceEndType === "BY_OCCURRENCES" && (
            <div>
              <label htmlFor="occurrences" className="block text-[11px] font-semibold text-ink-500 uppercase tracking-wider mb-1.5">
                Nº de sessões
              </label>
              <input
                id="occurrences"
                type="number"
                value={occurrences}
                onChange={(e) => onOccurrencesChange(Math.min(MAX_RECURRENCE_OCCURRENCES, Math.max(1, parseInt(e.target.value) || 1)))}
                min={1}
                max={MAX_RECURRENCE_OCCURRENCES}
                className="w-24 h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms]"
              />
              <p className="text-[11px] text-ink-500 mt-1">
                Máx. {MAX_RECURRENCE_OCCURRENCES} sessões
              </p>
            </div>
          )}

          {/* Indefinite Info */}
          {recurrenceEndType === "INDEFINITE" && (
            <p className="text-[12px] text-brand-700 leading-relaxed">
              Sessões criadas automaticamente para 6 meses, estendidas semanalmente. Finalize a qualquer momento.
            </p>
          )}

          {/* End Date Input */}
          {recurrenceEndType === "BY_DATE" && (
            <div>
              <label htmlFor="recurrenceEndDate" className="block text-[11px] font-semibold text-ink-500 uppercase tracking-wider mb-1.5">
                Data final
              </label>
              <DateInput
                id="recurrenceEndDate"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="w-40 h-9 px-3 rounded-[4px] border border-ink-300 bg-card text-ink-900 text-[13px] focus:outline-none focus:border-brand-500 focus:shadow-[var(--shadow-focus)] transition-[border-color,box-shadow] duration-[120ms]"
              />
            </div>
          )}

          {/* Preview Dates - click to expand */}
          {previewDates.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="w-full px-3 py-2 bg-card rounded-[4px] border border-ink-200 flex items-center justify-between hover:bg-ink-50 transition-colors"
              >
                <span className="text-[13px] font-medium text-ink-800 flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5 text-brand-500" />
                  {recurrenceEndType === "INDEFINITE"
                    ? `${previewDates.length} sessões (6 meses)`
                    : `${previewDates.length} sessões`
                  }
                </span>
                <span className={`text-ink-400 text-[11px] transition-transform duration-[120ms] ${showPreview ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>
              {showPreview && (
                <div className="mt-1.5 px-3 py-2 bg-card rounded-[4px] border border-ink-200 max-h-44 overflow-y-auto">
                  {recurrenceEndType === "INDEFINITE" && (
                    <p className="text-[11px] text-ink-500 mb-2">
                      Novas sessões criadas automaticamente
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {previewDates.map((date, index) => (
                      <li key={index} className="text-[12px] text-ink-600 flex items-center gap-2 py-0.5">
                        <span className="w-5 h-5 flex items-center justify-center rounded-[2px] bg-brand-50 text-brand-700 text-[10px] font-semibold tabular-nums flex-shrink-0 border border-brand-100">
                          {index + 1}
                        </span>
                        {date}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
