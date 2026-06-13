import { createSign, createVerify } from "crypto"

/**
 * Detached RSA-SHA256 signature of a document hash, using the clinic's NFS-e
 * A1 private key (PEM). The caller decrypts NfseConfig.privateKeyPem with the
 * AES-256-GCM helper (see src/lib/nfse/emit-single.ts) before calling this.
 *
 * NOTE: this is a *detached* countersignature of the SHA-256 hash, not an
 * embedded PAdES signature. It strengthens non-repudiation and is recorded in
 * the envelope + verifiable at /verificar.
 */
export function countersignHash(sha256Hex: string, privateKeyPem: string): string {
  const signer = createSign("RSA-SHA256")
  signer.update(sha256Hex)
  signer.end()
  return signer.sign(privateKeyPem).toString("base64")
}

/** Verifies a detached countersignature against the certificate PEM. */
export function verifyCountersign(
  sha256Hex: string,
  signatureB64: string,
  certPem: string
): boolean {
  try {
    const verifier = createVerify("RSA-SHA256")
    verifier.update(sha256Hex)
    verifier.end()
    return verifier.verify(certPem, Buffer.from(signatureB64, "base64"))
  } catch {
    return false
  }
}
