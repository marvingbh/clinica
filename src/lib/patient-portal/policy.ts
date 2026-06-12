import { getSubscriptionAccess, type SubscriptionInfo } from "@/lib/subscription"

/** Statuses from which a patient may confirm presence in the portal. */
export function canConfirmInPortal(status: string): boolean {
  return status === "AGENDADO"
}

export type CancelDenyReason = "status" | "window"

export interface CancelDecision {
  allowed: boolean
  reason?: CancelDenyReason
}

/**
 * Cancellation policy: only AGENDADO/CONFIRMADO sessions can be cancelled, and
 * only while `now < scheduledAt - minHours`.
 */
export function canCancelInPortal(args: {
  status: string
  scheduledAt: Date
  now: Date
  minHours: number
}): CancelDecision {
  if (args.status !== "AGENDADO" && args.status !== "CONFIRMADO") {
    return { allowed: false, reason: "status" }
  }
  const deadline = args.scheduledAt.getTime() - args.minHours * 60 * 60 * 1000
  if (args.now.getTime() >= deadline) {
    return { allowed: false, reason: "window" }
  }
  return { allowed: true }
}

export type PortalAccess = "full" | "read_only" | "disabled"

/**
 * Resolves the effective portal access for a clinic, composing the plan/clinic
 * gating with the SaaS subscription status.
 *
 * - Plan off, clinic off, or clinic inactive → disabled (route 404s)
 * - Subscription read_only (expired trial / canceled / unpaid) → read_only
 * - Otherwise (active, past_due/full_access_warning, valid trial) → full
 */
export function resolvePortalAccess(args: {
  planAllows: boolean
  clinicEnabled: boolean
  clinicActive: boolean
  subscription: SubscriptionInfo
}): PortalAccess {
  if (!args.planAllows || !args.clinicEnabled || !args.clinicActive) {
    return "disabled"
  }
  const sub = getSubscriptionAccess(args.subscription)
  if (sub === "read_only") return "read_only"
  return "full"
}
