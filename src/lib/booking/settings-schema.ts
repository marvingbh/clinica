import { z } from "zod"

/**
 * Zod schema for the ADMIN online-booking settings form (PUT
 * /api/clinic/booking-settings). Pure: numeric ranges and modality membership
 * are validated here; phone normalization happens in the route.
 */
export const bookingSettingsSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["AUTO_CONFIRM", "APPROVAL_REQUIRED"]),
  sessionDurationMinutes: z.number().int().min(10).max(480),
  minAdvanceHours: z.number().int().min(0).max(168),
  horizonDays: z.number().int().min(1).max(90),
  allowedModalities: z
    .array(z.enum(["ONLINE", "PRESENCIAL"]))
    .min(1, "Selecione pelo menos uma modalidade"),
  maxOpenBookingsPerPhone: z.number().int().min(1).max(20),
  blockedPhones: z.array(z.string()).max(1000),
})

export type BookingSettingsInput = z.infer<typeof bookingSettingsSchema>
