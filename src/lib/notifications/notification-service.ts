import { prisma } from "@/lib/prisma"
import {
  NotificationChannel,
  NotificationStatus,
  type Notification,
} from "@prisma/client/client"
import type {
  NotificationPayload,
  NotificationProvider,
  RetryConfig,
  SendResult,
} from "./types"
import { calculateNextRetryDelay, DEFAULT_RETRY_CONFIG } from "./types"
import { whatsAppMockProvider } from "./providers/whatsapp-mock"
import { emailResendProvider } from "./providers/email-resend"

const providers: Record<NotificationChannel, NotificationProvider> = {
  [NotificationChannel.WHATSAPP]: whatsAppMockProvider,
  [NotificationChannel.EMAIL]: emailResendProvider,
}

/**
 * Creates a notification record in PENDING status
 */
export async function createNotification(
  payload: NotificationPayload
): Promise<Notification> {
  return prisma.notification.create({
    data: {
      clinicId: payload.clinicId,
      patientId: payload.patientId,
      appointmentId: payload.appointmentId,
      type: payload.type,
      channel: payload.channel,
      status: NotificationStatus.PENDING,
      recipient: payload.recipient,
      subject: payload.subject,
      content: payload.content,
      attempts: 0,
      maxAttempts: DEFAULT_RETRY_CONFIG.maxAttempts,
      nextRetryAt: new Date(),
    },
  })
}

/**
 * Sends a notification using the appropriate provider
 * Updates the notification record with the result
 */
export async function sendNotification(
  notificationId: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<SendResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  })

  if (!notification) {
    return { success: false, error: "Notification not found" }
  }

  if (notification.status === NotificationStatus.SENT) {
    return { success: true, externalId: "already-sent" }
  }

  if (notification.status === NotificationStatus.FAILED) {
    return { success: false, error: "Notification permanently failed" }
  }

  const provider = providers[notification.channel]
  if (!provider) {
    return { success: false, error: `No provider for channel: ${notification.channel}` }
  }

  const newAttempts = notification.attempts + 1

  const result = await provider.send(
    notification.recipient,
    notification.content,
    notification.subject || undefined
  )

  if (result.success) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        attempts: newAttempts,
        nextRetryAt: null,
        failureReason: null,
      },
    })
  } else {
    const isFinalAttempt = newAttempts >= notification.maxAttempts

    if (isFinalAttempt) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
          failureReason: result.error,
          attempts: newAttempts,
          nextRetryAt: null,
        },
      })
    } else {
      const nextRetryDelay = calculateNextRetryDelay(newAttempts, config)
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          attempts: newAttempts,
          failureReason: result.error,
          nextRetryAt: new Date(Date.now() + nextRetryDelay),
        },
      })
    }
  }

  return result
}

/**
 * Creates and immediately sends a notification
 */
export async function createAndSendNotification(
  payload: NotificationPayload,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ notification: Notification; sendResult: SendResult }> {
  const notification = await createNotification(payload)
  const sendResult = await sendNotification(notification.id, config)

  const updatedNotification = await prisma.notification.findUnique({
    where: { id: notification.id },
  })

  return {
    notification: updatedNotification || notification,
    sendResult,
  }
}

/**
 * Processes pending notifications that are due for retry
 * Returns the number of notifications processed
 */
export async function processPendingNotifications(
  limit: number = 10,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<number> {
  const now = new Date()

  const pendingNotifications = await prisma.notification.findMany({
    where: {
      status: NotificationStatus.PENDING,
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  })

  let processed = 0

  for (const notification of pendingNotifications) {
    await sendNotification(notification.id, config)
    processed++
  }

  return processed
}

/**
 * Gets notifications for an appointment
 */
export async function getNotificationsByAppointment(
  appointmentId: string
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: { appointmentId },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Gets notification statistics for a clinic
 */
export async function getNotificationStats(clinicId: string): Promise<{
  pending: number
  sent: number
  failed: number
}> {
  const [pending, sent, failed] = await Promise.all([
    prisma.notification.count({
      where: { clinicId, status: NotificationStatus.PENDING },
    }),
    prisma.notification.count({
      where: { clinicId, status: NotificationStatus.SENT },
    }),
    prisma.notification.count({
      where: { clinicId, status: NotificationStatus.FAILED },
    }),
  ])

  return { pending, sent, failed }
}
