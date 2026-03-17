import { NotificationChannel } from "@prisma/client"
import type { NotificationProvider, SendResult } from "../types"

interface ResendEmailResponse {
  id: string
}

interface ResendErrorResponse {
  statusCode: number
  message: string
  name: string
}

interface ResendAttachment {
  filename: string
  content: string // Base64 encoded
  content_type?: string
}

interface SendOptions {
  /** Display name for the sender (overrides default) */
  fromName?: string
  /** Reply-to email address (e.g., clinic's email) */
  replyTo?: string
  /** HTML body (alternative to plain text) */
  html?: string
  /** File attachments */
  attachments?: ResendAttachment[]
}

/**
 * Email provider using Resend API
 * @see https://resend.com/docs/api-reference/emails/send-email
 */
export class EmailResendProvider implements NotificationProvider {
  channel = NotificationChannel.EMAIL
  private apiKey: string
  private fromEmail: string
  private defaultFromName: string

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || ""
    this.fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@example.com"
    this.defaultFromName = process.env.RESEND_FROM_NAME || "Clinica"
  }

  async send(
    recipient: string,
    content: string,
    subject?: string,
    options?: SendOptions
  ): Promise<SendResult> {
    if (!this.apiKey) {
      console.warn("[Email Resend] No API key configured, skipping send")
      return {
        success: false,
        error: "RESEND_API_KEY not configured",
      }
    }

    const fromName = options?.fromName || this.defaultFromName

    try {
      const payload: Record<string, unknown> = {
        from: `${fromName} <${this.fromEmail}>`,
        to: [recipient],
        subject: subject || "Notificação",
        text: content,
      }
      if (options?.replyTo) payload.reply_to = options.replyTo
      if (options?.html) payload.html = options.html
      if (options?.attachments) payload.attachments = options.attachments

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as ResendErrorResponse
        console.error("[Email Resend] Failed to send:", errorData)
        return {
          success: false,
          error: errorData.message || `HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as ResendEmailResponse
      return {
        success: true,
        externalId: data.id,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error"
      console.error("[Email Resend] Exception:", errorMessage)
      return {
        success: false,
        error: errorMessage,
      }
    }
  }
}

export const emailResendProvider = new EmailResendProvider()
