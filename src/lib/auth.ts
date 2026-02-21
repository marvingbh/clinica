import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcrypt"
import { prisma } from "./prisma"
import { authConfig } from "./auth.config"
import { logAuthEvent, AuditAction } from "./rbac/audit"
import { resolvePermissions } from "./rbac"
import type { Feature } from "./rbac/types"
import { FeatureAccess } from "@prisma/client"

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = credentials.email as string
        const password = credentials.password as string

        const user = await prisma.user.findFirst({
          where: {
            email: email,
            isActive: true,
          },
          include: {
            professionalProfile: {
              select: {
                id: true,
                appointmentDuration: true,
              },
            },
            clinic: {
              select: {
                subscriptionStatus: true,
              },
            },
          },
        })

        if (!user) {
          // Log failed login attempt (user not found)
          // We can't log without a clinicId, so we skip audit for unknown users
          return null
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash)

        if (!isValidPassword) {
          // Log failed login attempt (wrong password)
          await logAuthEvent({
            clinicId: user.clinicId,
            userId: user.id,
            action: AuditAction.LOGIN_FAILED,
            email,
            metadata: { reason: "invalid_password" },
          }).catch(() => {
            // Silently ignore audit errors to not affect login flow
          })
          return null
        }

        // Log successful login
        await logAuthEvent({
          clinicId: user.clinicId,
          userId: user.id,
          action: AuditAction.LOGIN_SUCCESS,
          email,
        }).catch(() => {
          // Silently ignore audit errors to not affect login flow
        })

        // Load per-user permission overrides
        const userPermissions = await prisma.userPermission.findMany({
          where: { userId: user.id },
          select: { feature: true, access: true },
        })
        const overrides: Partial<Record<Feature, FeatureAccess>> = {}
        for (const p of userPermissions) {
          overrides[p.feature as Feature] = p.access
        }
        const permissions = resolvePermissions(user.role, overrides)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          clinicId: user.clinicId,
          role: user.role,
          professionalProfileId: user.professionalProfile?.id ?? null,
          appointmentDuration: user.professionalProfile?.appointmentDuration ?? null,
          subscriptionStatus: user.clinic.subscriptionStatus,
          permissions,
        }
      },
    }),
  ],
})
