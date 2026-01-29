export {
  createNotification,
  sendNotification,
  createAndSendNotification,
  processPendingNotifications,
  getNotificationsByAppointment,
  getNotificationStats,
} from "./notification-service"

export {
  type NotificationPayload,
  type SendResult,
  type NotificationProvider,
  type RetryConfig,
  DEFAULT_RETRY_CONFIG,
  calculateNextRetryDelay,
} from "./types"

export { whatsAppMockProvider } from "./providers/whatsapp-mock"
export { emailResendProvider } from "./providers/email-resend"
