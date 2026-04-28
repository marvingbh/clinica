"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "@/shared/components/ui/icons"
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 min-w-0">
      <h2 className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">
        {weekRange}
      </h2>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onPreviousWeek}
          className="h-9 w-9 sm:h-10 sm:w-10 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted"
          aria-label="Semana anterior"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="h-9 sm:h-10 px-3 sm:px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={onNextWeek}
          className="h-9 w-9 sm:h-10 sm:w-10 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted"
          aria-label="Proxima semana"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
