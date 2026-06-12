import { prisma } from "@/lib/prisma"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { createNotification, getPatientPhoneNumbers } from "@/lib/notifications"
import { getTemplate, renderTemplate, type TemplateVariables } from "@/lib/notifications/templates"
import { formatCurrencyBRL, formatInvoiceReference, formatDateBR } from "@/lib/financeiro/format"
import { buildPaymentLinkUrl, computeOpenBalance } from "@/lib/cobranca"
import type { ChargeChannel, ChargeNotificationType } from "./types"

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

/**
 * Renders and persists one Notification row per requested channel for a charge,
 * linking each to the invoice (idempotency + history). WhatsApp uses the
 * patient's primary phone; EMAIL uses the patient's email.
 */
export async function sendChargeNotifications(opts: {
  chargeId: string
  channels: ChargeChannel[]
  type: ChargeNotificationType
}): Promise<{ sent: ChargeChannel[] }> {
  const charge = await prisma.paymentCharge.findUnique({
    where: { id: opts.chargeId },
    select: {
      id: true,
      clinicId: true,
      invoiceId: true,
      invoice: {
        select: {
          id: true,
          dueDate: true,
          referenceMonth: true,
          referenceYear: true,
          totalAmount: true,
          reconciliationLinks: { select: { amount: true } },
          patient: { select: { id: true, name: true, email: true } },
          clinic: { select: { name: true } },
        },
      },
    },
  })
  if (!charge) return { sent: [] }

  const { invoice } = charge
  const open = computeOpenBalance(
    Number(invoice.totalAmount),
    invoice.reconciliationLinks.map((l) => Number(l.amount))
  )
  const paymentLink = buildPaymentLinkUrl(appBaseUrl(), charge.id)
  const baseVars: TemplateVariables = {
    patientName: invoice.patient.name,
    clinicName: invoice.clinic.name,
    paymentLink,
    invoiceAmount: formatCurrencyBRL(open),
    dueDate: formatDateBR(invoice.dueDate.toISOString()),
    referenceMonth: formatInvoiceReference(invoice.referenceMonth, invoice.referenceYear),
  }

  const type =
    opts.type === "PAYMENT_LINK" ? NotificationType.PAYMENT_LINK : NotificationType.PAYMENT_REMINDER

  const sent: ChargeChannel[] = []
  for (const channel of opts.channels) {
    let recipient: string | null = null
    if (channel === "WHATSAPP") {
      const phones = await getPatientPhoneNumbers(invoice.patient.id, charge.clinicId)
      recipient = phones[0]?.phone ?? null
    } else {
      recipient = invoice.patient.email ?? null
    }
    if (!recipient) continue

    const ch = channel === "WHATSAPP" ? NotificationChannel.WHATSAPP : NotificationChannel.EMAIL
    const tmpl = await getTemplate(charge.clinicId, type, ch)
    await createNotification({
      clinicId: charge.clinicId,
      patientId: invoice.patient.id,
      invoiceId: invoice.id,
      type,
      channel: ch,
      recipient,
      subject: tmpl.subject ? renderTemplate(tmpl.subject, baseVars) : undefined,
      content: renderTemplate(tmpl.content, baseVars),
    })
    sent.push(channel)
  }

  // Mark the charge as sent once at least one channel went out.
  if (sent.length > 0) {
    await prisma.paymentCharge.update({
      where: { id: charge.id },
      data: { sentAt: new Date() },
    })
  }

  return { sent }
}
