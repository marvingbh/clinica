import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isReadOnly, type SubscriptionInfo } from "@/lib/subscription"
import { Role, FeatureAccess } from "@prisma/client"
import {
  authorize,
  canPerform,
  getPermissionScope,
  logPermissionDenied,
  meetsMinAccess,
  resolvePermissions,
  type AuthUser,
  type Resource,
  type Action,
  type AuthorizationResult,
  type Feature,
} from "@/lib/rbac"

/**
 * Standard error response for unauthorized access
 */
export function forbiddenResponse(message: string = "Access denied"): NextResponse {
  return NextResponse.json(
    {
      error: "Forbidden",
      message,
      statusCode: 403,
    },
    { status: 403 }
  )
}

/**
 * Standard error response for unauthenticated requests
 */
export function unauthorizedResponse(
  message: string = "Authentication required"
): NextResponse {
  return NextResponse.json(
    {
      error: "Unauthorized",
      message,
      statusCode: 401,
    },
    { status: 401 }
  )
}

/**
 * Check if the clinic's subscription allows mutations.
 * Returns a 403 response if the subscription is read-only, null otherwise.
 */
async function checkSubscriptionAccess(
  clinicId: string,
  method: string
): Promise<NextResponse | null> {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  })

  if (!clinic) return null

  const info: SubscriptionInfo = {
    subscriptionStatus: clinic.subscriptionStatus,
    trialEndsAt: clinic.trialEndsAt,
  }

  if (isReadOnly(info)) {
    return NextResponse.json(
      {
        error: "Subscription required",
        message: "Sua assinatura esta inativa. Assine para realizar esta acao.",
        statusCode: 403,
      },
      { status: 403 }
    )
  }

  return null
}

/**
 * Context provided to authorized route handlers
 */
export interface AuthContext {
  user: AuthUser
  /** The scope of the user's permission for the requested resource/action */
  scope: "own" | "clinic" | "all"
}

/**
 * Options for the withAuth wrapper
 */
export interface WithAuthOptions {
  resource: Resource
  action: Action
  /** Function to extract the resource owner ID from the request (for ownership checks) */
  getResourceOwnerId?: (req: NextRequest, params?: Record<string, string>) => string | undefined
  /** Function to extract the resource clinic ID from the request */
  getResourceClinicId?: (
    req: NextRequest,
    params?: Record<string, string>
  ) => string | undefined
}

type RouteParams = { params: Promise<Record<string, string>> }

type AuthorizedHandler = (
  req: NextRequest,
  context: AuthContext,
  params: Record<string, string>
) => Promise<NextResponse>

/**
 * Higher-order function that wraps an API route handler with authentication
 * and authorization checks.
 *
 * Usage:
 * ```ts
 * export const GET = withAuth(
 *   { resource: "appointment", action: "read" },
 *   async (req, { user, scope }, params) => {
 *     // Handler logic here
 *   }
 * )
 * ```
 */
