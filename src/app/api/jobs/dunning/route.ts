import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { selectDunningCandidates } from "@/lib/cobranca"
import { ensureChargeForDunning } from "@/lib/cobranca/charge-service"
import { sendChargeNotifications } from "@/lib/cobranca/charge-notify"
import { todayInZone, dueDateWindow, toDunningInput, type DunningInvoiceRow } from "@/lib/jobs/dunning"

/**
 * GET /api/jobs/dunning
 * Daily dunning (régua de cobrança) cron. Bearer ${CRON_SECRET}.
 * For each Connect-ACTIVE clinic with an enabled dunning config, selects
 * invoices whose dueDate+offset === today, reuses or creates a charge, and
 * sends PAYMENT_REMINDER notifications. Idempotent (1 send/invoice/day).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startTime = Date.now()
  const now = new Date()
  const summary = { clinicsProcessed: 0, candidates: 0, remindersSent: 0, errors: [] as string[] }

  try {
    const clinics = await prisma.clinic.findMany({
      where: {
        isActive: true,
        stripeConnectStatus: "ACTIVE",
        dunningConfig: { enabled: true },
      },
      select: { id: true, timezone: true, dunningConfig: true },
    })

    for (const clinic of clinics) {
      const cfg = clinic.dunningConfig!
      try {
        const result = await processClinic(clinic.id, clinic.timezone, cfg, now)
        summary.clinicsProcessed++
        summary.candidates += result.candidates
        summary.remindersSent += result.remindersSent

        await prisma.auditLog.create({
          data: {
            clinicId: clinic.id,
            userId: null,
            action: "DUNNING_JOB_EXECUTED",
            entityType: "CronJob",
            entityId: "dunning",
            newValues: { candidates: result.candidates, remindersSent: result.remindersSent },
          },
        })
      } catch (error) {
        summary.errors.push(`Clinic ${clinic.id}: ${error instanceof Error ? error.message : "erro"}`)
        console.error(`[dunning] Error processing clinic ${clinic.id}:`, error)
      }
    }

    return NextResponse.json({ success: true, executionTimeMs: Date.now() - startTime, ...summary })
  } catch (error) {
    console.error("[dunning] Critical error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "erro", ...summary },
      { status: 500 }
    )
  }
}

interface DunningCfg {
  enabled: boolean
  offsets: number[]
  sendWhatsApp: boolean
  sendEmail: boolean
  maxAttempts: number
}

async function processClinic(
  clinicId: string,
  timeZone: string,
  cfg: DunningCfg,
  now: Date
): Promise<{ candidates: number; remindersSent: number }> {
  const today = todayInZone(now, timeZone)
  const { gte, lte } = dueDateWindow(today, cfg.offsets)

  const invoices = await prisma.invoice.findMany({
    where: {
      clinicId,
      status: { in: ["PENDENTE", "ENVIADO", "PARCIAL"] },
      dueDate: { gte: new Date(`${gte}T00:00:00.000Z`), lte: new Date(`${lte}T23:59:59.999Z`) },
    },
    select: {
      id: true,
      status: true,
      dueDate: true,
      totalAmount: true,
      reconciliationLinks: { select: { amount: true } },
      patient: {
        select: { dunningOptOut: true, consentWhatsApp: true, consentEmail: true, phone: true, email: true },
      },
      notifications: {
        where: { type: "PAYMENT_REMINDER" },
        select: { createdAt: true },
      },
    },
  })

  const rows: DunningInvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    status: inv.status,
    dueDate: inv.dueDate,
    totalAmount: Number(inv.totalAmount),
    linkAmounts: inv.reconciliationLinks.map((l) => Number(l.amount)),
    patient: inv.patient,
    reminders: inv.notifications,
  }))

  const inputs = rows
    .map((r) => toDunningInput(r, timeZone))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const candidates = selectDunningCandidates(inputs, cfg, today)

  let remindersSent = 0
  for (const candidate of candidates) {
    try {
      const chargeId = await ensureChargeForDunning(candidate.invoiceId, clinicId)
      const { sent } = await sendChargeNotifications({
        chargeId,
        channels: candidate.channels,
        type: "PAYMENT_REMINDER",
      })
      remindersSent += sent.length
    } catch (error) {
      console.error(`[dunning] Failed to remind invoice ${candidate.invoiceId}:`, error)
    }
  }

  return { candidates: candidates.length, remindersSent }
}

export { GET as POST }
