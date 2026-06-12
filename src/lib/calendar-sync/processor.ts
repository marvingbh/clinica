import { prisma } from "@/lib/prisma"
import { calculateNextRetryDelay } from "@/lib/notifications/types"
import { createAndSendNotification } from "@/lib/notifications/notification-service"
import { NotificationChannel, NotificationType } from "@prisma/client"
import type { CalendarClient } from "./types"
import { CalendarAuthError, CalendarRateLimitError, CalendarNotFoundError } from "./types"
import { planSyncAction } from "./sync-planner"
import { buildGoogleEventBody, computeSyncHash } from "./event-mapping"
import { buildCalendarClient } from "./providers/client-factory"
import {
  toSnapshot,
  professionalUserIds,
  prefsOf,
  buildSyncErrorEmail,
  type AppointmentRow,
} from "./processor-helpers"

export interface ProcessResult {
  processed: number
  succeeded: number
  retried: number
  failed: number
}

const APPOINTMENT_INCLUDE = {
  patient: { select: { name: true } },
  clinic: { select: { name: true, timezone: true } },
  professionalProfile: { select: { userId: true } },
  additionalProfessionals: {
    select: { professionalProfile: { select: { userId: true } } },
  },
} as const

function agendaBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

/** Notifies a professional that their integration broke; never throws. */
async function notifySyncError(
  clinicId: string,
  userId: string,
  reason: "revoked" | "error"
): Promise<void> {
  try {
    const user = await prisma.user.findFirst({
      where: { id: userId, clinicId },
      select: { email: true },
    })
    if (!user?.email) return
    const { subject, content } = buildSyncErrorEmail(reason, agendaBaseUrl())
    await createAndSendNotification({
      clinicId,
      type: NotificationType.CALENDAR_SYNC_ERROR,
      channel: NotificationChannel.EMAIL,
      recipient: user.email,
      subject,
      content,
    })
  } catch (err) {
    console.error("[calendar-sync] failed to send sync-error email:", err)
  }
}

/** Marks an integration REVOGADA and emails the owner (auth error). */
async function markRevoked(integration: { id: string; clinicId: string; userId: string }) {
  await prisma.calendarIntegration.update({
    where: { id: integration.id },
    data: { status: "REVOGADA", lastErrorMessage: "Acesso ao Google revogado" },
  })
  await notifySyncError(integration.clinicId, integration.userId, "revoked")
}

interface IntegrationRow {
  id: string
  clinicId: string
  userId: string
  privacyMode: "TOTAL" | "PRIMEIRO_NOME"
  syncNonBlocking: boolean
  targetCalendarId: string | null
  encryptedRefreshToken: string | null
}

/**
 * Applies the planned action for one integration against one appointment.
 * Throws CalendarAuthError to signal the integration is revoked (handled by
 * the caller). Returns nothing on success.
 */
async function syncOneIntegration(
  client: CalendarClient,
  integration: IntegrationRow,
  appointmentId: string,
  snapshot: ReturnType<typeof toSnapshot> | null
): Promise<void> {
  const calendarId = integration.targetCalendarId || "primary"
  const action = snapshot ? planSyncAction(snapshot, prefsOf(integration)) : "deleteRemote"

  const existingLink = await prisma.calendarEventLink.findUnique({
    where: { integrationId_appointmentId: { integrationId: integration.id, appointmentId } },
  })

  if (action === "deleteRemote") {
    if (!existingLink) return
    try {
      await client.deleteEvent(existingLink.googleCalendarId, existingLink.googleEventId)
    } catch (err) {
      if (!(err instanceof CalendarNotFoundError)) throw err
      // 404/410 → already gone, treat as success.
    }
    await prisma.calendarEventLink.delete({ where: { id: existingLink.id } }).catch(() => {})
    return
  }

  // upsert
  const body = buildGoogleEventBody(snapshot!, prefsOf(integration), agendaBaseUrl())
  const hash = computeSyncHash(body)

  if (existingLink) {
    if (existingLink.lastSyncHash === hash) return // no-op
    try {
      await client.updateEvent(existingLink.googleCalendarId, existingLink.googleEventId, body)
      await prisma.calendarEventLink.update({
        where: { id: existingLink.id },
        data: { lastSyncHash: hash },
      })
      return
    } catch (err) {
      if (!(err instanceof CalendarNotFoundError)) throw err
      // Event deleted in Google → recreate below.
      await prisma.calendarEventLink.delete({ where: { id: existingLink.id } }).catch(() => {})
    }
  }

  // Recover orphan event from an interrupted run, else insert fresh.
  let eventId: string
  const orphans = await client.findEventsByAppointmentId(calendarId, appointmentId)
  if (orphans.length > 0) {
    eventId = orphans[0].id
    await client.updateEvent(calendarId, eventId, body).catch(() => {})
  } else {
    const inserted = await client.insertEvent(calendarId, body)
    eventId = inserted.id
  }

  await prisma.calendarEventLink.create({
    data: {
      clinicId: integration.clinicId,
      integrationId: integration.id,
      appointmentId,
      googleCalendarId: calendarId,
      googleEventId: eventId,
      lastSyncHash: hash,
    },
  })
}

