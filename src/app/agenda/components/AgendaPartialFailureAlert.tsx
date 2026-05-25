/**
 * Enhanced alert component for partial agenda data failures
 * Shows which endpoints failed while allowing users to see available data
 */

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, X } from "lucide-react"
import { AgendaError } from "@/lib/errors/agenda-errors"

interface AgendaPartialFailureAlertProps {
  message: string
  failedEndpoints: string[]
  errors: AgendaError[]
  onRetry: () => void
  onDismiss: () => void
  isRetrying?: boolean
}

export function AgendaPartialFailureAlert({
  message,
  failedEndpoints,
  errors,
  onRetry,
  onDismiss,
  isRetrying = false
}: AgendaPartialFailureAlertProps) {
  const [showDetails, setShowDetails] = useState(false)

  const getFailureDetails = () => {
    const details: string[] = []

    failedEndpoints.forEach((endpoint) => {
      const error = errors.find(e => e.affectedEndpoints.includes(endpoint))
      if (error?.technicalDetails) {
        details.push(`${endpoint}: ${error.technicalDetails}`)
      } else {
        details.push(`${endpoint}: falha na conexão`)
      }
    })

    return details
  }

  return (
    <div
      className="flex flex-col gap-3 p-4 mb-4 bg-orange-50 border border-orange-200 rounded-xl animate-scale-in"
      role="alert"
    >
      {/* Main Alert Row */}
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-orange-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-orange-800 font-medium">
            {message}
          </p>
          <p className="text-xs text-orange-700 mt-1">
            Disponível: agendamentos, outros dados podem estar desatualizados
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            size="sm"
            variant="outlined"
            className="text-orange-700 border-orange-300 hover:bg-orange-100"
          >
            {isRetrying && <RefreshCw className="mr-1 h-3 w-3 animate-spin" />}
            {isRetrying ? "Tentando..." : "Recarregar"}
          </Button>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 px-2 py-1 text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-100 rounded transition-colors"
          >
            <span>Detalhes</span>
            {showDetails ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          <button
            onClick={onDismiss}
            className="p-1 text-orange-600 hover:text-orange-800 hover:bg-orange-100 rounded transition-colors"
            aria-label="Fechar alerta"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expandable Details */}
      {showDetails && (
        <div className="mt-2 p-3 bg-orange-100 rounded-md border border-orange-200">
          <p className="text-xs font-medium text-orange-800 mb-2">
            Falha ao carregar:
          </p>
          <ul className="space-y-1">
            {getFailureDetails().map((detail, index) => (
              <li key={index} className="text-xs text-orange-700 font-mono bg-white px-2 py-1 rounded">
                {detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}