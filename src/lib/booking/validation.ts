import { z } from "zod"
import { isValidPhone, PHONE_ERROR_MESSAGE } from "@/lib/phone"

/**
 * Zod schema for the public self-booking submission.
 *
 * `website` is a honeypot field: legitimate humans never see it (hidden via
 * CSS), so a non-empty value flags a bot — the caller responds with a generic
 * success and persists nothing.
 */
export const publicBookingSchema = z.object({
  professionalSlug: z.string().min(1),
  start: z.string().datetime(), // ISO UTC of the chosen slot
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  name: z
    .string()
    .trim()
    .min(3, "Informe seu nome completo")
    .max(120, "Nome muito longo"),
  phone: z.string().refine(isValidPhone, PHONE_ERROR_MESSAGE),
  email: z.string().email("E-mail inválido"),
  cpf: z.string().optional(),
  consent: z.literal(true, {
    message: "É necessário aceitar o termo de consentimento",
  }),
  website: z.string().max(0).optional(), // honeypot
})

export type PublicBookingInput = z.infer<typeof publicBookingSchema>

/**
 * True when `start` is within the bookable window:
 *   now + minAdvanceHours  ≤  start  ≤  now + horizonDays
 * (boundaries inclusive).
 */
export function isWithinBookingWindow(
  start: Date,
  now: Date,
  minAdvanceHours: number,
  horizonDays: number
): boolean {
  const startMs = start.getTime()
  const earliest = now.getTime() + minAdvanceHours * 60 * 60 * 1000
  const latest = now.getTime() + horizonDays * 24 * 60 * 60 * 1000
  return startMs >= earliest && startMs <= latest
}
