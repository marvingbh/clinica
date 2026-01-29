"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from "@/shared/components/ui/icons"
import { formatDateHeader, toDateString, toDisplayDateFromDate, toIsoDate } from "../lib/utils"
import type { Professional } from "../lib/types"

export interface AgendaHeaderProps {
  selectedDate: Date
  onDateChange: (date: Date) => void
  showDatePicker: boolean
  onToggleDatePicker: () => void
  selectedProfessionalId: string
  onProfessionalChange: (id: string) => void
  professionals: Professional[]
  isAdmin: boolean
  onGoToPrevious: () => void
  onGoToNext: () => void
  onGoToToday: () => void
}

export function AgendaHeader({
  selectedDate,
  onDateChange,
  showDatePicker,
  onToggleDatePicker,
  selectedProfessionalId,
  onProfessionalChange,
  professionals,
  isAdmin,
  onGoToPrevious,
  onGoToNext,
  onGoToToday,
}: AgendaHeaderProps) {
  const [dateInputValue, setDateInputValue] = useState(toDisplayDateFromDate(selectedDate))

  function handleDateInputChange(value: string) {
    setDateInputValue(value)
    // Try to parse and update if valid DD/MM/YYYY format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const isoDate = toIsoDate(value)
      const date = new Date(isoDate + "T12:00:00")
      if (!isNaN(date.getTime())) {
        onDateChange(date)
      }
    }
  }

  // Update input when selectedDate changes from external navigation
  if (toDisplayDateFromDate(selectedDate) !== dateInputValue && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInputValue)) {
    const inputIso = toIsoDate(dateInputValue)
    const selectedIso = toDateString(selectedDate)
    if (inputIso !== selectedIso) {
      setDateInputValue(toDisplayDateFromDate(selectedDate))
    }
  }

  return (
    <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4 mb-3">
          <button onClick={onToggleDatePicker} className="flex-1 text-left">
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              {formatDateHeader(selectedDate)}
              <ChevronDownIcon className={`w-5 h-5 transition-transform ${showDatePicker ? "rotate-180" : ""}`} />
            </h1>
          </button>

          <Link
            href={`/agenda/weekly?date=${toDateString(selectedDate)}`}
            className="flex items-center gap-2 h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted flex-shrink-0"
          >
            <CalendarIcon className="w-4 h-4" />
            Semana
          </Link>
        </div>

        {isAdmin && professionals.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            <button
              type="button"
              onClick={() => onProfessionalChange("")}
              className={`
                flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors
                ${selectedProfessionalId === ""
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                }
              `}
            >
              Todos
            </button>
            {professionals.map((prof) => {
              const profId = prof.professionalProfile?.id || ""
              const isSelected = selectedProfessionalId === profId
              return (
                <button
                  key={prof.id}
                  type="button"
                  onClick={() => onProfessionalChange(profId)}
                  className={`
                    flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                    ${isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }
                  `}
                >
                  {prof.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {showDatePicker && (
        <div className="border-t border-border bg-card">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={onGoToPrevious}
                className="h-10 w-10 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <button
                onClick={onGoToToday}
                className="h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted"
              >
                Hoje
              </button>
              <button
                onClick={onGoToNext}
                className="h-10 w-10 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              placeholder="DD/MM/AAAA"
              value={dateInputValue}
              onChange={(e) => handleDateInputChange(e.target.value)}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}
    </header>
  )
}