/** Resolves the GOOGLE integrations that should receive this appointment's event. */
async function resolveTargets(
  clinicId: string,
  appointmentId: string,
  userIds: string[]
): Promise<IntegrationRow[]> {
  const byUser =
    userIds.length > 0
      ? await prisma.calendarIntegration.findMany({
          where: {
            clinicId,
            provider: "GOOGLE",
            status: { not: "REVOGADA" },
            userId: { in: userIds },
          },
        })
      : []

  // For deletes / orphan appointments, also include any integration that still
  // has a link for this appointment (clinic-scoped).
  const links = await prisma.calendarEventLink.findMany({
    where: { clinicId, appointmentId },
    select: { integrationId: true },
  })
  const linkIds = links.map((l) => l.integrationId).filter((id) => !byUser.some((i) => i.id === id))
  const byLink =
    linkIds.length > 0
      ? await prisma.calendarIntegration.findMany({
          where: { clinicId, id: { in: linkIds }, provider: "GOOGLE" },
        })
      : []

  return [...byUser, ...byLink] as IntegrationRow[]
}

/**
 * Drains pending calendar-sync jobs. For each job: loads the appointment
 * (clinic-scoped), resolves target GOOGLE integrations, and applies the planned
 * action per integration. Retries with exponential backoff on rate-limit/5xx;
 * marks the integration REVOGADA on auth errors (and emails the owner). Failed
 * jobs after maxAttempts set the integration to ERRO and email the owner.
 */
export async function processCalendarSyncJobs(limit = 50): Promise<ProcessResult> {
  const now = new Date()
  const jobs = await prisma.calendarSyncJob.findMany({
    where: { status: "PENDING", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
    orderBy: { createdAt: "asc" },
    take: limit,
  })

  const result: ProcessResult = { processed: 0, succeeded: 0, retried: 0, failed: 0 }

  for (const job of jobs) {
    result.processed++
    // Captured outside the try so a permanent failure only flags the
    // integrations that were actually targeted by THIS appointment (never the
    // whole clinic).
    let targets: IntegrationRow[] = []
    try {
      const appt = (await prisma.appointment.findFirst({
        where: { id: job.appointmentId, clinicId: job.clinicId },
        include: APPOINTMENT_INCLUDE,
      })) as AppointmentRow | null

      const snapshot = appt ? toSnapshot(appt) : null
      const userIds = appt ? professionalUserIds(appt) : []
      targets = await resolveTargets(job.clinicId, job.appointmentId, userIds)

      let authFailures = 0
      for (const integration of targets) {
        const client = buildCalendarClient(integration)
        try {
          await syncOneIntegration(client, integration, job.appointmentId, snapshot)
          await prisma.calendarIntegration.update({
            where: { id: integration.id },
            data: { lastSyncAt: new Date() },
          })
        } catch (err) {
          if (err instanceof CalendarAuthError) {
            authFailures++
            await markRevoked(integration)
            continue // other integrations are unaffected
          }
          throw err // rate-limit / 5xx / unexpected → whole job retries
        }
      }

      await prisma.calendarSyncJob.update({
        where: { id: job.id },
        data: { status: "DONE", lastError: authFailures > 0 ? "Integração revogada" : null },
      })
      result.succeeded++
    } catch (err) {
      await handleJobFailure(job, err, targets, result)
    }
  }

  return result
}

async function handleJobFailure(
  job: { id: string; clinicId: string; appointmentId: string; attempts: number; maxAttempts: number },
  err: unknown,
  targets: IntegrationRow[],
  result: ProcessResult
): Promise<void> {
  const attempts = job.attempts + 1
  const message = err instanceof Error ? err.message : "Erro desconhecido"
  const isFinal = attempts >= job.maxAttempts

  if (isFinal) {
    await prisma.calendarSyncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", attempts, lastError: message },
    })
    // Flag only the integrations this appointment targeted (never the whole
    // clinic). Skip ones already REVOGADA. Defensive findMany re-scopes by id +
    // clinicId in case `targets` is stale.
    const ids = [...new Set(targets.map((t) => t.id))]
    const integrations =
      ids.length > 0
        ? await prisma.calendarIntegration.findMany({
            where: { id: { in: ids }, clinicId: job.clinicId, status: { not: "REVOGADA" } },
          })
        : []
    for (const integ of integrations) {
      await prisma.calendarIntegration.update({
        where: { id: integ.id },
        data: { status: "ERRO", lastErrorMessage: message },
      })
      await notifySyncError(integ.clinicId, integ.userId, "error")
    }
    result.failed++
  } else {
    const retryMs =
      err instanceof CalendarRateLimitError && err.retryAfterMs
        ? err.retryAfterMs
        : calculateNextRetryDelay(attempts)
    await prisma.calendarSyncJob.update({
      where: { id: job.id },
      data: { attempts, lastError: message, nextRetryAt: new Date(Date.now() + retryMs) },
    })
    result.retried++
  }
}
