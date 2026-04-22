import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcrypt"
import { prisma } from "./prisma"
import { authConfig } from "./auth.config"
import { logAuthEvent, AuditAction } from "./rbac/audit"
import { resolvePermissions } from "./rbac"
import type { Feature } from "./rbac/types"
import { FeatureAccess } from "@prisma/client"
import { checkRateLimit, RATE_LIMIT_CONFIGS, RateLimitUnavailableError } from "./rate-limit"
import { createHash } from "crypto"

// Precomputed at module load at the same cost factor as real hashes (12).
// Equalises "user not found" timing vs "user found + wrong password", closing
// the email-enumeration oracle. Never matches any real password.
const DUMMY_HASH = "$2b$12$DummyHashForTimingParityNeverMatchesAnyPasswordAtAllXYZ"

function hashEmailForLogs(email: string): string {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16)
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        clinicSlug: { label: "Clinic slug", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = (credentials.email as string).toLowerCase().trim()
        const password = credentials.password as string
        const clinicSlug = credentials.clinicSlug
          ? (credentials.clinicSlug as string).toLowerCase().trim()
          : null

        // Rate limit per IP+email (blocks single-IP spray AND distributed stuffing on one account)
        const ip =
          request?.headers?.get?.("x-forwarded-for")?.split(",")[0]?.trim() ||
          request?.headers?.get?.("x-real-ip") ||
          "unknown"
        try {
          const rl = await checkRateLimit(`login:${ip}:${email}`, RATE_LIMIT_CONFIGS.login)
          if (!rl.allowed) {
            return null
          }
        } catch (err) {
          if (err instanceof RateLimitUnavailableError) {
            // fail-closed: refuse login if the limiter is unavailable
            return null
          }
          throw err
        }

        // Clinic-scoped lookup when slug is provided (B3). Falls back to
        // email-only `findFirst` during the frontend migration window — the
        // fallback will be removed once every client ships the slug field.
        let user: Awaited<ReturnType<typeof findUserForLogin>> = null
        if (clinicSlug) {
          const clinic = await prisma.clinic.findUnique({
            where: { slug: clinicSlug },
            select: { id: true },
          })
          if (clinic) {
            user = await findUserForLogin({ clinicId: clinic.id, email })
          }
        } else {
          user = await findUserForLogin({ email })
        }

        // Always bcrypt-compare against SOMETHING — equalises timing.
        const isValidPassword = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)

        if (!user || !isValidPassword || !user.isActive) {
          if (user) {
            await logAuthEvent({
              clinicId: user.clinicId,
              userId: user.id,
              action: AuditAction.LOGIN_FAILED,
              metadata: { reason: "invalid_credentials", emailHash: hashEmailForLogs(email) },
            }).catch(() => {})
          }
          return null
        }

        await logAuthEvent({
          clinicId: user.clinicId,
          userId: user.id,
          action: AuditAction.LOGIN_SUCCESS,
        }).catch(() => {})

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

async function findUserForLogin(where: { clinicId?: string; email: string }) {
  return prisma.user.findFirst({
    where: where.clinicId
      ? { clinicId: where.clinicId, email: where.email }
      : { email: where.email },
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
}
