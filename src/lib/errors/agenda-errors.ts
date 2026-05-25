/**
 * Error classification system for agenda data loading
 * Provides user-friendly error messages and retry capabilities
 */

export enum AgendaErrorType {
  DATABASE_CONNECTION = "database_connection",
  SERVER_ERROR = "server_error",
  NETWORK_TIMEOUT = "network_timeout",
  NETWORK_OFFLINE = "network_offline",
  PARTIAL_FAILURE = "partial_failure",
  AUTHENTICATION = "authentication",
  UNKNOWN = "unknown"
}

export interface AgendaError {
  type: AgendaErrorType
  message: string
  technicalDetails?: string
  timestamp: Date
  affectedEndpoints: string[]
  canRetry: boolean
  retryAttempt?: number
  maxRetries?: number
}

/**
 * User-friendly error messages that reassure users their data is safe
 */
const ERROR_MESSAGES: Record<AgendaErrorType, { message: string; technicalTemplate?: string }> = {
  [AgendaErrorType.DATABASE_CONNECTION]: {
    message: "Problema de conexão temporário - seus agendamentos estão seguros",
    technicalTemplate: "Erro de conexão com o banco de dados{details}"
  },
  [AgendaErrorType.SERVER_ERROR]: {
    message: "Servidor temporariamente indisponível - tentando reconectar...",
    technicalTemplate: "HTTP {status} {statusText}{details}"
  },
  [AgendaErrorType.NETWORK_TIMEOUT]: {
    message: "Conexão lenta - carregando dados pode demorar mais que o normal",
    technicalTemplate: "Timeout após {timeout}s{details}"
  },
  [AgendaErrorType.NETWORK_OFFLINE]: {
    message: "Sem conexão com a internet - verifique sua rede",
    technicalTemplate: "Dispositivo offline{details}"
  },
  [AgendaErrorType.PARTIAL_FAILURE]: {
    message: "Alguns dados da agenda não puderam ser carregados",
    technicalTemplate: "Falhou: {failedEndpoints}{details}"
  },
  [AgendaErrorType.AUTHENTICATION]: {
    message: "Sessão expirada - faça login novamente",
    technicalTemplate: "Token inválido ou expirado{details}"
  },
  [AgendaErrorType.UNKNOWN]: {
    message: "Erro inesperado ao carregar agenda - tente novamente",
    technicalTemplate: "Erro não classificado{details}"
  }
}

interface ClassificationContext {
  error: Error
  response?: Response
  isOnline: boolean
  endpoint: string
  timeoutMs?: number
}

/**
 * Classifies errors into user-friendly categories with appropriate retry behavior
 */
