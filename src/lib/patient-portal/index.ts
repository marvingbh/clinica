export { normalizeIdentifier, type PortalIdentifier, type PortalIdentifierKind } from "./identifier"
export {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  isOtpUsable,
  otpExpiry,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_WINDOW,
  OTP_REQUEST_WINDOW_MINUTES,
  type OtpUnusableReason,
  type OtpUsability,
} from "./otp"
export {
  generateSessionToken,
  hashSessionToken,
  portalCookieName,
  initialSessionExpiry,
  agendaSessionExpiry,
  isSessionValid,
  slideSession,
  SESSION_SLIDE_DAYS,
  SESSION_ABSOLUTE_DAYS,
  SESSION_AGENDA_HOURS,
  SESSION_TOUCH_INTERVAL_MS,
  type SessionExpiry,
  type SessionTimestamps,
  type SlideResult,
} from "./session"
export {
  signPortalLink,
  verifyPortalLink,
  buildPortalDeepLink,
  type PortalLinkVerification,
} from "./deep-link"
export {
  canConfirmInPortal,
  canCancelInPortal,
  resolvePortalAccess,
  type CancelDecision,
  type CancelDenyReason,
  type PortalAccess,
} from "./policy"
export {
  toPortalAppointment,
  toPortalInvoice,
  toPortalPatient,
  type PortalAppointment,
  type PortalInvoice,
  type PortalPatientProfile,
} from "./serialize"
export { isMinor, portalDisplayName } from "./guardian"
export {
  buildUpdateRequestPayload,
  summarizePortalRequest,
  rescheduleTodoTitle,
  changesToPatientUpdate,
  fieldLabel,
  UPDATABLE_PROFILE_FIELDS,
  type UpdatableProfileField,
  type UpdateChange,
} from "./requests"
