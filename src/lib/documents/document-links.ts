import { createHmac } from "crypto"

const EXPIRY_DAYS = 7

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is required for signing document links")
  }
  return secret
}

function computeHmac(documentId: string, expires: number): string {
  const payload = `document:${documentId}:${expires}`
  return createHmac("sha256", getSecret()).update(payload).digest("hex")
}

/** Sign a 7-day download link for a generated document. */
export function signDocumentLink(documentId: string): { expires: number; sig: string } {
  const expires = Math.floor(Date.now() / 1000) + EXPIRY_DAYS * 24 * 60 * 60
  const sig = computeHmac(documentId, expires)
  return { expires, sig }
}

/** Verify a download link. Checks expiry first, then signature (pt-BR errors). */
export function verifyDocumentLink(
  documentId: string,
  expires: number,
  sig: string
): { valid: boolean; error?: string } {
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(expires) || now > expires) {
    return { valid: false, error: "Este link expirou. Solicite um novo à clínica." }
  }
  const expectedSig = computeHmac(documentId, expires)
  if (sig !== expectedSig) {
    return { valid: false, error: "Link inválido" }
  }
  return { valid: true }
}

/** Build the absolute public download URL for a document. */
export function buildDocumentDownloadUrl(baseUrl: string, documentId: string): string {
  const { expires, sig } = signDocumentLink(documentId)
  return `${baseUrl}/api/public/documents/${documentId}/download?expires=${expires}&sig=${sig}`
}
