"use client"

import { CalendarOff, CalendarPlus, Building2, User, Clock, Trash2 } from "lucide-react"
import { AvailabilityException } from "./types"

interface ExceptionsListProps {
  exceptions: AvailabilityException[]
  isDeletingException: string | null
  onOpenExceptionEditor: (exception?: AvailabilityException) => void
  onDeleteException: (id: string) => void
  formatExceptionDate: (dateStr: string) => string
}

export function ExceptionsList({
  exceptions,
  isDeletingException,
  onOpenExceptionEditor,
  onDeleteException,
  formatExceptionDate,
}: ExceptionsListProps) {
  const sorted = [...exceptions].sort((a, b) => {
    if (a.date && b.date) return new Date(a.date).getTime() - new Date(b.date).getTime()
    return 0
  })

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground tracking-[-0.01em]">Bloqueios e Exceções</h2>
        <button
          type="button"
          onClick={() => onOpenExceptionEditor()}
          className="h-9 px-3.5 rounded-xl border border-dashed border-border/80 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-colors"
        >
          + Adicionar
        </button>
      </div>

      {exceptions.length === 0 ? (
        <div className="rounded-2xl bg-muted/50 border border-transparent px-5 py-10 text-center">
          <CalendarOff className="mx-auto mb-3 text-muted-foreground/40" size={28} strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            Nenhuma exceção configurada.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Adicione bloqueios para férias, feriados ou horários extras.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sorted.map((ex) => (
            <div
              key={ex.id}
              className={`rounded-2xl border px-4 sm:px-5 py-3.5 flex items-start sm:items-center gap-3 transition-colors ${
                ex.isAvailable
                  ? "bg-emerald-500/[0.03] border-emerald-500/20"
                  : "bg-red-500/[0.03] border-red-500/20"
              }`}
            >
              <div
                className={`mt-0.5 sm:mt-0 shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                  ex.isAvailable ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500"
                }`}
              >
                {ex.isAvailable ? <CalendarPlus size={16} strokeWidth={1.8} /> : <CalendarOff size={16} strokeWidth={1.8} />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {ex.date ? formatExceptionDate(ex.date) : ""}
                  </span>
                  {ex.startTime && ex.endTime ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock size={11} /> {ex.startTime} – {ex.endTime}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Dia inteiro</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  {ex.isClinicWide ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 dark:text-purple-400">
                      <Building2 size={11} /> Toda a clínica
                    </span>
                  ) : ex.professionalName ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      <User size={11} /> {ex.professionalName}
                    </span>
                  ) : null}
                  {ex.reason && (
                    <span className="text-[11px] text-muted-foreground/70 truncate">
                      &middot; {ex.reason}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDeleteException(ex.id)}
                disabled={isDeletingException === ex.id}
                className="shrink-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <Trash2 size={15} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
