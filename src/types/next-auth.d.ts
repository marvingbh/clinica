import "next-auth"
import "next-auth/jwt"
import type { ResolvedPermissions } from "@/lib/rbac/types"

declare module "next-auth" {
  interface User {
    id: string
    clinicId: string
    role: string
    professionalProfileId: string | null
    appointmentDuration: number | null
    permissions: ResolvedPermissions
  }

  interface Session {
    user: {
      id: string
      email: string
      name: string
      clinicId: string
      role: string
      professionalProfileId: string | null
      appointmentDuration: number | null
      permissions: ResolvedPermissions
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    clinicId: string
    role: string
    professionalProfileId: string | null
    appointmentDuration: number | null
    permissions: ResolvedPermissions
  }
}
