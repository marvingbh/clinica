"use client"

import { useEffect, useState } from "react"
import { CalendarIcon } from "@/shared/components/ui/icons"
import { RecurrenceType, RecurrenceEndType } from "../lib/types"
import { MAX_RECURRENCE_OCCURRENCES } from "../lib/constants"
import { toDisplayDate, addMonthsToDate, toIsoDate } from "../lib/utils"

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
        <label className="block text-sm font-medium text-foreground mb-2">
          Tipo de Agendamento
        </label>
        <div className="grid grid-cols-4 gap-2">
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
              className={`h-10 px-2 rounded-md text-sm font-medium border transition-colors ${
                appointmentType === type
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-input bg-background text-foreground hover:bg-muted"
              }`}
            >
              {APPOINTMENT_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Recurrence End Options - only show for recurring types */}
      {isRecurring && (
        <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
          {/* Day of Week Indicator */}
          {startDate && (() => {
            const dayOfWeek = parseLocalDate(startDate).getDay()
            return (
              <div className="p-3 bg-muted/50 rounded-md border border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    Dia da semana:
                  </span>
                  <span className="px-2 py-1 rounded bg-primary/10 text-primary text-sm font-medium">
                    {DAY_LABELS[dayOfWeek]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Os agendamentos ocorrerao toda {FULL_DAY_NAMES[dayOfWeek]}
                </p>
              </div>
            )
          })()}

          {/* Recurrence End Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Terminar
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onRecurrenceEndTypeChange("BY_OCCURRENCES")}
                className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
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
                className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
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
                className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
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
              <label htmlFor="occurrences" className="block text-sm font-medium text-foreground mb-2">
                Numero de sessoes
              </label>
              <input
                id="occurrences"
                type="number"
                value={occurrences}
                onChange={(e) => onOccurrencesChange(Math.min(MAX_RECURRENCE_OCCURRENCES, Math.max(1, parseInt(e.target.value) || 1)))}
                min={1}
                max={MAX_RECURRENCE_OCCURRENCES}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Maximo de {MAX_RECURRENCE_OCCURRENCES} sessoes (1 ano semanal)
              </p>
            </div>
          )}

          {/* Indefinite Info */}
          {recurrenceEndType === "INDEFINITE" && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Os agendamentos serao criados automaticamente para os proximos 6 meses e estendidos semanalmente.
                Voce pode finalizar a recorrencia a qualquer momento.
              </p>
            </div>
          )}

          {/* End Date Input */}
          {recurrenceEndType === "BY_DATE" && (
            <div>
              <label htmlFor="recurrenceEndDate" className="block text-sm font-medium text-foreground mb-2">
                Data final
              </label>
              <input
                id="recurrenceEndDate"
                type="text"
                placeholder="DD/MM/AAAA"
                value={endDate ? toDisplayDate(endDate) : ""}
                onChange={(e) => {
                  const value = e.target.value
                  // If valid Brazilian format, convert to ISO
                  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
                    onEndDateChange(toIsoDate(value))
                  } else if (value === "") {
                    onEndDateChange("")
                  }
                }}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
              <p className="text-xs text-muted-foreground mt-1">Formato: DD/MM/AAAA</p>
            </div>
          )}

          {/* Preview Dates - click to expand */}
          {previewDates.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="w-full p-3 bg-background rounded-md border border-border flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium text-foreground flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  {recurrenceEndType === "INDEFINITE"
                    ? `${previewDates.length} sessoes (proximos 6 meses)`
                    : `${previewDates.length} sessoes agendadas`
                  }
                </span>
                <span className={`text-muted-foreground transition-transform ${showPreview ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>
              {showPreview && (
                <div className="mt-2 p-3 bg-background rounded-md border border-border max-h-48 overflow-y-auto">
                  {recurrenceEndType === "INDEFINITE" && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Novas sessoes serao criadas automaticamente
                    </p>
                  )}
                  <ul className="space-y-1">
                    {previewDates.map((date, index) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
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
