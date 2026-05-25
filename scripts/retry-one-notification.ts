/**
 * Retry a single Notification by ID. Resets attempts/failureReason so a
 * previous failure doesn't immediately push it to FAILED, then runs
 * sendNotification — which will use the new clinic-sender lookup.
 *
 * Usage:
 *   DATABASE_URL="$DATABASE_URL_PROD" npx tsx scripts/retry-one-notification.ts <id>
 */

import { PrismaClient } from "@prisma/client"
import { sendNotification } from "../src/lib/notifications/notification-service"

const prisma = new PrismaClient()
const id = process.argv[2]

if (!id) {
  console.error("Usage: npx tsx scripts/retry-one-notification.ts <notification-id>")
  process.exit(1)
}

async function main() {
  console.log(`DB: ${process.env.DATABASE_URL?.replace(/:[^@/]+@/, ":***@") ?? "(unset)"}`)

  const before = await prisma.notification.findUnique({ where: { id } })
  if (!before) {
    console.error(`Notification ${id} not found`)
    process.exit(1)
  }
  console.log(`Before: ${before.status} → ${before.recipient} (attempts ${before.attempts}, last: ${before.failureReason ?? "none"})`)

  await prisma.notification.update({
    where: { id },
    data: { attempts: 0, nextRetryAt: new Date(), failureReason: null },
  })

  const result = await sendNotification(id)
  console.log(`Send result: ${result.success ? "✓ " + result.externalId : "✗ " + result.error}`)

  const after = await prisma.notification.findUnique({ where: { id } })
  console.log(`After:  ${after!.status} (sentAt=${after!.sentAt?.toISOString() ?? "-"}, lastError=${after!.failureReason ?? "-"})`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
