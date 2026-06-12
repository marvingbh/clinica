import { after } from "next/server"
import { Prisma, type PrismaClient } from "@prisma/client"

type Db = Prisma.TransactionClient | PrismaClient

export interface EnqueueParams {
  clinicId: string
  appointmentIds: string[]
  operation: "UPSERT" | "DELETE"
}

/**
 * Enqueues calendar-sync jobs (one per appointment) into the durable outbox.
 * Uses createMany + skipDuplicates: the partial unique index on
 * (appointmentId, operation) WHERE status='PENDING' dedupes re-enqueues so a
 * burst of mutations collapses into a single pending job. Returns the count
 * createMany reports as inserted.
 *
 * Best-effort and non-fatal: failures here must never break the appointment
 * mutation. Callers should still wrap in try/catch when outside a transaction.
 */
export async function enqueueCalendarSync(db: Db, params: EnqueueParams): Promise<number> {
  const ids = [...new Set(params.appointmentIds)].filter(Boolean)
  if (ids.length === 0) return 0

  const result = await db.calendarSyncJob.createMany({
    data: ids.map((appointmentId) => ({
      clinicId: params.clinicId,
      appointmentId,
      operation: params.operation,
      status: "PENDING" as const,
      nextRetryAt: new Date(),
    })),
    skipDuplicates: true,
  })
  return result.count
}

/**
 * Schedules the sync processor to run after the HTTP response is sent (Next 16
 * `after()`). Best-effort fast path — the cron is the guaranteed sweep. The
 * processor is imported lazily to keep this module free of Prisma/client deps
 * at import time and to avoid bundling it into the request hot path.
 */
export function flushCalendarSyncAfterResponse(limit = 50): void {
  try {
    after(async () => {
      try {
        const { processCalendarSyncJobs } = await import("./processor")
        await processCalendarSyncJobs(limit)
      } catch (err) {
        console.error("[calendar-sync] post-response flush failed:", err)
      }
    })
  } catch {
    // after() can only be called within a request scope; ignore otherwise
    // (e.g. cron paths call the processor directly).
  }
}
