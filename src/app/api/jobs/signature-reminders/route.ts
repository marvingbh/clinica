import { NextResponse } from "next/server"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createAndSendNotification } from "@/lib/notifications"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { logSystemAudit, AuditAction } from "@/lib/rbac/audit"
import {
  generateSigningToken,
  hashSigningToken,
  envelopeStatusFrom,
  buildSigningUrl,
} from "@/lib/assinaturas"
import { signatureBaseUrl, resolveSignerChannel, createSignatureTodo } from "@/lib/assinaturas/service"
import {
  selectRequestsToRemind,
  selectRequestsToExpire,
  buildReminderVariables,
} from "@/lib/jobs/signature-reminders"

/**
 * GET /api/jobs/signature-reminders — daily Vercel Cron (Bearer CRON_SECRET).
 * Sends D+3/D+7 reminders to active signers and expires overdue requests.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const results = { clinicsProcessed: 0, reminded: 0, expired: 0, errors: [] as string[] }

  const clinics = await prisma.clinic.findMany({ where: { isActive: true }, select: { id: true, name: true, timezone: true } })

  for (const clinic of clinics) {
    try {
      const requests = await prisma.signatureRequest.findMany({
        where: { clinicId: clinic.id, status: { in: ["PENDENTE", "VISUALIZADO"] } },
        select: {
          id: true, status: true, linkSentAt: true, remindersSent: true, lastReminderAt: true,
          expiresAt: true, signerName: true, signerEmail: true, signerPhone: true, otpChannel: true,
          tokenHash: true, envelopeId: true,
          envelope: { select: { document: { select: { title: true } }, requestedByUserId: true, patient: { select: { name: true, referenceProfessionalId: true } } } },
        },
      })

      // Reminders: regenerate a fresh token (the previous link is replaced),
      // resend via the original channel, bump counters.
      const toRemind = selectRequestsToRemind(requests, now)
      for (const r of toRemind) {
        const resolved = resolveSignerChannel(
          { signerName: r.signerName, signerEmail: r.signerEmail, signerPhone: r.signerPhone },
          r.otpChannel as NotificationChannel | null
        )
        if (!resolved) continue
        const token = generateSigningToken()
        const template = await getTemplate(clinic.id, NotificationType.DOCUMENT_SIGNATURE_REMINDER, resolved.channel)
        const variables = buildReminderVariables({
          signerName: r.signerName,
          clinicName: clinic.name,
          documentTitle: r.envelope.document.title,
          signingLink: buildSigningUrl(signatureBaseUrl(), token),
        })
        await prisma.signatureRequest.update({
          where: { id: r.id },
          data: { tokenHash: hashSigningToken(token), remindersSent: { increment: 1 }, lastReminderAt: now },
        })
        await createAndSendNotification({
          clinicId: clinic.id,
          type: NotificationType.DOCUMENT_SIGNATURE_REMINDER,
          channel: resolved.channel,
          recipient: resolved.recipient,
          subject: template.subject ? renderTemplate(template.subject, variables) : undefined,
          content: renderTemplate(template.content, variables),
        })
        results.reminded++
      }

      // Expirations.
      const toExpire = selectRequestsToExpire(requests, now)
      for (const r of toExpire) {
        await prisma.signatureRequest.update({ where: { id: r.id }, data: { status: "EXPIRADO" } })
        const siblings = await prisma.signatureRequest.findMany({ where: { envelopeId: r.envelopeId }, select: { status: true } })
        await prisma.signatureEnvelope.update({ where: { id: r.envelopeId }, data: { status: envelopeStatusFrom(siblings as never) } })
        await createSignatureTodo({
          clinicId: clinic.id,
          requestedByUserId: r.envelope.requestedByUserId,
          patientReferenceProfessionalId: r.envelope.patient?.referenceProfessionalId ?? null,
          title: `Assinatura expirou sem resposta: ${r.envelope.document.title} — ${r.envelope.patient?.name ?? ""}`,
          day: now,
        }).catch(() => {})
        results.expired++
      }

      if (toRemind.length > 0 || toExpire.length > 0) {
        await logSystemAudit({
          clinicId: clinic.id,
          action: AuditAction.SIGNATURE_REMINDER_JOB_EXECUTED,
          entityType: "Clinic",
          entityId: clinic.id,
          newValues: { reminded: toRemind.length, expired: toExpire.length },
        }).catch(() => {})
      }
      results.clinicsProcessed++
    } catch (e) {
      results.errors.push(`${clinic.id}: ${e instanceof Error ? e.message : "error"}`)
    }
  }

  return NextResponse.json(results)
}
