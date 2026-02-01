import { Role } from "@prisma/client/client"

export type Resource =
  | "appointment"
  | "patient"
  | "user"
  | "clinic"
  | "professional-profile"
  | "availability-rule"
  | "availability-exception"
  | "audit-log"
  | "notification"
  | "notification-template"
  | "therapy-group"

export type Action = "create" | "read" | "update" | "delete" | "list"

export interface Permission {
  resource: Resource
  action: Action
  scope: "own" | "clinic" | "all"
}

export interface AuthUser {
  id: string
  clinicId: string
  role: Role
  professionalProfileId: string | null
}

export interface AuthorizationContext {
  user: AuthUser
  resource: Resource
  action: Action
  resourceOwnerId?: string
  resourceClinicId?: string
}

export interface AuthorizationResult {
  allowed: boolean
  reason?: string
}
