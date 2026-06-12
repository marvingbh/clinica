import { z } from "zod"
import type { WaitlistPreferences } from "./types"

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Zod schema for waitlist preferences. All fields optional/default so a
 * partial or empty object parses cleanly into "accepts anything".
 */
export const waitlistPreferencesSchema = z.object({
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .default([]),
  timeRanges: z
    .array(
      z.object({
        start: z.string().regex(timeRegex),
        end: z.string().regex(timeRegex),
      })
    )
    .default([]),
  modality: z.enum(["ONLINE", "PRESENCIAL"]).nullable().default(null),
})

const EMPTY_PREFERENCES: WaitlistPreferences = {
  weekdays: [],
  timeRanges: [],
  modality: null,
}

/**
 * Safely parses a stored JSON value into {@link WaitlistPreferences}.
 * Any invalid/missing input falls back to "accepts anything" so a malformed
 * row never breaks matching. De-duplicates weekdays and drops empty/inverted
 * time ranges.
 */
export function parsePreferences(json: unknown): WaitlistPreferences {
  const result = waitlistPreferencesSchema.safeParse(json)
  if (!result.success) return { ...EMPTY_PREFERENCES }

  const { weekdays, timeRanges, modality } = result.data
  return {
    weekdays: Array.from(new Set(weekdays)).sort((a, b) => a - b),
    timeRanges: timeRanges.filter((r) => r.start < r.end),
    modality,
  }
}
