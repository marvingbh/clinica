import { Role, FeatureAccess } from "@prisma/client"

// All controllable features in the system
export const FEATURES = [
  "agenda_own",
  "agenda_others",
  "patients",
  "groups",
  "users",
  "clinic_settings",
  "professionals",
  "notifications",
  "audit_logs",
  "availability_own",
  "availability_others",
  "finances",
] as const

export type Feature = (typeof FEATURES)[number]

// Human-readable labels for the admin UI
export const FEATURE_LABELS: Record<Feature, string> = {
  agenda_own: "Agenda (propria)",
  agenda_others: "Agenda (outros)",
  patients: "Pacientes",
  groups: "Grupos",
  users: "Usuarios",
  clinic_settings: "Config. Clinica",
  professionals: "Profissionais",
  notifications: "Notificacoes",
  audit_logs: "Logs de Auditoria",
  availability_own: "Disponibilidade (propria)",
  availability_others: "Disponibilidade (outros)",
  finances: "Financeiro",
}

export type ResolvedPermissions = Record<Feature, FeatureAccess>

export interface AuthUser {
  id: string
  clinicId: string
  role: Role
  professionalProfileId: string | null
  permissions: ResolvedPermissions
}

// Legacy types kept for backward compat during migration
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
  | "invoice"

export type Action = "create" | "read" | "update" | "delete" | "list"

export interface Permission {
  resource: Resource
  action: Action
  scope: "own" | "clinic" | "all"
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