export function withAuth(
  options: WithAuthOptions,
  handler: AuthorizedHandler
) {
  return async (
    req: NextRequest,
    routeContext?: RouteParams
  ): Promise<NextResponse> => {
    // Get the authenticated session
    const session = await auth()

    if (!session?.user) {
      return unauthorizedResponse()
    }

    const user: AuthUser = {
      id: session.user.id,
      clinicId: session.user.clinicId,
      role: session.user.role as Role,
      professionalProfileId: session.user.professionalProfileId,
      permissions: session.user.permissions ?? resolvePermissions(session.user.role as Role, {}),
    }

    // Resolve params from the route context
    const params = routeContext?.params ? await routeContext.params : {}

    // Check basic permission (can the user's role perform this action?)
    if (!canPerform(user, options.resource, options.action)) {
      await logPermissionDenied(
        user,
        options.resource,
        options.action,
        params.id ?? "unknown",
        `Role ${user.role} cannot ${options.action} ${options.resource}`,
        req
      )
      return forbiddenResponse(
        `You do not have permission to ${options.action} this resource`
      )
    }

    // Get the scope for filtering/ownership checks
    const scope = getPermissionScope(user, options.resource, options.action)!

    const subscriptionBlock = await checkSubscriptionAccess(user.clinicId, req.method)
    if (subscriptionBlock) return subscriptionBlock

    // If ownership check functions are provided, perform full authorization
    if (options.getResourceOwnerId || options.getResourceClinicId) {
      const resourceOwnerId = options.getResourceOwnerId?.(req, params)
      const resourceClinicId = options.getResourceClinicId?.(req, params) ?? user.clinicId

      const authResult: AuthorizationResult = authorize({
        user,
        resource: options.resource,
        action: options.action,
        resourceOwnerId,
        resourceClinicId,
      })

      if (!authResult.allowed) {
        await logPermissionDenied(
          user,
          options.resource,
          options.action,
          params.id ?? resourceOwnerId ?? "unknown",
          authResult.reason ?? "Access denied",
          req
        )
        return forbiddenResponse(authResult.reason ?? "Access denied")
      }
    }

    // Call the actual handler with the auth context
    return handler(req, { user, scope }, params)
  }
}

/**
 * Wrapper that only requires authentication without specific resource permissions.
 * Useful for routes that have custom authorization logic.
 */
export function withAuthentication(
  handler: (
    req: NextRequest,
    user: AuthUser,
    params: Record<string, string>
  ) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    routeContext?: RouteParams
  ): Promise<NextResponse> => {
    const session = await auth()

    if (!session?.user) {
      return unauthorizedResponse()
    }

    const user: AuthUser = {
      id: session.user.id,
      clinicId: session.user.clinicId,
      role: session.user.role as Role,
      professionalProfileId: session.user.professionalProfileId,
      permissions: session.user.permissions ?? resolvePermissions(session.user.role as Role, {}),
    }

    const params = routeContext?.params ? await routeContext.params : {}

    const subscriptionBlock = await checkSubscriptionAccess(user.clinicId, req.method)
    if (subscriptionBlock) return subscriptionBlock

    return handler(req, user, params)
  }
}

/**
 * Options for feature-based auth
 */
export interface FeatureAuthOptions {
  feature: Feature
  minAccess: FeatureAccess
}

/**
 * Context provided to feature-authorized route handlers
 */
export interface FeatureAuthContext {
  user: AuthUser
  /** The resolved access level for the requested feature */
  access: FeatureAccess
}

type FeatureAuthorizedHandler = (
  req: NextRequest,
  context: FeatureAuthContext,
  params: Record<string, string>
) => Promise<NextResponse>

/**
 * Higher-order function that wraps an API route handler with feature-based
 * authentication and authorization checks.
 *
 * Usage:
 * ```ts
 * export const GET = withFeatureAuth(
 *   { feature: "patients", minAccess: "READ" },
 *   async (req, { user, access }, params) => {
 *     // access = user's resolved FeatureAccess for "patients"
 *   }
 * )
 * ```
 */
export function withFeatureAuth(
  options: FeatureAuthOptions,
  handler: FeatureAuthorizedHandler
) {
  return async (
    req: NextRequest,
    routeContext?: RouteParams
  ): Promise<NextResponse> => {
    const session = await auth()

    if (!session?.user) {
      return unauthorizedResponse()
    }

    const user: AuthUser = {
      id: session.user.id,
      clinicId: session.user.clinicId,
      role: session.user.role as Role,
      professionalProfileId: session.user.professionalProfileId,
      permissions: session.user.permissions ?? resolvePermissions(session.user.role as Role, {}),
    }

    const params = routeContext?.params ? await routeContext.params : {}
    const access = user.permissions[options.feature]

    if (!meetsMinAccess(access, options.minAccess)) {
      return forbiddenResponse(
        `Sem permissao para acessar ${options.feature}`
      )
    }

    const subscriptionBlock = await checkSubscriptionAccess(user.clinicId, req.method)
    if (subscriptionBlock) return subscriptionBlock

    return handler(req, { user, access }, params)
  }
}
