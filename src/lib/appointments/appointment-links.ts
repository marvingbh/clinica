import { createHmac } from "crypto"

export type LinkAction = "confirm" | "cancel"

const EXPIRY_HOURS = 24

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required for signing appointment links")
  }
  return secret
}

function computeHmac(appointmentId: string, action: LinkAction, expires: number): string {
  const payload = `${appointmentId}:${action}:${expires}`
  return createHmac("sha256", getSecret()).update(payload).digest("hex")
}

export function signLink(
  appointmentId: string,
  action: LinkAction,
  scheduledAt: Date
): { expires: number; sig: string } {
  const expires = Math.floor(scheduledAt.getTime() / 1000) + EXPIRY_HOURS * 60 * 60
  const sig = computeHmac(appointmentId, action, expires)
  return { expires, sig }
}

export function verifyLink(
  appointmentId: string,
  action: LinkAction,
  expires: number,
  sig: string
): { valid: boolean; error?: string } {
  // Check expiry first
  const now = Math.floor(Date.now() / 1000)
  if (now > expires) {
    return { valid: false, error: "Este link expirou. Entre em contato com a clinica para um novo link." }
  }

  // Verify signature
  const expectedSig = computeHmac(appointmentId, action, expires)
  if (sig !== expectedSig) {
    return { valid: false, error: "Link invalido" }
  }

  return { valid: true }
}

export function buildConfirmUrl(baseUrl: string, appointmentId: string, scheduledAt: Date): string {
  const { expires, sig } = signLink(appointmentId, "confirm", scheduledAt)
  return `${baseUrl}/confirm?id=${appointmentId}&expires=${expires}&sig=${sig}`
}

export function buildCancelUrl(baseUrl: string, appointmentId: string, scheduledAt: Date): string {
  const { expires, sig } = signLink(appointmentId, "cancel", scheduledAt)
  return `${baseUrl}/cancel?id=${appointmentId}&expires=${expires}&sig=${sig}`
}
