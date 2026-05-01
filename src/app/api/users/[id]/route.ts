import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password"
import { revokeUser } from "@/lib/api/auth-user"
import { audit, AuditAction } from "@/lib/rbac/audit"

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).optional(),
  password: z.string().min(12).max(200).optional(),
  currentPassword: z.string().max(200).optional(),
  role: z.enum(["ADMIN", "PROFESSIONAL"]).optional(),
  isActive: z.boolean().optional(),
})

/**
 * GET /api/users/:id
 * Get a specific user - ADMIN only
 */
export const GET = withFeatureAuth(
  { feature: "users", minAccess: "READ" },
  async (_req, { user }, params) => {
    const targetUser = await prisma.user.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        professionalProfile: {
          select: {
            id: true,
          },
        },
      },
    })

    if (!targetUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    return NextResponse.json({ user: targetUser })
  }
)

/**
 * PATCH /api/users/:id
 * Update a user - ADMIN only
 */
export const PATCH = withFeatureAuth(
  { feature: "users", minAccess: "WRITE" },
  async (req, { user }, params) => {
    const existing = await prisma.user.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    const body = await req.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados invalidos", details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { name, email, password, currentPassword, role, isActive } = parsed.data

    if (role !== undefined && existing.id === user.id && role !== existing.role) {
      return NextResponse.json(
        { error: "Você não pode alterar seu próprio perfil de acesso" },
        { status: 400 }
      )
    }

    if (isActive === false && existing.id === user.id) {
      return NextResponse.json(
        { error: "Você não pode desativar sua própria conta" },
        { status: 400 }
      )
    }

    if (email && email !== existing.email) {
      const existingEmail = await prisma.user.findFirst({
        where: {
          clinicId: user.clinicId,
          email,
          NOT: { id: params.id },
        },
      })

      if (existingEmail) {
        return NextResponse.json(
          { error: "Já existe um usuário com este email" },
          { status: 409 }
        )
      }
    }

    // Password change path: require acting admin to re-enter their own
    // current password. Prevents a stolen admin session from silently
    // resetting every user's password to lock out a clinic.
    if (password !== undefined) {
      const strength = validatePasswordStrength(password)
      if (!strength.ok) {
        return NextResponse.json({ error: strength.reason }, { status: 400 })
      }
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Informe sua senha atual para redefinir senhas de outros usuarios" },
          { status: 400 },
        )
      }
      const actingAdmin = await prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      })
      if (!actingAdmin) {
        return NextResponse.json({ error: "Acao nao autorizada" }, { status: 403 })
      }
      const valid = await verifyPassword(currentPassword, actingAdmin.passwordHash)
      if (!valid) {
        return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (isActive !== undefined) updateData.isActive = isActive
    if (role !== undefined) updateData.role = role
    if (password !== undefined) {
      updateData.passwordHash = await hashPassword(password)
    }

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        professionalProfile: {
          select: {
            id: true,
          },
        },
      },
    })

    // Force session re-check on the target user after any sensitive change.
    if (password !== undefined || role !== undefined || isActive === false) {
      revokeUser(params.id)
    }

    if (password !== undefined && existing.id !== user.id) {
      audit.log({
        user,
        action: AuditAction.USER_PASSWORD_CHANGED,
        entityType: "User",
        entityId: existing.id,
        newValues: { actor: "admin" },
        request: req,
      }).catch(() => {})
    }

    return NextResponse.json({ user: updatedUser })
  }
)

/**
 * DELETE /api/users/:id
 * Soft-delete (deactivate) a user - ADMIN only
 */
export const DELETE = withFeatureAuth(
  { feature: "users", minAccess: "WRITE" },
  async (_req, { user }, params) => {
    const existing = await prisma.user.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    // Prevent self-deactivation
    if (existing.id === user.id) {
      return NextResponse.json(
        { error: "Você não pode desativar sua própria conta" },
        { status: 400 }
      )
    }

    await prisma.user.update({
      where: { id: params.id },
      data: { isActive: false },
    })

    revokeUser(params.id)

    return NextResponse.json({ success: true })
  }
)
