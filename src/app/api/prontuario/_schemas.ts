import { z } from "zod"

const noteTypeEnum = z.enum(["EVOLUCAO", "AVALIACAO", "ENCERRAMENTO", "OUTRO"])
const formatEnum = z.enum(["SOAP", "DAP", "LIVRE"])

/** ISO 8601 datetime string. */
const isoDateTime = z.string().datetime()

export const createNoteSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).nullish(),
  noteType: noteTypeEnum.optional(),
  format: formatEnum.optional(),
  templateId: z.string().min(1).nullish(),
  sessionDate: isoDateTime.optional(),
})
export type CreateNoteInput = z.infer<typeof createNoteSchema>

export const updateNoteSchema = z.object({
  sections: z.record(z.string(), z.string()).optional(),
  noteType: noteTypeEnum.optional(),
  format: formatEnum.optional(),
  templateId: z.string().min(1).nullish(),
  sessionDate: isoDateTime.optional(),
  updatedAt: isoDateTime,
})
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>

export const addendumSchema = z.object({
  content: z.string().min(1).max(10_000),
})

export const bulkNotesSchema = z.object({
  appointmentIds: z.array(z.string().min(1)).min(1).max(30),
})

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(60),
  format: formatEnum,
  sectionDefs: z.array(z.unknown()),
})

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
})

export const recordActionSchema = z.object({
  action: z.enum(["close", "reopen"]),
})
