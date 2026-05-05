-- Per-clinic feature flag for outbound appointment confirmation and reminder
-- notifications. The feature is not yet generally available; default false
-- so creates of APPOINTMENT_CONFIRMATION / APPOINTMENT_REMINDER on EMAIL
-- are recorded as FAILED ("feature disabled for this clinic") and never
-- attempt delivery. Flip to true when a clinic is onboarded to the feature.
ALTER TABLE "Clinic"
ADD COLUMN "appointmentNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;
