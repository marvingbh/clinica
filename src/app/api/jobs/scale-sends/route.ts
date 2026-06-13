import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { processPendingNotifications } from "@/lib/notifications"
import { sendScaleToPatient } from "@/lib/scales/send"
import { decideSchedule } from "@/lib/scales/schedule"
import { buildScheduleDecisionInput, pickSendChannel } from "@/lib/jobs/scale-sends"
import { getAppBaseUrl } from "@/lib/forms/base-url"

/**
 * GET /api/jobs/scale-sends — daily cron (11:00 UTC / 08:00 BRT).
 *  1. Expire ENVIADA administrations past their expiry.
 *  2. For each active schedule, decide SEND / PAUSE / SKIP and act.
 *  3. Flush pending notifications.
 * Per-clinic errors are isolated so one failure doesn't abort the run.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const results = {
    clinicsProcessed: 0,
    expired: 0,
    sent: 0,
    paused: 0,
    skipped: 0,
    errors: [] as string[],
  }

  const clinics = await prisma.clinic.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  for (const clinic of clinics) {
    try {
      results.clinicsProcessed++

      const expired = await prisma.scaleAdministration.updateMany({
        where: { clinicId: clinic.id, status: "ENVIADA", expiresAt: { lt: now } },
        data: { status: "EXPIRADA" },
      })
      results.expired += expired.count

      const schedules = await prisma.scaleSchedule.findMany({
        where: { clinicId: clinic.id, active: true },
        select: {
          id: true,
          patientId: true,
          professionalProfileId: true,
          scaleCode: true,
          cadenceType: true,
          intervalWeeks: true,
          lastSentAt: true,
          professionalProfile: { select: { user: { select: { isActive: true } } } },
          patient: {
            select: {
              consentWhatsApp: true,
              phone: true,
              consentEmail: true,
              email: true,
              recordClosedAt: true,
            },
          },
        },
      })

      for (const schedule of schedules) {
        const nextConsulta = await prisma.appointment.findFirst({
          where: {
            clinicId: clinic.id,
            patientId: schedule.patientId,
            type: "CONSULTA",
            status: { in: ["AGENDADO", "CONFIRMADO"] },
            scheduledAt: { gt: now },
          },
          orderBy: { scheduledAt: "asc" },
          select: { id: true, scheduledAt: true },
        })

        const alreadySent =
          nextConsulta != null &&
          (await prisma.scaleAdministration.count({
            where: { scheduleId: schedule.id, appointmentId: nextConsulta.id },
          })) > 0

        const input = buildScheduleDecisionInput(schedule, {
          now,
          nextConsultaAt: nextConsulta?.scheduledAt ?? null,
          alreadySentForAppointment: alreadySent,
          professionalIsActive: schedule.professionalProfile.user.isActive,
          patient: {
            consentWhatsApp: schedule.patient.consentWhatsApp,
            phone: schedule.patient.phone,
            consentEmail: schedule.patient.consentEmail,
            email: schedule.patient.email,
          },
          // recordClosedAt is now part of the schema (prontuário shipped).
          recordClosedAt: schedule.patient.recordClosedAt,
        })

        const decision = decideSchedule(input)

        if (decision.action === "PAUSE") {
          await prisma.scaleSchedule.update({
            where: { id: schedule.id },
            data: { active: false, pausedReason: decision.reason },
          })
          results.paused++
          continue
        }
        if (decision.action === "SKIP") {
          results.skipped++
          continue
        }

        const channel = pickSendChannel({
          consentWhatsApp: schedule.patient.consentWhatsApp,
          phone: schedule.patient.phone,
          consentEmail: schedule.patient.consentEmail,
          email: schedule.patient.email,
        })
        if (!channel) {
          await prisma.scaleSchedule.update({
            where: { id: schedule.id },
            data: { active: false, pausedReason: "SEM_CANAL_CONSENTIDO" },
          })
          results.paused++
          continue
        }

        await sendScaleToPatient({
          clinicId: clinic.id,
          patientId: schedule.patientId,
          professionalProfileId: schedule.professionalProfileId,
          scaleCode: schedule.scaleCode,
          channel,
          baseUrl: getAppBaseUrl(),
          scheduleId: schedule.id,
          appointmentId: decision.targetAppointment ? nextConsulta?.id ?? null : null,
        })
        await prisma.scaleSchedule.update({
          where: { id: schedule.id },
          data: { lastSentAt: now },
        })
        results.sent++
      }
    } catch (err) {
      results.errors.push(`Clinic ${clinic.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await processPendingNotifications(50).catch(() => {})

  return NextResponse.json(results)
}
