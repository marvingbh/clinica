/**
 * Specialized error state component for agenda views
 * Shows reassuring messages that user data is safe and provides retry options
 */

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { Card, CardContent } from "@/shared/components/ui/card"
import { AlertCircle, Wifi, WifiOff, RefreshCw, ChevronDown, ChevronUp } from "lucide-react"
import { AgendaError, AgendaErrorType } from "@/lib/errors/agenda-errors"

interface AgendaErrorStateProps {
  error: AgendaError
  onRetry: () => void
  isRetrying?: boolean
  className?: string
}

export function AgendaErrorState({
  error,
  onRetry,
  isRetrying = false,
  className = ""
}: AgendaErrorStateProps) {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)

  const getErrorIcon = () => {
    switch (error.type) {
      case AgendaErrorType.NETWORK_OFFLINE:
        return <WifiOff className="h-12 w-12 text-orange-500" />
      case AgendaErrorType.DATABASE_CONNECTION:
      case AgendaErrorType.SERVER_ERROR:
        return <AlertCircle className="h-12 w-12 text-blue-500" />
      case AgendaErrorType.NETWORK_TIMEOUT:
        return <Wifi className="h-12 w-12 text-yellow-500" />
      case AgendaErrorType.AUTHENTICATION:
        return <AlertCircle className="h-12 w-12 text-red-500" />
      default:
        return <AlertCircle className="h-12 w-12 text-gray-500" />
    }
  }

  const getRetryButtonText = () => {
    if (isRetrying) return "Tentando novamente..."
    if (error.retryAttempt && error.maxRetries) {
      return `Tentar novamente (${error.retryAttempt}/${error.maxRetries})`
    }
    return "Tentar novamente"
  }

  const getLastAttemptText = () => {
    if (!error.timestamp) return null

    const now = new Date()
    const diffMs = now.getTime() - error.timestamp.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))

    if (diffMinutes < 1) {
      return "Última tentativa: agora"
    } else if (diffMinutes === 1) {
      return "Última tentativa: 1 minuto atrás"
    } else {
      return `Última tentativa: ${diffMinutes} minutos atrás`
    }
  }

  const showRetryButton = error.canRetry && error.type !== AgendaErrorType.AUTHENTICATION

  return (
    <div className={`flex items-center justify-center min-h-[400px] p-6 ${className}`}>
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          {/* Error Icon */}
          <div className="flex justify-center">
            {getErrorIcon()}
          </div>

          {/* Primary Message */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">
              Problema temporário
            </h3>
            <p className="text-gray-600 leading-relaxed">
              {error.message}
            </p>
          </div>

          {/* Retry Button */}
          {showRetryButton && (
            <Button
              onClick={onRetry}
              disabled={isRetrying}
              className="w-full"
              variant="primary"
            >
              {isRetrying && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {getRetryButtonText()}
            </Button>
          )}

          {/* Auth Error - Special Case */}
          {error.type === AgendaErrorType.AUTHENTICATION && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Por favor, faça login novamente para continuar
              </p>
              <Button
                onClick={() => window.location.href = "/login"}
                className="w-full"
                variant="primary"
              >
                Fazer login
              </Button>
            </div>
          )}

          {/* Last Attempt Timestamp */}
          {getLastAttemptText() && (
            <p className="text-xs text-gray-400">
              {getLastAttemptText()}
            </p>
          )}

          {/* Technical Details (Collapsible) */}
          {error.technicalDetails && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                className="flex items-center justify-center w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <span className="mr-1">Detalhes técnicos</span>
                {showTechnicalDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {showTechnicalDetails && (
                <div className="mt-2 p-3 bg-gray-50 rounded-md">
                  <code className="text-xs text-gray-600 break-words">
                    {error.technicalDetails}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* Data Safety Reassurance */}
          <div className="mt-6 p-3 bg-green-50 rounded-md">
            <p className="text-xs text-green-700 font-medium">
              ✓ Seus dados estão seguros e não foram perdidos
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}