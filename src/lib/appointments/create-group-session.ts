import { prisma } from "@/lib/prisma"
import { checkConflictsBulk, formatConflictError, type ConflictingAppointment } from "./conflict-check"
import { buildConfirmUrl, buildCancelUrl } from "./appointment-links"
import { createNotification, getPatientPhoneNumbers } from "@/lib/notifications"
import { NotificationChannel, NotificationType } from "@prisma/client"
import { audit, AuditAction, type AuthUser } from "@/lib/rbac"

export interface CreateGroupSessionParams {
  clinicId: string
  professionalProfileId: string
  professionalName: string
  appointmentDuration: number
  patientIds: string[]
  title: string
  date: string
  startTime: string
  duration?: number
  modality: "ONLINE" | "PRESENCIAL"
  notes?: string | null
  additionalProfessionalIds: string[]
}

export type CreateGroupSessionResult =
  | { success: true; appointments: { id: string; patientId: string | null; scheduledAt: Date; endAt: Date; patient: { name: string } | null }[]; sessionGroupId: string }
  | { conflict: ConflictingAppointment }

export async function createGroupSessionAppointments(
  params: CreateGroupSessionParams,
): Promise<CreateGroupSessionResult> {
  const {
    clinicId, professionalProfileId, appointmentDuration,
    patientIds, title, date, startTime, duration, modality, notes,
    additionalProfessionalIds,
  } = params

  const actualDuration = duration || appointmentDuration
  const scheduledAt = new Date(`${date}T${startTime}:00`)
  const endAt = new Date(scheduledAt.getTime() + actualDuration * 60 * 1000)
  const sessionGroupId = crypto.randomUUID()

  const result = await prisma.$transaction(async (tx) => {
    const conflictResult = await checkConflictsBulk({
      professionalProfileId,
      dates: [{ scheduledAt, endAt }],
      additionalProfessionalIds,
    }, tx)

    if (conflictResult.conflicts.length > 0) {
      return { conflict: conflictResult.conflicts[0].conflictingAppointment }
    }

    await tx.appointment.createMany({
      data: patientIds.map(pid => ({
        clinicId,
        professionalProfileId,
        patientId: pid,
        sessionGroupId,
        title,
        scheduledAt,
        endAt,
        modality,
        notes: notes || null,
      })),
    })

    const createdAppointments = await tx.appointment.findMany({
      where: { clinicId, sessionGroupId },
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true } },
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        additionalProfessionals: {
          select: { professionalProfile: { select: { id: true, user: { select: { name: true } } } } },
        },
      },
      orderBy: { scheduledAt: "asc" },
    })

    if (additionalProfessionalIds.length > 0) {
      await tx.appointmentProfessional.createMany({
        data: createdAppointments.flatMap(apt =>
          additionalProfessionalIds.map(profId => ({
            appointmentId: apt.id,
            professionalProfileId: profId,
          }))
        ),
      })
    }

    return { success: true as const, appointments: createdAppointments, sessionGroupId }
  }, { timeout: 30000 })

  return result
}

export async function auditGroupSessionCreation(
  user: AuthUser,
  appointments: { id: string; patientId: string | null; scheduledAt: Date; endAt: Date; patient: { name: string } | null }[],
  professionalProfileId: string,
  professionalName: string,
  sessionGroupId: string,
  req: Request,
) {
  for (const apt of appointments) {
    await audit.log({
      user,
      action: AuditAction.APPOINTMENT_CREATED,
      entityType: "Appointment",
      entityId: apt.id,
      newValues: {
        patientId: apt.patientId,
        patientName: apt.patient?.name,
        professionalProfileId,
        professionalName,
        scheduledAt: apt.scheduledAt.toISOString(),
        endAt: apt.endAt.toISOString(),
        sessionGroupId,
        isGroupSession: true,
      },
      request: req,
    })
  }
}

export function sendGroupSessionNotifications(
  appointments: { id: string; patientId: string | null; scheduledAt: Date }[],
  patients: { id: string; name: string; phone: string; email: string | null; consentWhatsApp: boolean; consentEmail: boolean }[],
  clinicId: string,
  professionalName: string,
  modality: string,
) {
  const first = appointments[0]
  if (!first || first.scheduledAt < new Date()) return // skip past dates

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const formattedDate = first.scheduledAt.toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
  })
  const formattedTime = first.scheduledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

  for (const apt of appointments) {
    const patient = patients.find(p => p.id === apt.patientId)
    if (!patient) continue

    const confirmLink = buildConfirmUrl(baseUrl, apt.id, apt.scheduledAt)
    const cancelLink = buildCancelUrl(baseUrl, apt.id, apt.scheduledAt)
    const content = `Ola ${patient.name}!\n\nSeu agendamento em grupo foi criado.\n\n📅 Data: ${formattedDate}\n🕐 Horario: ${formattedTime}\n👨‍⚕️ Profissional: ${professionalName}\n📍 Modalidade: ${modality === "ONLINE" ? "Online" : "Presencial"}\n\nPara confirmar:\n${confirmLink}\n\nPara cancelar:\n${cancelLink}`

    if (patient.consentWhatsApp && patient.phone) {
      getPatientPhoneNumbers(patient.id, clinicId).then(phoneNumbers => {
        for (const { phone } of phoneNumbers) {
          createNotification({
            clinicId, patientId: patient.id, appointmentId: apt.id,
            type: NotificationType.APPOINTMENT_CONFIRMATION,
            channel: NotificationChannel.WHATSAPP, recipient: phone, content,
          }).catch(() => {})
        }
      }).catch(() => {})
    }

    if (patient.consentEmail && patient.email) {
      createNotification({
        clinicId, patientId: patient.id, appointmentId: apt.id,
        type: NotificationType.APPOINTMENT_CONFIRMATION,
        channel: NotificationChannel.EMAIL, recipient: patient.email,
        subject: "Agendamento em Grupo Criado - Confirmação",
        content,
      }).catch(() => {})
    }
  }
}
