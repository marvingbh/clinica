import { z } from "zod"
import { waitlistPreferencesSchema } from "./preferences"

/** Body for POST /api/waitlist (create entry). */
export const createEntrySchema = z
  .object({
    patientId: z.string().min(1).optional(),
    leadName: z.string().trim().min(1).optional(),
    leadPhone: z.string().trim().min(1).optional(),
    leadEmail: z.string().trim().email().optional(),
    professionalProfileId: z.string().min(1).nullable().optional(),
    preferences: waitlistPreferencesSchema.optional(),
    priorityNote: z.string().trim().max(500).optional(),
  })
  .refine(
    (data) => {
      // XOR: either an existing patient OR a lead (name required).
      const hasPatient = !!data.patientId
      const hasLead = !!data.leadName
      return hasPatient !== hasLead
    },
    { message: "Informe um paciente existente OU os dados de um lead (nome)." }
  )
  .refine((data) => data.patientId || (data.leadName && data.leadPhone), {
    message: "Lead exige nome e telefone.",
  })

export type CreateEntryInput = z.infer<typeof createEntrySchema>

/** Body for PATCH /api/waitlist/[id] (edit or archive). */
export const updateEntrySchema = z.object({
  professionalProfileId: z.string().min(1).nullable().optional(),
  preferences: waitlistPreferencesSchema.optional(),
  priorityNote: z.string().trim().max(500).nullable().optional(),
  status: z.literal("REMOVIDA").optional(),
  removedReason: z.string().trim().min(1).max(500).optional(),
})

export type UpdateEntryInput = z.infer<typeof updateEntrySchema>

/** Body for POST /api/waitlist/reorder. */
export const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
})

/** Body for POST /api/waitlist/[id]/offer (manual offer). */
export const manualOfferSchema = z.object({
  slotStart: z.string().datetime(),
  slotEnd: z.string().datetime(),
  professionalProfileId: z.string().min(1),
  modality: z.enum(["ONLINE", "PRESENCIAL"]).nullable().optional(),
})
