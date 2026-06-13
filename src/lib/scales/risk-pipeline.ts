import { prisma } from "@/lib/prisma"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { createAndSendNotification } from "@/lib/notifications/notification-service"
import { logSystemAudit, AuditAction } from "@/lib/rbac/audit"
import { getScaleDefinition } from "./definitions"
import { buildRiskTodoTitle, buildRiskAlertEmail } from "./risk"

/**
 * Side effects fired when a scale administration endorses a risk item.
 * Each step is independently guarded by the caller's try/catch so a failure
 * never blocks the patient's submit or the in-session save.
 *  1. Todo for the responsible professional (day = today).
 *  2. SCALE_RISK_ALERT email to that professional (no clinical content).
 *  3. System audit `scale.risk_flagged` (no staff actor for public submits).
 */
export async function runScaleRiskPipeline(input: {
  clinicId: string
  administrationId: string
  patientId: string
  professionalProfileId: string
  scaleCode: string
  patientName: string
  completedAt: Date
}): Promise<void> {
  const def = getScaleDefinition(input.scaleCode)

  const today = new Date()
  const day = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  await prisma.todo.create({
    data: {
      clinicId: input.clinicId,
      professionalProfileId: input.professionalProfileId,
      title: buildRiskTodoTitle(input.patientName),
      day,
    },
  })

  const professional = await prisma.professionalProfile.findFirst({
    where: { id: input.professionalProfileId, user: { clinicId: input.clinicId } },
    select: { user: { select: { email: true, isActive: true } } },
  })
  if (professional?.user.isActive && professional.user.email) {
    const { subject, content } = buildRiskAlertEmail({
      patientName: input.patientName,
      scaleShortName: def.shortName,
      completedAt: input.completedAt,
    })
    await createAndSendNotification({
      clinicId: input.clinicId,
      type: NotificationType.SCALE_RISK_ALERT,
      channel: NotificationChannel.EMAIL,
      recipient: professional.user.email,
      subject,
      content,
    })
  }

  await logSystemAudit({
    clinicId: input.clinicId,
    action: AuditAction.SCALE_RISK_FLAGGED,
    entityType: "ScaleAdministration",
    entityId: input.administrationId,
  })
}
