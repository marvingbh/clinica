"use client"

import Link from "next/link"
import { CalendarIcon, ListIcon } from "@/shared/components/ui/icons"
import {
  PROFESSIONAL_COLORS,
  type ProfessionalColorMap,
} from "../../lib/professional-colors"
import type { Professional } from "../../lib/types"

interface RecurrenceHeaderProps {
  professionals: Professional[]
  selectedProfessionalId: string
  isAdmin: boolean
  onSelectProfessional: (id: string) => void
  professionalColorMap?: ProfessionalColorMap
}

export function RecurrenceHeader({
  professionals,
  selectedProfessionalId,
  isAdmin,
  onSelectProfessional,
  professionalColorMap,
}: RecurrenceHeaderProps) {
  return (
    <header className="bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="max-w-[1320px] mx-auto px-4 md:px-6 pt-6 sm:pt-8 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground font-medium">Agenda</p>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Recorrências
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Visão de slots fixos para planejar novos atendimentos recorrentes.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap print-hidden">
            <Link
              href="/agenda"
              className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-all duration-normal active:scale-[0.98] flex items-center gap-2 shadow-sm"
            >
              <ListIcon className="w-4 h-4" />
              Dia
            </Link>
            <Link
              href="/agenda/weekly"
              className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-all duration-normal active:scale-[0.98] flex items-center gap-2 shadow-sm"
            >
              <CalendarIcon className="w-4 h-4" />
              Semana
            </Link>
          </div>
        </div>
      </div>

      {isAdmin && professionals.length > 0 && (
        <div className="max-w-[1320px] mx-auto px-4 md:px-6 pb-4">
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            <button
              type="button"
              onClick={() => onSelectProfessional("")}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedProfessionalId === ""
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
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
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {!selectedProfessionalId && professionalColorMap?.has(profId) && (
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full mr-1.5 ${
                        PROFESSIONAL_COLORS[professionalColorMap.get(profId)!].accent
                      }`}
                    />
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
