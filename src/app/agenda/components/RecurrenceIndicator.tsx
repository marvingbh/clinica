"use client"

import { RefreshCwIcon, SquarePenIcon, BanIcon, AlertTriangleIcon } from "@/shared/components/ui/icons"
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
          <RefreshCwIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
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
              <SquarePenIcon className="w-3 h-3 inline mr-1" />
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
                  <RefreshCwIcon className="w-3 h-3 inline mr-1" />
                  Restaurar
                </>
              ) : (
                <>
                  <BanIcon className="w-3 h-3 inline mr-1" />
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
          <AlertTriangleIcon className="w-4 h-4" />
          <span className="text-xs font-medium">Esta data foi marcada como excecao (pulada)</span>
        </div>
      )}
    </div>
  )
}
