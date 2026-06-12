import { z } from "zod"

/** Resolved, always-valid waitlist configuration for a clinic. */
export interface WaitlistSettings {
  mode: "TRIAGEM" | "OFERTA_AUTOMATICA"
  strategy: "SEQUENCIAL" | "BROADCAST"
  /** Exclusivity window in hours for sequential offers. */
  holdHours: number
  /** A slot opening with less than this notice goes to triage only. */
  minNoticeHours: number
}

export const DEFAULT_WAITLIST_SETTINGS: WaitlistSettings = {
  mode: "TRIAGEM",
  strategy: "SEQUENCIAL",
  holdHours: 2,
  minNoticeHours: 3,
}

/**
 * Zod schema accepting a partial config; every field is optional so a partial
 * JSON merges with the defaults. Invalid individual values are coerced via
 * catch() to their default.
 */
export const waitlistSettingsSchema = z.object({
  mode: z
    .enum(["TRIAGEM", "OFERTA_AUTOMATICA"])
    .catch(DEFAULT_WAITLIST_SETTINGS.mode)
    .default(DEFAULT_WAITLIST_SETTINGS.mode),
  strategy: z
    .enum(["SEQUENCIAL", "BROADCAST"])
    .catch(DEFAULT_WAITLIST_SETTINGS.strategy)
    .default(DEFAULT_WAITLIST_SETTINGS.strategy),
  holdHours: z
    .number()
    .int()
    .min(1)
    .max(72)
    .catch(DEFAULT_WAITLIST_SETTINGS.holdHours)
    .default(DEFAULT_WAITLIST_SETTINGS.holdHours),
  minNoticeHours: z
    .number()
    .int()
    .min(0)
    .max(168)
    .catch(DEFAULT_WAITLIST_SETTINGS.minNoticeHours)
    .default(DEFAULT_WAITLIST_SETTINGS.minNoticeHours),
})

/**
 * Resolves the stored `Clinic.waitlistSettings` Json into a complete
 * {@link WaitlistSettings}. Never throws; unknown/invalid input yields the
 * safe defaults. ALWAYS read settings through this resolver — never cast.
 */
export function resolveWaitlistSettings(json: unknown): WaitlistSettings {
  if (json == null || typeof json !== "object") {
    return { ...DEFAULT_WAITLIST_SETTINGS }
  }
  const result = waitlistSettingsSchema.safeParse(json)
  if (!result.success) return { ...DEFAULT_WAITLIST_SETTINGS }
  return result.data
}
