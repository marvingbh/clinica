import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAuth, forbiddenResponse } from "@/lib/api"
import { hashPassword } from "@/lib/password"
import { Role } from "@prisma/client"

/**
 * GET /api/users
 * List all users - ADMIN only
 */
export const GET = withAuth(
  { resource: "user", action: "list" },
  async (req, { user, scope }) => {
    if (scope !== "clinic") {
      return forbiddenResponse("Only administrators can list users")
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search")
    const role = searchParams.get("role")
    const isActive = searchParams.get("isActive")

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ]
    }

    if (role === "ADMIN" || role === "PROFESSIONAL") {
      where.role = role
    }

    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === "true"
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
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

    return NextResponse.json({ users })
  }
)

/**
 * POST /api/users
 * Create a new user (without ProfessionalProfile) - ADMIN only
 */
export const POST = withAuth(
  { resource: "user", action: "create" },
  async (req, { user, scope }) => {
    if (scope !== "clinic") {
      return forbiddenResponse("Only administrators can create users")
    }

    const body = await req.json()
    const { name, email, password, role } = body

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nome, email e senha são obrigatórios" },
        { status: 400 }
      )
    }

    // Validate role
    if (role && role !== "ADMIN" && role !== "PROFESSIONAL") {
      return NextResponse.json(
        { error: "Perfil inválido" },
        { status: 400 }
      )
    }

    // Check for duplicate email within clinic
    const existingEmail = await prisma.user.findUnique({
      where: {
        clinicId_email: {
          clinicId: user.clinicId,
          email,
        },
      },
    })

    if (existingEmail) {
      return NextResponse.json(
        { error: "Já existe um usuário com este email" },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(password)

    const newUser = await prisma.user.create({
      data: {
        clinicId: user.clinicId,
        name,
        email,
        passwordHash,
        role: role === "ADMIN" ? Role.ADMIN : Role.PROFESSIONAL,
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

    return NextResponse.json({ user: newUser }, { status: 201 })
  }
)
