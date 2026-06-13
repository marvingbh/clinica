import { prisma } from "@/lib/prisma"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { createAndSendNotification } from "@/lib/notifications/notification-service"
import { getTemplate, renderTemplate } from "@/lib/notifications/templates"
import { logSystemAudit, AuditAction } from "@/lib/rbac/audit"
import { resolveTodoAssignee } from "./todo-assignee"
import type { FormField } from "./types"

interface CompletedResponse {
  id: string
  professionalProfileId: string | null
  clinic: { id: string }
  patient: { name: string; referenceProfessionalId: string | null }
  formVersion: { template: { name: string } }
}

/**
 * Post-completion side effects for a submitted form response. Each is
 * independently safe; the caller wraps this in try/catch so a failure never
 * blocks the patient's submit.
 *  1. Todo for the resolved professional (skipped if none).
 *  2. FORM_COMPLETED email to that professional, else clinic admins.
 *  3. Public audit log (no staff actor).
 */
export async function runFormCompletionSideEffects(
  response: CompletedResponse,
  fields: FormField[]
): Promise<void> {
  const clinicId = response.clinic.id
  const formName = response.formVersion.template.name
  const patientName = response.patient.name

  const assignee = resolveTodoAssignee({
    patientReferenceProfessionalId: response.patient.referenceProfessionalId,
    responseProfessionalProfileId: response.professionalProfileId,
  })

  if (assignee) {
    const today = new Date()
    const day = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    await prisma.todo.create({
      data: { clinicId, professionalProfileId: assignee, title: `Formulário respondido — ${patientName}`, day },
    })
  }

  const recipients = await resolveCompletionRecipients(clinicId, assignee)
  if (recipients.length > 0) {
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { name: true } })
    const vars = { patientName, formName, clinicName: clinic?.name ?? "" }
    const tmpl = await getTemplate(clinicId, NotificationType.FORM_COMPLETED, NotificationChannel.EMAIL)
    const content = renderTemplate(tmpl.content, vars)
    const subject = tmpl.subject ? renderTemplate(tmpl.subject, vars) : undefined
    for (const email of recipients) {
      await createAndSendNotification({
        clinicId,
        type: NotificationType.FORM_COMPLETED,
        channel: NotificationChannel.EMAIL,
        recipient: email,
        subject,
        content,
      })
    }
  }

  await logSystemAudit({
    clinicId,
    action: AuditAction.FORM_RESPONSE_COMPLETED,
    entityType: "FormResponse",
    entityId: response.id,
    newValues: { fieldCount: fields.filter((f) => f.type !== "section").length },
  })
}

async function resolveCompletionRecipients(clinicId: string, assignee: string | null): Promise<string[]> {
  if (assignee) {
    const prof = await prisma.professionalProfile.findFirst({
      where: { id: assignee, user: { clinicId } },
      select: { user: { select: { email: true, isActive: true } } },
    })
    if (prof?.user.isActive && prof.user.email) return [prof.user.email]
  }
  const admins = await prisma.user.findMany({
    where: { clinicId, role: "ADMIN", isActive: true },
    select: { email: true },
  })
  return admins.map((a) => a.email).filter((e): e is string => !!e)
}
