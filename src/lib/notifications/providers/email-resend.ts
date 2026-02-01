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

/**
 * Email provider using Resend API
 * @see https://resend.com/docs/api-reference/emails/send-email
 */
export class EmailResendProvider implements NotificationProvider {
  channel = NotificationChannel.EMAIL
  private apiKey: string
  private fromEmail: string
  private fromName: string

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY || ""
    this.fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@example.com"
    this.fromName = process.env.RESEND_FROM_NAME || "Clínica"
  }

  async send(
    recipient: string,
    content: string,
    subject?: string
  ): Promise<SendResult> {
    if (!this.apiKey) {
      console.warn("[Email Resend] No API key configured, skipping send")
      return {
        success: false,
        error: "RESEND_API_KEY not configured",
      }
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${this.fromName} <${this.fromEmail}>`,
          to: [recipient],
          subject: subject || "Notificação",
          text: content,
        }),
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
      console.log(`[Email Resend] Email sent successfully: ${data.id}`)

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
