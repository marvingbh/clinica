// Types
export type {
  SyncSnapshot,
  IntegrationPrefs,
  GoogleEventBody,
  BusyInterval,
  CalendarClient,
  AppointmentType,
  AppointmentStatus,
  CalendarPrivacyMode,
} from "./types"
export { CalendarAuthError, CalendarRateLimitError, CalendarNotFoundError } from "./types"

// Privacy
export { firstNameOnly, buildEventTitle } from "./privacy"

// Event mapping
export { isSyncableType, buildGoogleEventBody, computeSyncHash } from "./event-mapping"

// Planner
export { planSyncAction } from "./sync-planner"
export type { SyncAction } from "./sync-planner"

// OAuth
export {
  signOAuthState,
  verifyOAuthState,
  buildGoogleAuthUrl,
  GOOGLE_CALENDAR_EVENTS_SCOPE,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from "./oauth"
export type { VerifiedState, AuthUrlOptions } from "./oauth"

// ICS
export { buildIcsFeed, escapeIcsText, foldIcsLine, formatIcsDateLocal, icsUid } from "./ics"
export type { IcsEvent, BuildIcsOptions } from "./ics"

// Feed builder (ICS)
export { buildAppointmentsIcsFeed } from "./feed-builder"
export type { FeedAppointment } from "./feed-builder"

// Busy blocks (phase 2)
export { mergeBusyIntervals, clampToHorizon, overlapsBusy } from "./busy-blocks"

// Queue + processor
export { enqueueCalendarSync, flushCalendarSyncAfterResponse } from "./queue"
export type { EnqueueParams } from "./queue"
export { processCalendarSyncJobs } from "./processor"
export type { ProcessResult } from "./processor"

// Providers
export { GoogleCalendarClient } from "./providers/google-calendar-client"
export { GoogleCalendarMockClient } from "./providers/google-calendar-mock"
export { buildCalendarClient, isGoogleProviderEnabled } from "./providers/client-factory"
