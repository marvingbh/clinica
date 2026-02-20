"use client"

import { z } from "zod"

export const groupSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  professionalProfileId: z.string().min(1, "Selecione um profissional"),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Horário inválido"),
  duration: z.number().int().min(15).max(480),
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
})

export type GroupFormData = z.infer<typeof groupSchema>

export interface Professional {
  id: string
  name: string
  professionalProfile: {
    id: string
    specialty: string | null
  } | null
}

export interface AdditionalProfessionalRef {
  professionalProfile: {
    id: string
    user: { name: string }
  }
}

export interface TherapyGroup {
  id: string
  name: string
  dayOfWeek: number
  startTime: string
  duration: number
  recurrenceType: string
  isActive: boolean
  createdAt: string
  activeMemberCount?: number
  professionalProfile: {
    id: string
    user: {
      name: string
    }
  }
  additionalProfessionals?: AdditionalProfessionalRef[]
}

export interface GroupDetails extends TherapyGroup {
  memberships: Array<{
    id: string
    joinDate: string
    leaveDate: string | null
    patient: {
      id: string
      name: string
      phone: string
    }
  }>
}

export interface GroupSessionItem {
  groupId: string
  groupName: string
  scheduledAt: string
  endAt: string
  professionalProfileId: string
  professionalName: string
  additionalProfessionals?: Array<{
    professionalProfileId: string
    professionalName: string
  }>
  participants: Array<{
    appointmentId: string
    patientId: string
    patientName: string
    status: string
  }>
}

export type ViewTab = "members" | "sessions"
