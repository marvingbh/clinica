/**
 * Per-request fresh-from-DB user resolver with pending-promise dedup + cache.
 *
 * Shared by `withAuth`, `withFeatureAuth`, `withAuthentication`. A JWT's
 * `isActive`/`role` claim is only as fresh as the last login. For security
 * revocation to be meaningful we need to re-check the DB on every authenticated
 * request — but to avoid a per-request DB hit we cache per userId for 5s (admin)
 * or 30s (professional), with a pending-promise coalescing stampede coalescing.
 *
 * Also maintains a per-process revocation set: users deactivated in the last
 * 60s, so admin deactivation takes effect in <1s on hot paths regardless of
 * the cache TTL.
 */

import { Role } from "@prisma/client"
import { prisma } from "../prisma"
import { resolvePermissions } from "../rbac"
import type { AuthUser, Feature } from "../rbac/types"
import { FeatureAccess } from "@prisma/client"

interface FreshUserState {
  id: string
  isActive: boolean
  role: Role
  clinicId: string
  professionalProfileId: string | null
  appointmentDuration: number | null
  overrides: Partial<Record<Feature, FeatureAccess>>
}

interface CacheEntry {
  at: number
  row: FreshUserState | null
  pending?: Promise<FreshUserState | null>
}

const CACHE_MAX_ENTRIES = 10_000
const cache = new Map<string, CacheEntry>()

const REVOKED_TTL_MS = 60_000
const revokedUntil = new Map<string, number>()

function ttlFor(role: Role | undefined): number {
  return role === Role.ADMIN ? 5_000 : 30_000
}

async function fetchFresh(userId: string): Promise<FreshUserState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      role: true,
      clinicId: true,
      professionalProfile: { select: { id: true, appointmentDuration: true } },
      permissions: { select: { feature: true, access: true } },
    },
  })
  if (!user) return null
  const overrides: Partial<Record<Feature, FeatureAccess>> = {}
  for (const p of user.permissions) {
    overrides[p.feature as Feature] = p.access
  }
  return {
    id: user.id,
    isActive: user.isActive,
    role: user.role,
    clinicId: user.clinicId,
    professionalProfileId: user.professionalProfile?.id ?? null,
    appointmentDuration: user.professionalProfile?.appointmentDuration ?? null,
    overrides,
  }
}

async function getFresh(userId: string, hintRole?: Role): Promise<FreshUserState | null> {
  // Recently revoked — short-circuit to null without a DB hit.
  const revokedAt = revokedUntil.get(userId)
  if (revokedAt && Date.now() < revokedAt) return null

  const entry = cache.get(userId)
  const now = Date.now()
  const ttl = ttlFor(hintRole)

  if (entry && now - entry.at < ttl) return entry.row
  if (entry?.pending) return entry.pending

  const pending = fetchFresh(userId)
  cache.set(userId, { at: now, row: entry?.row ?? null, pending })

  try {
    const row = await pending
    cache.set(userId, { at: now, row })
    if (cache.size > CACHE_MAX_ENTRIES) {
      const toDelete = cache.size - CACHE_MAX_ENTRIES
      let i = 0
      for (const key of cache.keys()) {
        if (i++ >= toDelete) break
        cache.delete(key)
      }
    }
    return row
  } catch (err) {
    cache.delete(userId)
    throw err
  }
}

/** Public: mark a user as revoked so the next auth check 401's regardless of cache. */
export function revokeUser(userId: string) {
  revokedUntil.set(userId, Date.now() + REVOKED_TTL_MS)
  cache.delete(userId)
}

/** Test helper — clear caches between tests. */
export function __resetAuthUserCache() {
  cache.clear()
  revokedUntil.clear()
}

export interface ResolveResult {
  user: AuthUser
  subscriptionStatus: string | null
}

/**
 * Given the NextAuth session payload, verify the underlying user is still
 * active and return an up-to-date AuthUser. Returns null when the user has
 * been deactivated or removed.
 */
export async function resolveAuthUser(session: {
  user: {
    id: string
    clinicId: string
    role: string
    professionalProfileId: string | null
    appointmentDuration?: number | null
    permissions?: Record<string, FeatureAccess>
    subscriptionStatus?: string
  }
}): Promise<ResolveResult | null> {
  const hintRole = session.user.role as Role
  const fresh = await getFresh(session.user.id, hintRole)
  if (!fresh || !fresh.isActive) return null

  const user: AuthUser = {
    id: fresh.id,
    clinicId: fresh.clinicId,
    role: fresh.role,
    professionalProfileId: fresh.professionalProfileId,
    permissions: resolvePermissions(fresh.role, fresh.overrides),
  }

  return {
    user,
    subscriptionStatus: session.user.subscriptionStatus ?? null,
  }
}
