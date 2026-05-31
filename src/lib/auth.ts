import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcrypt"
import { prisma } from "./prisma"
import { authConfig } from "./auth.config"
import { logAuthEvent, AuditAction } from "./rbac/audit"
import { resolvePermissions } from "./rbac"
import type { Feature } from "./rbac/types"
import { FeatureAccess } from "@prisma/client"
import { checkLockout, recordAttempt, clearAttempts, clientIpFromHeaders } from "./auth-rate-limit"

/**
 * Thrown when an account is temporarily locked out after too many failed logins.
 * The `code` propagates to the client via `signIn`'s result so the login page can
 * show a distinct "too many attempts" message instead of "invalid credentials".
 */
class RateLimitError extends CredentialsSignin {
  code = "rate_limited"
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = credentials.email as string
        const password = credentials.password as string
        const ip = request ? clientIpFromHeaders(request.headers) : "unknown"

        // Persistent brute-force protection: refuse once too many recent failures
        // are on record for this email. Returns a generic failure (no enumeration).
        // We do NOT record an attempt while locked, so the lockout is bounded to
        // the window of the original failures and can't be extended indefinitely.
        const lockout = await checkLockout(email, "LOGIN")
        if (lockout.locked) {
          // Distinct signal so the UI can say "too many attempts" rather than
          // the generic "invalid credentials". Does not reveal whether the
          // account exists (lockout is keyed by the submitted email).
          throw new RateLimitError()
        }

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
          // Record the failure so credential-stuffing against unknown emails is
          // also throttled. No audit log (no clinicId for unknown users).
          await recordAttempt({ identifier: email, kind: "LOGIN", success: false, ipAddress: ip })
          return null
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash)

        if (!isValidPassword) {
          await recordAttempt({ identifier: email, kind: "LOGIN", success: false, ipAddress: ip })
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

        // Successful login — clear the failure counter for this email.
        await clearAttempts(email, "LOGIN")

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
