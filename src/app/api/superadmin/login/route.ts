import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"
import { createSuperAdminToken, setSuperAdminCookie } from "@/lib/superadmin-auth"

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: "Email e senha obrigatorios" }, { status: 400 })
  }

  const admin = await prisma.superAdmin.findUnique({ where: { email } })
  if (!admin) {
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 })
  }

  const valid = await verifyPassword(password, admin.passwordHash)
  if (!valid) {
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
