"use client"

import { useEffect, useState } from "react"
import { CalendarIcon, RefreshCwIcon } from "@/shared/components/ui/icons"
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
}

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
}: RecurrenceOptionsProps) {
  const [previewDates, setPreviewDates] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)

  const isRecurring = appointmentType !== "SINGLE"

  // Calculate preview dates
  function calculatePreviewDates() {
    if (!startDate || !startTime || !isRecurring) {
      setPreviewDates([])
      return
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

    setPreviewDates(dates)
  }

  useEffect(() => {
    if (startDate && startTime && isRecurring) {
      calculatePreviewDates()
    } else {
      setPreviewDates([])
      setShowPreview(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentType, recurrenceEndType, endDate, occurrences, startDate, startTime])

  return (
    <div className="space-y-4">
      {/* Appointment Type Selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Frequencia
        </label>
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(APPOINTMENT_TYPE_LABELS) as AppointmentType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                onAppointmentTypeChange(type)
                if (type === "SINGLE") {
                  setPreviewDates([])
                  setShowPreview(false)
                }
              }}
              className={`h-10 px-2 rounded-xl text-sm font-medium border-2 transition-all active:scale-[0.97] ${
                appointmentType === type
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-transparent bg-muted/60 text-foreground hover:bg-muted"
              }`}
            >
              {APPOINTMENT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Recurrence End Options - only show for recurring types */}
      {isRecurring && (
        <div className="space-y-3 p-3.5 bg-muted/20 rounded-xl border border-border/60">
          {/* Day of Week Indicator */}
          {startDate && (() => {
            const dayOfWeek = parseLocalDate(startDate).getDay()
            return (
              <div className="flex items-center gap-2 text-sm">
                <RefreshCwIcon className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="text-muted-foreground">
                  Toda{" "}
                  <span className="font-medium text-foreground">{FULL_DAY_NAMES[dayOfWeek]}</span>
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                  {DAY_LABELS[dayOfWeek]}
                </span>
              </div>
            )
          })()}

          {/* Recurrence End Type */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Terminar
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => onRecurrenceEndTypeChange("BY_OCCURRENCES")}
                className={`h-9 px-2 rounded-lg text-xs font-medium border transition-all ${
                  recurrenceEndType === "BY_OCCURRENCES"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                Apos N sessoes
              </button>
              <button
                type="button"
                onClick={() => onRecurrenceEndTypeChange("BY_DATE")}
                className={`h-9 px-2 rounded-lg text-xs font-medium border transition-all ${
                  recurrenceEndType === "BY_DATE"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                Em uma data
              </button>
              <button
                type="button"
                onClick={() => onRecurrenceEndTypeChange("INDEFINITE")}
                className={`h-9 px-2 rounded-lg text-xs font-medium border transition-all ${
                  recurrenceEndType === "INDEFINITE"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input bg-background text-foreground hover:bg-muted"
                }`}
              >
                Sem fim
              </button>
            </div>
          </div>

          {/* Occurrences Input */}
          {recurrenceEndType === "BY_OCCURRENCES" && (
            <div>
              <label htmlFor="occurrences" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Numero de sessoes
              </label>
              <input
                id="occurrences"
                type="number"
                value={occurrences}
                onChange={(e) => onOccurrencesChange(Math.min(MAX_RECURRENCE_OCCURRENCES, Math.max(1, parseInt(e.target.value) || 1)))}
                min={1}
                max={MAX_RECURRENCE_OCCURRENCES}
                className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Max {MAX_RECURRENCE_OCCURRENCES} sessoes
              </p>
            </div>
          )}

          {/* Indefinite Info */}
          {recurrenceEndType === "INDEFINITE" && (
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200/60 dark:border-blue-800/60">
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                Sessoes criadas automaticamente para 6 meses, estendidas semanalmente. Finalize a qualquer momento.
              </p>
            </div>
          )}

          {/* End Date Input */}
          {recurrenceEndType === "BY_DATE" && (
            <div>
              <label htmlFor="recurrenceEndDate" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Data final
              </label>
              <input
                id="recurrenceEndDate"
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors"
              />
            </div>
          )}

          {/* Preview Dates - click to expand */}
          {previewDates.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="w-full p-2.5 bg-background rounded-xl border border-border/60 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <span className="text-sm font-medium text-foreground flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                  {recurrenceEndType === "INDEFINITE"
                    ? `${previewDates.length} sessoes (6 meses)`
                    : `${previewDates.length} sessoes`
                  }
                </span>
                <span className={`text-muted-foreground text-xs transition-transform duration-200 ${showPreview ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>
              {showPreview && (
                <div className="mt-1.5 p-2.5 bg-background rounded-xl border border-border/60 max-h-44 overflow-y-auto">
                  {recurrenceEndType === "INDEFINITE" && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Novas sessoes criadas automaticamente
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {previewDates.map((date, index) => (
                      <li key={index} className="text-xs text-muted-foreground flex items-center gap-2 py-0.5">
                        <span className="w-5 h-5 flex items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-semibold tabular-nums flex-shrink-0">
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
