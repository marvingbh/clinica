"use client"

import { useMemo, useRef } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon } from "@/shared/components/ui/icons"
import { Card, CardContent } from "@/shared/components/ui/card"
import { formatDateHeader, toDateString, toDisplayDateFromDate } from "../lib/utils"
import type { Professional } from "../lib/types"

export interface AgendaHeaderProps {
  selectedDate: Date
  onDateChange: (date: Date) => void
  selectedProfessionalId: string
  onProfessionalChange: (id: string) => void
  professionals: Professional[]
  isAdmin: boolean
  onGoToPrevious: () => void
  onGoToNext: () => void
  onGoToToday: () => void
}

const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]

function getWeekDays(centerDate: Date): Date[] {
  const days: Date[] = []
  const center = new Date(centerDate)
  // Get 3 days before and 3 days after
  for (let i = -3; i <= 3; i++) {
    const day = new Date(center)
    day.setDate(center.getDate() + i)
    days.push(day)
  }
  return days
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function AgendaHeader({
  selectedDate,
  onDateChange,
  selectedProfessionalId,
  onProfessionalChange,
  professionals,
  isAdmin,
  onGoToPrevious,
  onGoToNext,
  onGoToToday,
}: AgendaHeaderProps) {
  const dateInputRef = useRef<HTMLInputElement>(null)
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate])
  const selectedIso = toDateString(selectedDate)

  function handleDateInputChange(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(value + "T12:00:00")
      if (!isNaN(date.getTime())) {
        onDateChange(date)
      }
    }
  }

  function openDatePicker() {
    dateInputRef.current?.showPicker()
  }

  return (
    <header className="bg-gradient-to-br from-primary/5 via-background to-background">
      {/* Title Section */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-sm text-muted-foreground font-medium">Agenda</p>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {formatDateHeader(selectedDate)}
            </h1>
          </div>
          <Link
            href={`/agenda/weekly?date=${toDateString(selectedDate)}`}
            className="h-10 px-4 rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-all duration-normal active:scale-[0.98] flex items-center gap-2 shadow-sm"
          >
            <CalendarIcon className="w-4 h-4" />
            Semana
          </Link>
        </div>
      </div>

      {/* Week Day Picker */}
      <div className="max-w-4xl mx-auto px-4 pb-4">
        <Card elevation="md" className="overflow-hidden">
          <CardContent className="py-3 px-2">
            <div className="flex items-center gap-1">
              <button
                onClick={onGoToPrevious}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                aria-label="Dia anterior"
              >
                <ChevronLeftIcon className="w-5 h-5 text-muted-foreground" />
              </button>

              <div className="flex-1 flex justify-center gap-1 overflow-hidden">
                {weekDays.map((day) => {
                  const isSelected = isSameDay(day, selectedDate)
                  const dayIsToday = isToday(day)
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => onDateChange(day)}
                      className={`
                        flex flex-col items-center justify-center min-w-[44px] h-[60px] rounded-xl transition-all duration-normal
                        ${isSelected
                          ? "bg-primary text-primary-foreground shadow-md scale-105"
                          : dayIsToday
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "hover:bg-muted text-foreground"
                        }
                      `}
                    >
                      <span className={`text-[10px] font-medium uppercase ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                        {WEEKDAY_NAMES[day.getDay()]}
                      </span>
                      <span className={`text-lg font-semibold ${isSelected ? "" : ""}`}>
                        {day.getDate()}
                      </span>
                    </button>
                  )
                })}
              </div>

              <button
                onClick={onGoToNext}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                aria-label="Proximo dia"
              >
                <ChevronRightIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Today button and date input toggle */}
            <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-border">
              <button
                onClick={onGoToToday}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-all duration-normal ${
                  isToday(selectedDate)
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Hoje
              </button>
              <button
                onClick={openDatePicker}
                className="h-8 px-3 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {toDisplayDateFromDate(selectedDate)}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={selectedIso}
                onChange={(e) => handleDateInputChange(e.target.value)}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Professional Tabs */}
      {isAdmin && professionals.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-4">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              type="button"
              onClick={() => onProfessionalChange("")}
              className={`
                flex-shrink-0 h-10 px-4 rounded-xl text-sm font-medium transition-all duration-normal
                ${selectedProfessionalId === ""
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted"
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
                    flex-shrink-0 h-10 px-4 rounded-xl text-sm font-medium transition-all duration-normal whitespace-nowrap
                    ${isSelected
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-card border border-border text-muted-foreground hover:bg-muted"
                    }
                  `}
                >
                  {prof.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </header>
  )
}
