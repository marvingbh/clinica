import { z } from "zod"
import { DOCUMENT_TYPES } from "@/lib/documents"

export const generationBodySchema = z.object({
  templateType: z.enum(DOCUMENT_TYPES as [string, ...string[]]),
  templateId: z.string().optional().nullable(),
  patientId: z.string().min(1),
  appointmentId: z.string().optional().nullable(),
  invoiceItemIds: z.array(z.string()).optional(),
  professionalProfileId: z.string().optional().nullable(),
  manualFields: z.record(z.string(), z.string()).optional(),
})

export type GenerationBody = z.infer<typeof generationBodySchema>
