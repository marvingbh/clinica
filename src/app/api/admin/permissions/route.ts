import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth, forbiddenResponse } from "@/lib/api"
import { FEATURES, FEATURE_LABELS, type Feature } from "@/lib/rbac/types"
import { ROLE_DEFAULTS, resolvePermissions } from "@/lib/rbac/permissions"
import { FeatureAccess } from "@prisma/client"

/**
 * GET /api/admin/permissions
 * Returns all users with their resolved permissions, overrides, and metadata
 * needed by the admin permissions management UI.
 */
export const GET = withFeatureAuth(
  { feature: "users", minAccess: "WRITE" },
  async (req, { user }) => {
    // Fetch all active users in the clinic
    const users = await prisma.user.findMany({
      where: { clinicId: user.clinicId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
    })

    // Fetch all permission overrides for the clinic
    const allOverrides = await prisma.userPermission.findMany({
      where: { clinicId: user.clinicId },
    })

    // Group overrides by userId
    const overridesByUser = new Map<string, Record<string, FeatureAccess>>()
    for (const override of allOverrides) {
      if (!overridesByUser.has(override.userId)) {
        overridesByUser.set(override.userId, {})
      }
      overridesByUser.get(override.userId)![override.feature] = override.access
    }

    // Build response with resolved permissions and overrides for each user
    const usersWithPermissions = users.map((u) => {
      const userOverrides = overridesByUser.get(u.id) ?? {}
      const resolvedPermissions = resolvePermissions(
        u.role,
        userOverrides as Partial<Record<Feature, FeatureAccess>>
      )

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        resolvedPermissions,
        overrides: userOverrides,
      }
    })

    return NextResponse.json({
      users: usersWithPermissions,
      features: FEATURES,
      featureLabels: FEATURE_LABELS,
      roleDefaults: ROLE_DEFAULTS,
    })
  }
)

// Zod schema for PUT request body
const updatePermissionSchema = z.object({
  userId: z.string().min(1, "userId e obrigatorio"),
  feature: z.string().min(1, "feature e obrigatoria"),
  access: z.enum(["NONE", "READ", "WRITE"]).nullable(),
})

/**
 * PUT /api/admin/permissions
 * Updates a single permission override for a user.
 * If access is null, the override is removed (reverts to role default).
 */
export const PUT = withFeatureAuth(
  { feature: "users", minAccess: "WRITE" },
  async (req, { user }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Corpo da requisicao invalido" },
        { status: 400 }
      )
    }

    const parsed = updatePermissionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados invalidos",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { userId, feature, access } = parsed.data

    // Validate feature is a known feature
    if (!FEATURES.includes(feature as Feature)) {
      return NextResponse.json(
        { error: `Feature desconhecida: ${feature}` },
        { status: 400 }
      )
    }

    // Validate target user belongs to the same clinic
    const targetUser = await prisma.user.findFirst({
      where: { id: userId, clinicId: user.clinicId },
      select: { id: true, role: true },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "Usuario nao encontrado nesta clinica" },
        { status: 404 }
      )
    }

    // Safety check: prevent users from removing their own users:WRITE permission
    if (
      userId === user.id &&
      feature === "users" &&
      access !== "WRITE"
    ) {
      return forbiddenResponse(
        "Voce nao pode remover sua propria permissao de gerenciar usuarios"
      )
    }

    if (access === null) {
      // Remove the override (revert to role default)
      await prisma.userPermission.deleteMany({
        where: {
          userId,
          feature,
          clinicId: user.clinicId,
        },
      })
    } else {
      // Upsert the override
      await prisma.userPermission.upsert({
        where: {
          userId_feature: { userId, feature },
        },
        update: {
          access: access as FeatureAccess,
        },
        create: {
          userId,
          clinicId: user.clinicId,
          feature,
          access: access as FeatureAccess,
        },
      })
    }

    // Fetch the updated overrides for this user and return resolved permissions
    const updatedOverrides = await prisma.userPermission.findMany({
      where: { userId, clinicId: user.clinicId },
    })

    const overridesMap: Partial<Record<Feature, FeatureAccess>> = {}
    for (const o of updatedOverrides) {
      overridesMap[o.feature as Feature] = o.access
    }

    const resolvedPermissions = resolvePermissions(targetUser.role, overridesMap)

    return NextResponse.json({
      userId,
      resolvedPermissions,
      overrides: overridesMap,
    })
  }
)
