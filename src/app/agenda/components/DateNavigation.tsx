"use client"

import { useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from "@/shared/components/ui/icons"
import { formatDateHeader, toDateString, toDisplayDateFromDate, toIsoDate } from "../lib/utils"

interface DateNavigationProps {
  selectedDate: Date
  onDateChange: (date: Date) => void
  showDatePicker: boolean
  onToggleDatePicker: () => void
}

export function DateNavigation({
  selectedDate,
  onDateChange,
  showDatePicker,
  onToggleDatePicker,
}: DateNavigationProps) {
  const [dateInputValue, setDateInputValue] = useState(toDisplayDateFromDate(selectedDate))

  function handleDateInputChange(value: string) {
    setDateInputValue(value)
    // Try to parse and update if valid DD/MM/YYYY format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const isoDate = toIsoDate(value)
      const date = new Date(isoDate + "T12:00:00")
      if (!isNaN(date.getTime())) {
        onDateChange(date)
        onToggleDatePicker()
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

  function goToPreviousDay() {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 1)
    onDateChange(newDate)
  }

  function goToNextDay() {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 1)
    onDateChange(newDate)
  }

  function goToToday() {
    onDateChange(new Date())
  }

  return (
    <div className="flex items-center justify-between">
      {/* Previous Day */}
      <button
        onClick={goToPreviousDay}
        className="p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label="Dia anterior"
      >
        <ChevronLeftIcon className="w-6 h-6 text-foreground" />
      </button>

      {/* Date Display */}
      <div className="text-center">
        <button
          onClick={onToggleDatePicker}
          className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted transition-colors"
        >
          <span className="text-lg font-semibold text-foreground">
            {formatDateHeader(selectedDate)}
          </span>
          <CalendarIcon className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Date Picker */}
        {showDatePicker && (
          <div className="absolute left-1/2 -translate-x-1/2 mt-2 z-30">
            <div className="bg-card border border-border rounded-lg shadow-lg p-4">
              <input
                type="text"
                placeholder="DD/MM/AAAA"
                value={dateInputValue}
                onChange={(e) => handleDateInputChange(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => {
                  goToToday()
                  onToggleDatePicker()
                }}
                className="w-full mt-2 h-9 rounded-md bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                Ir para hoje
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Next Day */}
      <button
        onClick={goToNextDay}
        className="p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label="Proximo dia"
      >
        <ChevronRightIcon className="w-6 h-6 text-foreground" />
      </button>
    </div>
  )
}
