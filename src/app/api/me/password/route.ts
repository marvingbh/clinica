import { NextResponse } from "next/server"
import { z } from "zod"
import { withAuthentication } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password"
import { audit, AuditAction } from "@/lib/rbac/audit"

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
})

export const POST = withAuthentication(async (req, user) => {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados invalidos", details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { currentPassword, newPassword } = parsed.data

  const strength = validatePasswordStrength(newPassword)
  if (!strength.ok) {
    return NextResponse.json({ error: strength.reason }, { status: 400 })
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  })
  if (!row) return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 })

  const valid = await verifyPassword(currentPassword, row.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  })

  audit.log({
    user,
    action: AuditAction.USER_PASSWORD_CHANGED,
    entityType: "User",
    entityId: user.id,
    newValues: { actor: "self" },
    request: req,
  }).catch(() => {})

  return NextResponse.json({ success: true })
})
