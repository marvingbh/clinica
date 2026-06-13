/**
 * Resolves the public base URL used to build form-fill links. Mirrors the
 * cobranca/assinaturas senders (NEXT_PUBLIC_APP_URL with a localhost fallback).
 */
export function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}
