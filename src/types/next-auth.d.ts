import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface User {
    id: string
    clinicId: string
    role: string
    professionalProfileId: string | null
    appointmentDuration: number | null
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
  }
}
