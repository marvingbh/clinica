"use client"

import Link from "next/link"
import { ListIcon } from "@/shared/components/ui"
import { WeekNavigation } from "./WeekNavigation"
import type { WeeklyHeaderProps } from "./types"

export function WeeklyHeader({
  weekStart,
  professionals,
  selectedProfessionalId,
  isAdmin,
  onPreviousWeek,
  onNextWeek,
  onToday,
  onSelectProfessional,
}: WeeklyHeaderProps) {
  return (
    <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <WeekNavigation
            weekStart={weekStart}
            onPreviousWeek={onPreviousWeek}
            onNextWeek={onNextWeek}
            onToday={onToday}
          />

          <Link
            href="/agenda"
            className="flex items-center gap-2 h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted"
          >
            <ListIcon className="w-4 h-4" />
            Dia
          </Link>
        </div>

        {isAdmin && professionals.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
            <button
              type="button"
              onClick={() => onSelectProfessional("")}
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
                  onClick={() => onSelectProfessional(profId)}
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
    </header>
  )
}
