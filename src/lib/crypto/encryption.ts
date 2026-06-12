import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

/**
 * Symmetric AES-256-GCM encryption helper.
 *
 * Generic, framework-free. Used by the bank-reconciliation module (Inter
 * client certificates) and the calendar-sync module (Google OAuth refresh
 * tokens). The 32-byte key comes from the `ENCRYPTION_KEY` env var (64 hex
 * chars). Ciphertext format is `iv:authTag:ciphertext`, all hex.
 */

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")
  }
  return Buffer.from(hex, "hex")
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const [ivHex, authTagHex, encryptedHex] = ciphertext.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}
