"use client"

import { Appointment } from "../lib/types"
import { RECURRENCE_TYPE_LABELS } from "../lib/constants"
import { isDateException } from "../lib/utils"

interface RecurrenceIndicatorProps {
  appointment: Appointment
  onEdit: () => void
  onToggleException: (action: "skip" | "unskip") => void
  isManagingException: boolean
}

export function RecurrenceIndicator({
  appointment,
  onEdit,
  onToggleException,
  isManagingException,
}: RecurrenceIndicatorProps) {
  if (!appointment.recurrence) return null

  const isException = isDateException(appointment)
  const recurrence = appointment.recurrence

  return (
    <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950 border-b border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Agendamento recorrente
          </span>
          <span className="text-xs text-blue-600 dark:text-blue-400">
            ({RECURRENCE_TYPE_LABELS[recurrence.recurrenceType]}
            {recurrence.recurrenceEndType === "INDEFINITE" && " - sem fim"})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Edit recurrence button */}
          {recurrence.isActive && (
            <button
              type="button"
              onClick={onEdit}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors"
            >
              <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar
            </button>
          )}
          {/* Skip/Unskip button for exceptions */}
          {recurrence.isActive && (
            <button
              type="button"
              onClick={() => onToggleException(isException ? "unskip" : "skip")}
              disabled={isManagingException}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${
                isException
                  ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800"
                  : "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900 dark:text-orange-300 dark:hover:bg-orange-800"
              }`}
            >
              {isManagingException ? (
                "..."
              ) : isException ? (
                <>
                  <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Restaurar
                </>
              ) : (
                <>
                  <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Pular data
                </>
              )}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
        Este agendamento faz parte de uma serie recorrente.
        {recurrence.exceptions?.length > 0 && (
          <span className="ml-1 text-orange-600 dark:text-orange-400">
            ({recurrence.exceptions.length} {recurrence.exceptions.length === 1 ? "excecao" : "excecoes"})
          </span>
        )}
      </p>
      {isException && (
        <div className="mt-2 flex items-center gap-2 text-orange-600 dark:text-orange-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-xs font-medium">Esta data foi marcada como excecao (pulada)</span>
        </div>
      )}
    </div>
  )
}
