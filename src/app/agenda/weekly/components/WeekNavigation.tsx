"use client"

import { getWeekEnd, formatWeekRange } from "../../lib/utils"

interface WeekNavigationProps {
  weekStart: Date
  onPreviousWeek: () => void
  onNextWeek: () => void
  onToday: () => void
}

export function WeekNavigation({ weekStart, onPreviousWeek, onNextWeek, onToday }: WeekNavigationProps) {
  const weekEnd = getWeekEnd(weekStart)
  const weekRange = formatWeekRange(weekStart, weekEnd)

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPreviousWeek}
          className="h-10 w-10 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted"
          aria-label="Semana anterior"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onToday}
          className="h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={onNextWeek}
          className="h-10 w-10 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted"
          aria-label="Proxima semana"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <h2 className="text-lg font-semibold text-foreground">{weekRange}</h2>
    </div>
  )
}
