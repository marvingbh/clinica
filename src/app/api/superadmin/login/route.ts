import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"
import { createSuperAdminToken, setSuperAdminCookie } from "@/lib/superadmin-auth"
import { checkRateLimit, RATE_LIMIT_CONFIGS, RateLimitUnavailableError } from "@/lib/rate-limit"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
})

// Same cost factor as production hashes — equalises timing when admin not found.
const DUMMY_HASH = "$2b$12$DummyHashForTimingParityNeverMatchesAnyPasswordAtAllXYZ"

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"

  try {
    const rl = await checkRateLimit(`superadmin-login:${ip}`, RATE_LIMIT_CONFIGS.superadminLogin)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfter / 1000)) } },
      )
    }
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) {
      return NextResponse.json({ error: "Servico temporariamente indisponivel" }, { status: 503 })
    }
    throw err
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados invalidos", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { email, password } = parsed.data
  const admin = await prisma.superAdmin.findUnique({ where: { email: email.toLowerCase() } })

  const valid = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH)

  if (!admin || !valid) {
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 })
  }

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
