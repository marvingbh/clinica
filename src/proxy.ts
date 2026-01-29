import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

export const { auth: proxy } = NextAuth(authConfig)

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
