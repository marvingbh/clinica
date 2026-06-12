"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/shared/components/ui"
import type { PublicDaySlots, PublicSlot, Modality } from "./types"

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

function dayLabel(dateISO: string): string {
  // dateISO is "YYYY-MM-DD" in São Paulo; show "DD/MM".
  const [, m, d] = dateISO.split("-")
  return `${d}/${m}`
}

/**
 * Step 2: weekly slot grid (mobile-first columns per day). Week navigation and
 * slot selection are event-handler driven; the parent owns the fetched `days`.
 */
export function WeekSlotPicker({
  days,
  isLoading,
  allowedModalities,
  modality,
  onModalityChange,
  onPrevWeek,
  onNextWeek,
  canGoPrev,
  onSelectSlot,
}: {
  days: PublicDaySlots[]
  isLoading: boolean
  allowedModalities: Modality[]
  modality: Modality
  onModalityChange: (m: Modality) => void
  onPrevWeek: () => void
  onNextWeek: () => void
  canGoPrev: boolean
  onSelectSlot: (slot: PublicSlot) => void
}) {
  const hasAnySlot = days.some((d) => d.slots.length > 0)

  return (
    <div>
      {allowedModalities.length > 1 && (
        <div className="flex gap-2 mb-4">
          {allowedModalities.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModalityChange(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                modality === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground"
              }`}
            >
              {m === "ONLINE" ? "Online" : "Presencial"}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="sm" onClick={onPrevWeek} disabled={!canGoPrev || isLoading} aria-label="Semana anterior">
          <ChevronLeft size={18} />
        </Button>
        <span className="text-sm text-muted-foreground">Semana</span>
        <Button variant="ghost" size="sm" onClick={onNextWeek} disabled={isLoading} aria-label="Próxima semana">
          <ChevronRight size={18} />
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-7 gap-1.5 animate-pulse">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded" />
          ))}
        </div>
      ) : !hasAnySlot ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          Sem horários livres nesta semana. Tente a próxima.
        </p>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => (
            <div key={day.date} className="min-w-0">
              <div className="text-center mb-1.5">
                <div className="text-[11px] text-muted-foreground">{WEEKDAY_LABELS[day.weekday]}</div>
                <div className="text-xs font-medium text-foreground">{dayLabel(day.date)}</div>
              </div>
              <div className="space-y-1">
                {day.slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => onSelectSlot(slot)}
                    className="w-full py-1.5 px-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30 transition-colors"
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
