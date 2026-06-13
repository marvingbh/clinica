import { reminderDue, isRequestExpired } from "@/lib/assinaturas"

export interface ReminderRequest {
  id: string
  status: string
  linkSentAt: Date | null
  remindersSent: number
  lastReminderAt: Date | null
  expiresAt: Date
}

/** Requests whose active signer should receive a D+3 / D+7 reminder now. */
export function selectRequestsToRemind<T extends ReminderRequest>(requests: T[], now: Date): T[] {
  return requests.filter((r) =>
    reminderDue(
      {
        linkSentAt: r.linkSentAt,
        remindersSent: r.remindersSent,
        lastReminderAt: r.lastReminderAt,
        status: r.status as never,
      },
      now
    )
  )
}

/** Requests past their expiry that should be flipped to EXPIRADO now. */
export function selectRequestsToExpire<T extends ReminderRequest>(requests: T[], now: Date): T[] {
  return requests.filter((r) => isRequestExpired({ expiresAt: r.expiresAt, status: r.status as never }, now))
}

export interface ReminderVariables {
  signerName: string
  clinicName: string
  documentTitle: string
  signingLink: string
}

export function buildReminderVariables(args: ReminderVariables): Record<string, string> {
  return {
    signerName: args.signerName,
    clinicName: args.clinicName,
    documentTitle: args.documentTitle,
    signingLink: args.signingLink,
  }
}
