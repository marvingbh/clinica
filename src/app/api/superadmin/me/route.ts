import { NextResponse } from "next/server"
import { withSuperAdmin } from "@/lib/api"

export const GET = withSuperAdmin(async (_req, admin) => {
  return NextResponse.json({ admin })
})
