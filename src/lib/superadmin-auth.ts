import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { createHmac } from "crypto"

const SUPER_ADMIN_COOKIE = "superadmin-token"

/**
 * Signing key for superadmin tokens.
 *
 * - Requires AUTH_SECRET to be set (no insecure "dev-secret" fallback). An unset
 *   secret would let anyone forge a superadmin token and control every clinic, so
 *   we fail closed at call time.
 * - Domain-separates from NextAuth's use of AUTH_SECRET via HKDF-style derivation,
 *   so the superadmin signing key is never byte-identical to the user-session key.
 */
function getSecret(): Uint8Array {
  const base = process.env.AUTH_SECRET
  if (!base) {
    throw new Error(
      "AUTH_SECRET environment variable is required for superadmin authentication"
    )
  }
  return new Uint8Array(createHmac("sha256", base).update("superadmin-jwt-v1").digest())
}

export interface SuperAdminSession {
  id: string
  email: string
  name: string
}

export async function createSuperAdminToken(payload: SuperAdminSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .setIssuedAt()
    .sign(getSecret())
}

export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecret())
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
    }
  } catch {
    return null
  }
}

export async function setSuperAdminCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SUPER_ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60,
    path: "/",
  })
}

export async function clearSuperAdminCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SUPER_ADMIN_COOKIE)
}
