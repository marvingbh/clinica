import { randomBytes } from "crypto"
import type { PrismaClient } from "@prisma/client/client"
import type { Prisma } from "@prisma/client/client"

// Default token expiration: 24 hours after appointment time
const DEFAULT_EXPIRATION_HOURS = 24

export type TokenAction = "confirm" | "cancel"

export interface GeneratedTokens {
  confirmToken: string
  cancelToken: string
  expiresAt: Date
}

export interface TokenValidationResult {
  valid: boolean
  error?: string
  appointmentId?: string
  action?: TokenAction
}

/**
 * Generates a cryptographically secure random token (64 hex chars)
 */
export function generateToken(): string {
  return randomBytes(32).toString("hex")
}

/**
 * Calculates token expiration date based on appointment time
 * Default: appointment datetime + 24 hours (configurable)
 */
export function calculateTokenExpiry(
  appointmentDate: Date,
  hoursAfterAppointment: number = DEFAULT_EXPIRATION_HOURS
): Date {
  return new Date(appointmentDate.getTime() + hoursAfterAppointment * 60 * 60 * 1000)
}

/**
 * Creates confirm and cancel tokens for an appointment
 * Uses transaction client if provided
 */
export async function createAppointmentTokens(
  appointmentId: string,
  appointmentDate: Date,
  tx: Prisma.TransactionClient | PrismaClient,
  expirationHours: number = DEFAULT_EXPIRATION_HOURS
): Promise<GeneratedTokens> {
  const confirmToken = generateToken()
  const cancelToken = generateToken()
  const expiresAt = calculateTokenExpiry(appointmentDate, expirationHours)

  await tx.appointmentToken.createMany({
    data: [
      {
        appointmentId,
        token: confirmToken,
        action: "confirm",
        expiresAt,
      },
      {
        appointmentId,
        token: cancelToken,
        action: "cancel",
        expiresAt,
      },
    ],
  })

  return { confirmToken, cancelToken, expiresAt }
}

/**
 * Validates a token and returns the associated appointment info
 * Does NOT mark the token as used - call invalidateToken after successful action
 */
export async function validateToken(
  token: string,
  expectedAction: TokenAction,
  prisma: PrismaClient
): Promise<TokenValidationResult> {
  const tokenRecord = await prisma.appointmentToken.findUnique({
    where: { token },
    include: {
      appointment: {
        select: {
          id: true,
          status: true,
          scheduledAt: true,
        },
      },
    },
  })

  if (!tokenRecord) {
    return { valid: false, error: "Token inválido ou não encontrado" }
  }

  if (tokenRecord.action !== expectedAction) {
    return { valid: false, error: "Token inválido para esta ação" }
  }

  if (tokenRecord.usedAt) {
    return { valid: false, error: "Este link já foi utilizado" }
  }

  if (new Date() > tokenRecord.expiresAt) {
    return { valid: false, error: "Este link expirou" }
  }

  // Check if appointment still exists and is in a valid state
  if (!tokenRecord.appointment) {
    return { valid: false, error: "Agendamento não encontrado" }
  }

  const validStatuses = ["AGENDADO", "CONFIRMADO"]
  if (!validStatuses.includes(tokenRecord.appointment.status)) {
    return { valid: false, error: "Agendamento não pode mais ser modificado" }
  }

  return {
    valid: true,
    appointmentId: tokenRecord.appointmentId,
    action: expectedAction,
  }
}

/**
 * Marks a token as used (one-time use)
 */
export async function invalidateToken(
  token: string,
  prisma: PrismaClient
): Promise<void> {
  await prisma.appointmentToken.update({
    where: { token },
    data: { usedAt: new Date() },
  })
}

/**
 * Invalidates all existing tokens for an appointment and generates new ones
 * Used when an appointment is rescheduled
 */
export async function regenerateAppointmentTokens(
  appointmentId: string,
  newAppointmentDate: Date,
  tx: Prisma.TransactionClient | PrismaClient,
  expirationHours: number = DEFAULT_EXPIRATION_HOURS
): Promise<GeneratedTokens> {
  // Invalidate all existing tokens (mark as used)
  await tx.appointmentToken.updateMany({
    where: {
      appointmentId,
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
    },
  })

  // Create new tokens
  return createAppointmentTokens(appointmentId, newAppointmentDate, tx, expirationHours)
}

/**
 * Builds the confirmation link URL
 */
export function buildConfirmLink(baseUrl: string, token: string): string {
  return `${baseUrl}/confirm?token=${token}`
}

/**
 * Builds the cancellation link URL
 */
export function buildCancelLink(baseUrl: string, token: string): string {
  return `${baseUrl}/cancel?token=${token}`
}
