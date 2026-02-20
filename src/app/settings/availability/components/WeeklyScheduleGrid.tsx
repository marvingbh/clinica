"use client"

import { TimeBlock, DAYS_OF_WEEK } from "./types"

interface WeeklyScheduleGridProps {
  rules: TimeBlock[]
  onToggleDay: (dayOfWeek: number) => void
  onOpenBlockEditor: (dayOfWeek: number, index?: number | null) => void
  onRemoveAllBlocks: (dayOfWeek: number) => void
}

export function WeeklyScheduleGrid({
  rules,
  onToggleDay,
  onOpenBlockEditor,
  onRemoveAllBlocks,
}: WeeklyScheduleGridProps) {
  function getRulesForDay(dayOfWeek: number): TimeBlock[] {
    return rules.filter((r) => r.dayOfWeek === dayOfWeek)
  }

  return (
    <div className="space-y-4">
      {DAYS_OF_WEEK.map((day) => {
        const dayRules = getRulesForDay(day.value)
        const hasRules = dayRules.length > 0
        const allActive = hasRules && dayRules.every((r) => r.isActive)

        return (
          <div
            key={day.value}
            className={`bg-card border border-border rounded-lg p-4 sm:p-6 ${
              !allActive && hasRules ? "opacity-60" : ""
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Day toggle */}
              <div className="flex items-center gap-3 sm:w-32">
                <button
                  type="button"
                  onClick={() => onToggleDay(day.value)}
                  className={`relative w-14 h-8 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background touch-manipulation ${
                    allActive ? "bg-primary" : "bg-muted"
                  }`}
                  aria-label={`Toggle ${day.label}`}
                >
                  <span
                    className={`absolute top-1.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      allActive ? "left-8" : "left-1"
                    }`}
                  />
                </button>
                <span className="font-medium text-foreground">
                  <span className="hidden sm:inline">{day.label}</span>
                  <span className="sm:hidden">{day.short}</span>
                </span>
              </div>

              {/* Time blocks */}
              <div className="flex-1 flex flex-wrap gap-2">
                {dayRules.map((rule, index) => (
                  <button
                    key={rule.id || `${day.value}-${index}`}
                    type="button"
                    onClick={() => onOpenBlockEditor(day.value, index)}
                    className={`min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background touch-manipulation ${
                      rule.isActive
                        ? "bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
                        : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                    }`}
                  >
                    {rule.startTime} - {rule.endTime}
                  </button>
                ))}

                {/* Add time block button */}
                <button
                  type="button"
                  onClick={() => onOpenBlockEditor(day.value)}
                  className="min-h-[44px] px-4 py-2 rounded-md text-sm font-medium border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background touch-manipulation"
                >
                  + Adicionar
                </button>
              </div>

              {/* Remove all */}
              {hasRules && (
                <button
                  type="button"
                  onClick={() => onRemoveAllBlocks(day.value)}
                  className="text-sm text-destructive hover:underline focus:outline-none"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
