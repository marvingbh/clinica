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
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPreviousWeek}
          className="h-10 w-10 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted"
          aria-label="Semana anterior"
        >
          <ChevronLeftIcon className="w-5 h-5" />
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
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>

      <h2 className="text-lg font-semibold text-foreground">{weekRange}</h2>
    </div>
  )
}