export function classifyAgendaError(context: ClassificationContext): AgendaError {
  const { error, response, isOnline, endpoint, timeoutMs } = context
  const now = new Date()

  // Network offline
  if (!isOnline) {
    return {
      type: AgendaErrorType.NETWORK_OFFLINE,
      message: ERROR_MESSAGES[AgendaErrorType.NETWORK_OFFLINE].message,
      technicalDetails: "Dispositivo offline",
      timestamp: now,
      affectedEndpoints: [endpoint],
      canRetry: true
    }
  }

  // Request timeout/abort
  if (error.name === "AbortError" || error.message.includes("timeout")) {
    const details = timeoutMs ? ` (timeout após ${timeoutMs / 1000}s)` : ""
    return {
      type: AgendaErrorType.NETWORK_TIMEOUT,
      message: ERROR_MESSAGES[AgendaErrorType.NETWORK_TIMEOUT].message,
      technicalDetails: `Timeout após ${timeoutMs ? timeoutMs / 1000 : "?"}s`,
      timestamp: now,
      affectedEndpoints: [endpoint],
      canRetry: true
    }
  }

  // HTTP response errors
  if (response) {
    const status = response.status
    const statusText = response.statusText

    // Authentication errors
    if (status === 401 || status === 403) {
      return {
        type: AgendaErrorType.AUTHENTICATION,
        message: ERROR_MESSAGES[AgendaErrorType.AUTHENTICATION].message,
        technicalDetails: `HTTP ${status} ${statusText}`,
        timestamp: now,
        affectedEndpoints: [endpoint],
        canRetry: false
      }
    }

    // Database/server errors
    if (status >= 500) {
      const errorConfig = ERROR_MESSAGES[AgendaErrorType.DATABASE_CONNECTION]
      return {
        type: AgendaErrorType.DATABASE_CONNECTION,
        message: errorConfig.message,
        technicalDetails: errorConfig.technicalTemplate?.replace("{details}", ` (HTTP ${status})`),
        timestamp: now,
        affectedEndpoints: [endpoint],
        canRetry: true
      }
    }

    // Client errors (400s, but not auth)
    if (status >= 400) {
      return {
        type: AgendaErrorType.SERVER_ERROR,
        message: ERROR_MESSAGES[AgendaErrorType.SERVER_ERROR].message,
        technicalDetails: `HTTP ${status} ${statusText}`,
        timestamp: now,
        affectedEndpoints: [endpoint],
        canRetry: false
      }
    }
  }

  // Network errors (fetch failures)
  if (error.message.includes("fetch") || error.message.includes("network")) {
    return {
      type: AgendaErrorType.DATABASE_CONNECTION,
      message: ERROR_MESSAGES[AgendaErrorType.DATABASE_CONNECTION].message,
      technicalDetails: error.message,
      timestamp: now,
      affectedEndpoints: [endpoint],
      canRetry: true
    }
  }

  // Prisma connection errors (for API routes)
  if (error.message.includes("PrismaClientConnectTimeout") ||
      error.message.includes("Can't reach database server")) {
    return {
      type: AgendaErrorType.DATABASE_CONNECTION,
      message: ERROR_MESSAGES[AgendaErrorType.DATABASE_CONNECTION].message,
      technicalDetails: "Conexão com banco de dados indisponível",
      timestamp: now,
      affectedEndpoints: [endpoint],
      canRetry: true
    }
  }

  // Fallback for unknown errors
  return {
    type: AgendaErrorType.UNKNOWN,
    message: ERROR_MESSAGES[AgendaErrorType.UNKNOWN].message,
    technicalDetails: error.message,
    timestamp: now,
    affectedEndpoints: [endpoint],
    canRetry: true
  }
}

/**
 * Creates a partial failure error aggregating multiple endpoint failures
 */
export function createPartialFailureError(
  failedEndpoints: string[],
  errors: AgendaError[]
): AgendaError {
  const failedList = failedEndpoints.join(", ")
  const details = errors.map(e => e.technicalDetails).filter(Boolean).join("; ")

  return {
    type: AgendaErrorType.PARTIAL_FAILURE,
    message: ERROR_MESSAGES[AgendaErrorType.PARTIAL_FAILURE].message,
    technicalDetails: `Falhou: ${failedList}${details ? ` (${details})` : ""}`,
    timestamp: new Date(),
    affectedEndpoints: failedEndpoints,
    canRetry: true
  }
}

/**
 * Determines if an error should trigger automatic retry
 */
export function shouldAutoRetry(error: AgendaError): boolean {
  if (!error.canRetry) return false

  // Don't auto-retry auth errors
  if (error.type === AgendaErrorType.AUTHENTICATION) return false

  // Auto-retry connection and server issues
  return [
    AgendaErrorType.DATABASE_CONNECTION,
    AgendaErrorType.SERVER_ERROR,
    AgendaErrorType.NETWORK_TIMEOUT
  ].includes(error.type)
}

/**
 * Gets retry delay in milliseconds using exponential backoff
 */
export function getRetryDelay(attempt: number): number {
  // Exponential backoff: 1s, 3s, 9s, 27s...
  return Math.min(1000 * Math.pow(3, attempt - 1), 30000) // Cap at 30s
}