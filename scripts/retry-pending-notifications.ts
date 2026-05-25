/**
 * One-off retry of PENDING intake-admin notifications.
 *
 * Scoped to type=INTAKE_FORM_SUBMITTED on purpose: there are ~1100 stale
 * APPOINTMENT_CONFIRMATION notifications sitting PENDING from earlier
 * days that we DON'T want to mass-retry — most of those appointments
 * have moved on (finalized, cancelled, rescheduled), and blasting fresh
 * confirmations would confuse patients. The intake admin emails are
 * different: they're internal notifications for staff that we know
 * failed only because of a sender-config bug now fixed.
 *
 * Usage:
 *   DATABASE_URL="$DATABASE_URL_PROD" npx tsx scripts/retry-pending-notifications.ts
 *   DATABASE_URL="$DATABASE_URL_PROD" npx tsx scripts/retry-pending-notifications.ts --apply
 *
 * Default mode is dry-run. Pass --apply to send.
 */

import { PrismaClient, NotificationStatus, NotificationType } from "@prisma/client"
import { sendNotification } from "../src/lib/notifications/notification-service"

const prisma = new PrismaClient()
const DRY_RUN = !process.argv.includes("--apply")
const TARGET_TYPE = NotificationType.INTAKE_FORM_SUBMITTED

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN (pass --apply to retry)\n" : "✏️  RETRYING INTAKE NOTIFICATIONS\n")
  console.log(`DB: ${process.env.DATABASE_URL?.replace(/:[^@/]+@/, ":***@") ?? "(unset)"}`)
  console.log(`Filter: type = ${TARGET_TYPE}\n`)

  const pending = await prisma.notification.findMany({
    where: {
      status: NotificationStatus.PENDING,
      type: TARGET_TYPE,
    },
    select: {
      id: true,
      type: true,
      channel: true,
      recipient: true,
      attempts: true,
      maxAttempts: true,
      failureReason: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  console.log(`Found ${pending.length} PENDING ${TARGET_TYPE} notification(s):\n`)
  for (const n of pending) {
    console.log(
      `  [${n.channel}] → ${n.recipient}` +
        ` (attempts ${n.attempts}/${n.maxAttempts}, created ${n.createdAt.toISOString().slice(0, 16)})` +
        (n.failureReason ? `\n      last error: ${n.failureReason.slice(0, 100)}` : ""),
    )
  }

  if (DRY_RUN || pending.length === 0) {
    await prisma.$disconnect()
    return
  }

  // Reset attempts so a failure here doesn't push them straight to FAILED
  // on the off-chance a previous failed attempt left them at maxAttempts.
  // sendNotification increments attempts internally.
  await prisma.notification.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { attempts: 0, nextRetryAt: new Date(), failureReason: null },
  })

  console.log("\nSending...")
  for (const n of pending) {
    const result = await sendNotification(n.id)
    console.log(`  ${n.recipient}: ${result.success ? "✓ sent" : `✗ ${result.error}`}`)
  }

  // Show the resulting state.
  const final = await prisma.notification.findMany({
    where: { id: { in: pending.map((p) => p.id) } },
    select: { id: true, recipient: true, status: true, attempts: true, sentAt: true, failureReason: true },
  })
  console.log("\nFinal state:")
  for (const n of final) {
    const detail =
      n.status === "SENT"
        ? `sent at ${n.sentAt?.toISOString().slice(0, 16)}`
        : n.status === "FAILED"
        ? `FAILED — ${n.failureReason?.slice(0, 100)}`
        : `still PENDING (attempts ${n.attempts}, last error: ${n.failureReason?.slice(0, 100)})`
    console.log(`  ${n.recipient} → ${n.status} (${detail})`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
