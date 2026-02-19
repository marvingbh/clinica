import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { hashPassword } from "@/lib/password"

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

    const body = await req.json()
    const { name, email, password, role, isActive } = body

    // Prevent changing own role
    if (role !== undefined && existing.id === user.id && role !== existing.role) {
      return NextResponse.json(
        { error: "Você não pode alterar seu próprio perfil de acesso" },
        { status: 400 }
      )
    }

    // Prevent deactivating yourself
    if (isActive === false && existing.id === user.id) {
      return NextResponse.json(
        { error: "Você não pode desativar sua própria conta" },
        { status: 400 }
      )
    }

    // Check for duplicate email if changing
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

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (isActive !== undefined) updateData.isActive = isActive
    if (role !== undefined && (role === "ADMIN" || role === "PROFESSIONAL")) {
      updateData.role = role
    }
    if (password !== undefined && password.length > 0) {
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

    return NextResponse.json({ success: true })
  }
)
