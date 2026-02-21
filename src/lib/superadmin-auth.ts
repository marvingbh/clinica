import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const SUPER_ADMIN_COOKIE = "superadmin-token"
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret")

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
    .sign(SECRET)
}

export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SUPER_ADMIN_COOKIE)?.value

  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, SECRET)
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
