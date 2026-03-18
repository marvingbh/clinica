-- Ensure groupId and sessionGroupId are mutually exclusive
ALTER TABLE "Appointment" ADD CONSTRAINT "chk_group_exclusivity"
  CHECK (NOT ("groupId" IS NOT NULL AND "sessionGroupId" IS NOT NULL));
