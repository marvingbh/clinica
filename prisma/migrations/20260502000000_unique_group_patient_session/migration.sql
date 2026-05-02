-- Prevents duplicate group session appointments for the same patient.
-- Postgres treats NULLs as distinct in UNIQUE indexes, so rows with
-- NULL groupId or NULL patientId (non-group or no-patient appointments)
-- are not constrained by this index.
CREATE UNIQUE INDEX "Appointment_group_patient_time_uniq"
  ON "Appointment"("groupId", "patientId", "scheduledAt");
