import { NotificationChannel } from "@prisma/client"
import type { NotificationProvider, SendResult } from "../types"

/**
 * Mock WhatsApp provider for development/testing
 * Logs messages to console and always returns success
 */
export class WhatsAppMockProvider implements NotificationProvider {
  channel = NotificationChannel.WHATSAPP

  async send(
    recipient: string,
    content: string,
    _subject?: string
  ): Promise<SendResult> {
    console.log("━".repeat(60))
    console.log("📱 [WhatsApp Mock] Sending notification")
    console.log(`   To: ${recipient}`)
    console.log(`   Content: ${content}`)
    console.log("━".repeat(60))

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100))

    return {
      success: true,
      externalId: `whatsapp-mock-${Date.now()}`,
    }
  }
}

export const whatsAppMockProvider = new WhatsAppMockProvider()
