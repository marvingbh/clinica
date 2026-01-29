"use client"

import { RecurrenceType, RecurrenceEndType } from "../lib/types"
import { RECURRENCE_TYPE_LABELS, MAX_RECURRENCE_OCCURRENCES } from "../lib/constants"
import { toDateString, addMonthsToDate, toDisplayDate, toIsoDate, toDisplayDateFromDate } from "../lib/utils"
import { useEffect, useState } from "react"

interface RecurrenceOptionsProps {
  isEnabled: boolean
  onToggle: (enabled: boolean) => void
  recurrenceType: RecurrenceType
  onRecurrenceTypeChange: (type: RecurrenceType) => void
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
  isEnabled,
  onToggle,
  recurrenceType,
  onRecurrenceTypeChange,
  recurrenceEndType,
  onRecurrenceEndTypeChange,
  occurrences,
  onOccurrencesChange,
  endDate,
  onEndDateChange,
  minDate,
  startDate,
  startTime,
}: RecurrenceOptionsProps) {
  const [previewDates, setPreviewDates] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)

  // Calculate preview dates
  function calculatePreviewDates() {
    if (!startDate || !startTime || !isEnabled) {
      setPreviewDates([])
      return
    }

    const dates: string[] = []
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)

    let intervalDays = 7
    if (recurrenceType === "BIWEEKLY") intervalDays = 14

    let numOccurrences = 1
    if (recurrenceEndType === "BY_OCCURRENCES") {
      numOccurrences = Math.min(occurrences, MAX_RECURRENCE_OCCURRENCES)
    } else if (recurrenceEndType === "BY_DATE" && endDate) {
      const end = new Date(endDate)
      let count = 0
      let current = new Date(start)
      while (current <= end && count < MAX_RECURRENCE_OCCURRENCES) {
        count++
        if (recurrenceType === "MONTHLY") {
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
        if (recurrenceType === "MONTHLY") {
          current = addMonthsToDate(start, count)
        } else {
          current = new Date(start.getTime() + count * intervalDays * 24 * 60 * 60 * 1000)
        }
      }
      numOccurrences = count
    }

    for (let i = 0; i < numOccurrences; i++) {
      let current: Date
      if (recurrenceType === "MONTHLY") {
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
    if (startDate && startTime) {
      calculatePreviewDates()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnabled, recurrenceType, recurrenceEndType, endDate, occurrences, startDate, startTime])

  return (
    <div className="border-t border-border pt-6">
      <label className="flex items-center justify-between cursor-pointer">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm font-medium text-foreground">Agendamento recorrente</span>
        </div>
        <button
          type="button"
          onClick={() => {
            onToggle(!isEnabled)
            if (isEnabled) {
              setPreviewDates([])
              setShowPreview(false)
            }
          }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isEnabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isEnabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </label>

      {isEnabled && (
        <div className="mt-4 space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
          {/* Recurrence Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Frequencia
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(RECURRENCE_TYPE_LABELS) as RecurrenceType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onRecurrenceTypeChange(type)}
                  className={`h-10 px-3 rounded-md text-sm font-medium border transition-colors ${
                    recurrenceType === type
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-input bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {RECURRENCE_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

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

          {/* Preview Button */}
          <button
            type="button"
            onClick={() => {
              calculatePreviewDates()
              setShowPreview(true)
            }}
            className="w-full h-10 rounded-md border border-primary/50 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Visualizar datas
          </button>

          {/* Preview Dates */}
          {showPreview && previewDates.length > 0 && (
            <div className="mt-3 p-3 bg-background rounded-md border border-border max-h-48 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">
                  {recurrenceEndType === "INDEFINITE"
                    ? `${previewDates.length} sessoes (proximos 6 meses)`
                    : `${previewDates.length} sessoes agendadas`
                  }
                </p>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Fechar
                </button>
              </div>
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
  )
}
