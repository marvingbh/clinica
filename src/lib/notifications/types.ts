import type { NotificationChannel, NotificationType } from "@prisma/client/client"

export interface NotificationPayload {
  clinicId: string
  patientId?: string
  appointmentId?: string
  type: NotificationType
  channel: NotificationChannel
  recipient: string
  subject?: string
  content: string
}

export interface SendResult {
  success: boolean
  error?: string
  externalId?: string
}

export interface NotificationProvider {
  channel: NotificationChannel
  send(recipient: string, content: string, subject?: string): Promise<SendResult>
}

export interface RetryConfig {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 60000, // 1 minute
  maxDelayMs: 3600000, // 1 hour
}

export function calculateNextRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential backoff: baseDelay * 2^(attempt-1)
  // attempt 1: 1 min, attempt 2: 2 min, attempt 3: 4 min
  const delay = config.baseDelayMs * Math.pow(2, attempt - 1)
  return Math.min(delay, config.maxDelayMs)
}
