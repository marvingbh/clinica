import type { NextAuthConfig } from "next-auth"

/**
 * Edge-compatible auth configuration.
 * This config doesn't include the Credentials provider authorize function
 * because it uses Prisma which isn't Edge-compatible.
 * It only includes the JWT/session callbacks and pages configuration.
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isHomePage = nextUrl.pathname === "/"
      const isLoginPage = nextUrl.pathname === "/login"
      const isSignupPage = nextUrl.pathname === "/signup"
      const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth")
      const isPublicApiRoute = nextUrl.pathname.startsWith("/api/public")
      const isWebhookRoute = nextUrl.pathname.startsWith("/api/webhooks")
      const isConfirmPage = nextUrl.pathname === "/confirm"
      const isCancelPage = nextUrl.pathname === "/cancel"
      const isSuperAdminRoute = nextUrl.pathname.startsWith("/superadmin") ||
        nextUrl.pathname.startsWith("/api/superadmin")
      const isPublicRoute =
        isHomePage || isLoginPage || isSignupPage || isApiAuthRoute || isPublicApiRoute ||
        isWebhookRoute || isConfirmPage || isCancelPage || isSuperAdminRoute

      if (isPublicRoute) {
        if (isLoggedIn && isLoginPage) {
          return Response.redirect(new URL("/", nextUrl.origin))
        }
        return true
      }

      if (!isLoggedIn) {
        return false
      }

      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.clinicId = user.clinicId
        token.role = user.role
        token.professionalProfileId = user.professionalProfileId
        token.appointmentDuration = user.appointmentDuration
        token.permissions = user.permissions
        token.subscriptionStatus = user.subscriptionStatus
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.clinicId = token.clinicId as string
        session.user.role = token.role as string
        session.user.professionalProfileId = token.professionalProfileId as string | null
        session.user.appointmentDuration = token.appointmentDuration as number | null
        session.user.permissions = token.permissions
        session.user.subscriptionStatus = token.subscriptionStatus as string
      }
      return session
    },
  },
}
