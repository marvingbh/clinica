"use client"

import { useMemo, useRef } from "react"
import Link from "next/link"
import {
  ListIcon,
  BanIcon,
  PrinterIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/shared/components/ui/icons"
import { Card, CardContent } from "@/shared/components/ui/card"
import {
  formatWeekRange,
  getWeekDays,
  getWeekEnd,
  getWeekStart,
  isSameDay,
  toDateString,
  toDisplayDateFromDate,
} from "../../lib/utils"
import type { Professional } from "../../lib/types"
import { PROFESSIONAL_COLORS, type ProfessionalColorMap } from "../../lib/professional-colors"
import { useAgendaContext } from "../../context/AgendaContext"

const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]

interface WeeklyHeaderProps {
  weekStart: Date
  professionals: Professional[]
  selectedProfessionalId: string
  isAdmin: boolean
  onPreviousWeek: () => void
  onNextWeek: () => void
  onToday: () => void
  onSelectProfessional: (id: string) => void
  professionalColorMap?: ProfessionalColorMap
  onBulkCancel?: () => void
}

export function WeeklyHeader({
  weekStart,
  professionals,
  selectedProfessionalId,
  isAdmin,
  onPreviousWeek,
  onNextWeek,
  onToday,
  onSelectProfessional,
  professionalColorMap,
  onBulkCancel,
}: WeeklyHeaderProps) {
  const { setSelectedDate } = useAgendaContext()
  const dateInputRef = useRef<HTMLInputElement>(null)
  const weekEnd = useMemo(() => getWeekEnd(weekStart), [weekStart])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const weekRange = formatWeekRange(weekStart, weekEnd)
  const today = new Date()
  const todayWeekStart = getWeekStart(today)
  const isCurrentWeek = isSameDay(weekStart, todayWeekStart)
  const selectedIso = toDateString(weekStart)

  function handleDateInputChange(value: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const date = new Date(value + "T12:00:00")
      if (!isNaN(date.getTime())) setSelectedDate(date)
    }
  }

  function openDatePicker() {
    dateInputRef.current?.showPicker()
  }

  function jumpToDay(day: Date) {
    setSelectedDate(day)
  }

  return (
    <header className="bg-gradient-to-br from-primary/5 via-background to-background">
      {/* Title section — matches the daily view's pattern */}
      <div className="max-w-[1320px] mx-auto px-4 md:px-6 pt-6 sm:pt-8 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground font-medium">Agenda</p>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {weekRange}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap print-hidden">
            {onBulkCancel && (
              <button
                type="button"
                onClick={onBulkCancel}
                className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-all duration-normal active:scale-[0.98] flex items-center gap-2 shadow-sm text-red-600"
                title="Cancelar agendamentos"
                aria-label="Cancelar agendamentos"
              >
                <BanIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-all duration-normal active:scale-[0.98] flex items-center gap-2 shadow-sm"
              title="Exportar / imprimir agenda"
              aria-label="Exportar / imprimir agenda"
            >
              <PrinterIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            <Link
              href="/agenda"
              className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-all duration-normal active:scale-[0.98] flex items-center gap-2 shadow-sm"
            >
              <ListIcon className="w-4 h-4" />
              Dia
            </Link>
          </div>
        </div>
      </div>

      {/* Week navigation card — mirrors the daily day-picker card */}
      <div className="max-w-[1320px] mx-auto px-4 md:px-6 pb-4 print-hidden">
        <Card elevation="md" className="overflow-hidden">
          <CardContent className="py-3 px-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPreviousWeek}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                aria-label="Semana anterior"
              >
                <ChevronLeftIcon className="w-5 h-5 text-muted-foreground" />
              </button>

              <div className="flex-1 flex justify-center gap-1 overflow-x-auto scrollbar-hide">
                {weekDays.map((day) => {
                  const dayIsToday = isSameDay(day, today)
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => jumpToDay(day)}
                      title={`Ir para ${toDisplayDateFromDate(day)}`}
                      className={`
                        flex flex-col items-center justify-center min-w-[44px] h-[60px] rounded-xl transition-all duration-normal
                        ${dayIsToday
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "hover:bg-muted text-foreground"
                        }
                      `}
                    >
                      <span className={`text-[10px] font-medium uppercase ${dayIsToday ? "" : "text-muted-foreground"}`}>
                        {WEEKDAY_NAMES[day.getDay()]}
                      </span>
                      <span className="text-lg font-semibold">{day.getDate()}</span>
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={onNextWeek}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors flex-shrink-0"
                aria-label="Proxima semana"
              >
                <ChevronRightIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={onToday}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-all duration-normal ${
                  isCurrentWeek
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={openDatePicker}
                className="h-8 px-3 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {weekRange}
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
        <div className="max-w-[1320px] mx-auto px-4 md:px-6 pb-4">
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
                  {!selectedProfessionalId && professionalColorMap && professionalColorMap.has(profId) && (
                    <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1.5 ${PROFESSIONAL_COLORS[professionalColorMap.get(profId)!].accent}`} />
                  )}
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
