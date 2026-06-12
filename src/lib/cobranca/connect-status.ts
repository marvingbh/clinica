/**
 * Maps a Stripe Connect account's capability flags to our internal status.
 * DISCONNECTED is set explicitly by the disconnect action and is never
 * derived here (a connected account always submitted at least nothing yet).
 */
export function deriveConnectStatus(account: {
  charges_enabled: boolean
  details_submitted: boolean
}): "ONBOARDING" | "ACTIVE" | "RESTRICTED" {
  if (account.charges_enabled) return "ACTIVE"
  if (account.details_submitted) return "RESTRICTED"
  return "ONBOARDING"
}
