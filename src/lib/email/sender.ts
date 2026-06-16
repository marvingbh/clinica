/**
 * Hybrid email-sender resolution (multi-tenant).
 *
 * Precedence:
 *   1. The clinic's OWN verified domain  → from = address on that domain.
 *   2. The shared SaaS domain (EMAIL_SHARED_DOMAIN) → from = notificacao@<shared>,
 *      with the clinic's name as the display name and reply-to = clinic email.
 *   3. Legacy fallback (clinic.emailFromAddress or RESEND_FROM_EMAIL).
 *
 * Returns null when no sender can be resolved (caller should skip/surface).
 */
export interface ClinicSenderInput {
  name: string
  email: string | null
  emailSenderName: string | null
  emailFromAddress: string | null
  emailDomain: string | null
  emailDomainStatus: string | null
}

export interface ResolvedSender {
  fromEmail: string
  fromName: string
  replyTo?: string
}

export function isAddressOnDomain(address: string, domain: string): boolean {
  const a = address.trim().toLowerCase()
  const d = domain.trim().toLowerCase()
  const at = a.indexOf("@")
  if (at < 0) return false
  const host = a.slice(at + 1)
  return host === d || host.endsWith("." + d)
}

export function resolveClinicSender(clinic: ClinicSenderInput): ResolvedSender | null {
  const fromName = clinic.emailSenderName?.trim() || clinic.name
  const replyTo = clinic.email || undefined

  // 1. Verified custom domain → send from the clinic's own domain.
  if (clinic.emailDomainStatus === "verified" && clinic.emailDomain) {
    const fromEmail =
      clinic.emailFromAddress && isAddressOnDomain(clinic.emailFromAddress, clinic.emailDomain)
        ? clinic.emailFromAddress
        : `naoresponda@${clinic.emailDomain}`
    return { fromEmail, fromName, replyTo }
  }

  // 2. Shared SaaS domain → branded From name + reply-to back to the clinic.
  const shared = process.env.EMAIL_SHARED_DOMAIN?.trim()
  if (shared) {
    return { fromEmail: `notificacao@${shared}`, fromName, replyTo }
  }

  // 3. Legacy fallback.
  const legacy = clinic.emailFromAddress || process.env.RESEND_FROM_EMAIL
  if (legacy) return { fromEmail: legacy, fromName, replyTo }

  return null
}
