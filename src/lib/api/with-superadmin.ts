import { NextRequest, NextResponse } from "next/server"
import { getSuperAdminSession, type SuperAdminSession } from "@/lib/superadmin-auth"

type SuperAdminHandler = (
  req: NextRequest,
  admin: SuperAdminSession,
  params: Record<string, string>
) => Promise<NextResponse>

type RouteParams = { params: Promise<Record<string, string>> }

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * Reject cross-site state-changing requests (CSRF defense-in-depth on top of the
 * SameSite=Lax cookie). Browsers always send an Origin header on POST/PATCH/PUT/
 * DELETE; if it is present and does not match the host, reject. Absent Origin on a
 * mutation is not a browser CSRF vector, so it is allowed.
 */
function isCrossSiteMutation(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false
  const origin = req.headers.get("origin")
  if (!origin) return false
  try {
    return new URL(origin).host !== req.headers.get("host")
  } catch {
    return true
  }
}

export function withSuperAdmin(handler: SuperAdminHandler) {
  return async (req: NextRequest, routeContext?: RouteParams): Promise<NextResponse> => {
    const session = await getSuperAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: "Super admin authentication required" },
        { status: 401 }
      )
    }

    if (isCrossSiteMutation(req)) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 })
    }

    const params = routeContext?.params ? await routeContext.params : {}

    return handler(req, session, params)
  }
}
