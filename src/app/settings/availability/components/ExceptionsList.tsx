"use client"

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
  return (
    <div className="mt-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-xl font-semibold text-foreground">
          Bloqueios e Exceções
        </h2>
        <button
          type="button"
          onClick={() => onOpenExceptionEditor()}
          className="h-10 px-4 rounded-md border border-primary text-primary font-medium hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
        >
          + Adicionar Exceção
        </button>
      </div>

      {exceptions.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <p className="text-muted-foreground">
            Nenhuma exceção configurada. Adicione bloqueios para férias, feriados ou horários extras de atendimento.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Sort date exceptions by date */}
          {[...exceptions]
            .sort((a, b) => {
              if (a.date && b.date) {
                return new Date(a.date).getTime() - new Date(b.date).getTime()
              }
              return 0
            })
            .map((exception) => (
              <div
                key={exception.id}
                className={`bg-card border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${
                  exception.isAvailable
                    ? "border-green-500/30 bg-green-500/5"
                    : "border-red-500/30 bg-red-500/5"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        exception.isAvailable
                          ? "bg-green-500/20 text-green-700 dark:text-green-400"
                          : "bg-red-500/20 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {exception.isAvailable ? "Disponível" : "Bloqueado"}
                    </span>
                    {exception.isClinicWide ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-700 dark:text-purple-400">
                        Toda a clínica
                      </span>
                    ) : exception.professionalName ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-700 dark:text-blue-400">
                        {exception.professionalName}
                      </span>
                    ) : null}
                    {exception.startTime && exception.endTime && (
                      <span className="text-sm text-muted-foreground">
                        {exception.startTime} - {exception.endTime}
                      </span>
                    )}
                    {!exception.startTime && (
                      <span className="text-sm text-muted-foreground">
                        Dia inteiro
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-foreground">
                    {exception.date ? formatExceptionDate(exception.date) : ""}
                  </p>
                  {exception.reason && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {exception.reason}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteException(exception.id)}
                  disabled={isDeletingException === exception.id}
                  className="shrink-0 px-3 py-1.5 text-sm text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors disabled:opacity-50"
                >
                  {isDeletingException === exception.id ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground mt-4">
        Use bloqueios para marcar dias de férias ou indisponibilidade.
        Use exceções de disponibilidade para atender fora do horário normal.
      </p>
    </div>
  )
}
