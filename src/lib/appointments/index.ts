export {
  checkConflict,
  checkConflictsBulk,
  formatConflictError,
  type ConflictCheckParams,
  type ConflictCheckResult,
  type ConflictingAppointment,
  type BulkConflictCheckParams,
  type BulkConflictResult,
} from "./conflict-check"

export {
  signLink,
  verifyLink,
  buildConfirmUrl,
  buildCancelUrl,
  type LinkAction,
} from "./appointment-links"

export {
  validateRecurrenceOptions,
  calculateRecurrenceDates,
  calculateNextWindowDates,
  formatRecurrenceSummary,
  formatDate,
  isOffWeek,
  type RecurrenceOptions,
  type RecurrenceDate,
} from "./recurrence"

export {
  findPairedRecurrence,
  computeBiweeklyHints,
  computePairedRecurrenceMap,
  buildBlockedAlternateKeys,
  annotateAlternateWeekInfo,
  buildSlotKey,
  formatTimeStr,
  formatDateStr,
  type BiweeklyRecurrence,
  type BiweeklyAppointment,
  type BiweeklyHint,
  type PairedInfo,
  type AlternateWeekInfo,
} from "./biweekly"

export {
  isValidTransition,
  computeStatusUpdateData,
  shouldUpdateLastVisitAt,
  VALID_TRANSITIONS,
  STATUS_LABELS,
  type AppointmentStatusType,
  type StatusUpdateFields,
} from "./status-transitions"
