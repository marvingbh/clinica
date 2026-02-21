import { NextRequest, NextResponse } from "next/server"
import { getSuperAdminSession, type SuperAdminSession } from "@/lib/superadmin-auth"

type SuperAdminHandler = (
  req: NextRequest,
  admin: SuperAdminSession,
  params: Record<string, string>
) => Promise<NextResponse>

type RouteParams = { params: Promise<Record<string, string>> }

export function withSuperAdmin(handler: SuperAdminHandler) {
  return async (req: NextRequest, routeContext?: RouteParams): Promise<NextResponse> => {
    const session = await getSuperAdminSession()

    if (!session) {
      return NextResponse.json(
        { error: "Super admin authentication required" },
        { status: 401 }
      )
    }

    const params = routeContext?.params ? await routeContext.params : {}

    return handler(req, session, params)
  }
}
