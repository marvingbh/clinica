"use client"

import Link from "next/link"
import { ListIcon, BanIcon, PrinterIcon } from "@/shared/components/ui"
import { WeekNavigation } from "./WeekNavigation"
import type { Professional } from "../../lib/types"
import { PROFESSIONAL_COLORS, type ProfessionalColorMap } from "../../lib/professional-colors"

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
  return (
    <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30">
      <div className="max-w-[1320px] mx-auto px-4 md:px-6 py-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <WeekNavigation
            weekStart={weekStart}
            onPreviousWeek={onPreviousWeek}
            onNextWeek={onNextWeek}
            onToday={onToday}
          />

          <div className="flex items-center gap-2 print-hidden">
            {onBulkCancel && (
              <button
                type="button"
                onClick={onBulkCancel}
                className="flex items-center gap-2 h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted text-red-600"
                title="Cancelar agendamentos"
              >
                <BanIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted"
              title="Exportar / imprimir agenda"
            >
              <PrinterIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            <Link
              href="/agenda"
              className="flex items-center gap-2 h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted"
            >
              <ListIcon className="w-4 h-4" />
              Dia
            </Link>
          </div>
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
                  {!selectedProfessionalId && professionalColorMap && professionalColorMap.has(profId) && (
                    <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1.5 ${PROFESSIONAL_COLORS[professionalColorMap.get(profId)!].accent}`} />
                  )}
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
