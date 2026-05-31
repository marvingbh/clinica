import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"
import { createSuperAdminToken, setSuperAdminCookie } from "@/lib/superadmin-auth"
import { checkLockout, recordAttempt, clearAttempts, clientIpFromHeaders } from "@/lib/auth-rate-limit"

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: "Email e senha obrigatorios" }, { status: 400 })
  }

  const ip = clientIpFromHeaders(req.headers)

  // Persistent brute-force protection for the highest-value account in the system.
  const lockout = await checkLockout(email, "SUPERADMIN")
  if (lockout.locked) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(lockout.retryAfterMs / 1000)) } }
    )
  }

  const admin = await prisma.superAdmin.findUnique({ where: { email } })
  if (!admin) {
    await recordAttempt({ identifier: email, kind: "SUPERADMIN", success: false, ipAddress: ip })
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 })
  }

  const valid = await verifyPassword(password, admin.passwordHash)
  if (!valid) {
    await recordAttempt({ identifier: email, kind: "SUPERADMIN", success: false, ipAddress: ip })
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 })
  }

  await clearAttempts(email, "SUPERADMIN")

  const token = await createSuperAdminToken({
    id: admin.id,
    email: admin.email,
    name: admin.name,
  })
  await setSuperAdminCookie(token)

  return NextResponse.json({
    admin: { id: admin.id, email: admin.email, name: admin.name },
  })
}
