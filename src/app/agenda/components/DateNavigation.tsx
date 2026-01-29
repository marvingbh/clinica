"use client"

import { formatDateHeader, toDateString } from "../lib/utils"

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
        <svg className="w-6 h-6 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
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
          <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>

        {/* Date Picker */}
        {showDatePicker && (
          <div className="absolute left-1/2 -translate-x-1/2 mt-2 z-30">
            <div className="bg-card border border-border rounded-lg shadow-lg p-4">
              <input
                type="date"
                value={toDateString(selectedDate)}
                onChange={(e) => {
                  const date = new Date(e.target.value + "T12:00:00")
                  onDateChange(date)
                  onToggleDatePicker()
                }}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
        <svg className="w-6 h-6 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}
