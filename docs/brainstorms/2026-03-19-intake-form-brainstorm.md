# Intake Form — Public Patient Registration

**Date:** 2026-03-19
**Status:** Ready for planning

## What We're Building

A public intake form per clinic (accessed via `/intake/[slug]`) that replaces the current Google Form workflow. Parents/guardians fill out the form with child and family information. Submissions are stored in a separate `IntakeSubmission` table with a review workflow. Clinic admins review submissions under the Patients menu, can edit data, and approve (which creates a Patient record + schedules the first appointment) or reject (kept for reference, hidden by default via filter).

## Why This Approach

- **Separate `IntakeSubmission` table** over Patient status flag: keeps the Patient table clean from unvalidated public data. Submissions are reviewed before becoming real patients.
- **Fixed form fields** (not configurable per clinic): simpler to build and maintain. All clinics use the same form structure.
- **Structured consent fields** stored as explicit columns, not flexible JSON: consents are legal documents, they deserve first-class schema treatment.
- **Approve with appointment scheduling**: streamlines the admin workflow from submission review to first appointment in one flow.

## Key Decisions

1. **Storage model**: Separate `IntakeSubmission` table with status (PENDING / APPROVED / REJECTED). On approval, data is copied to a new Patient record.

2. **Form fields** (all required unless noted):
   - Child/adolescent full name
   - Child/adolescent date of birth
   - Guardian name (responsavel financeiro)
   - CPF/CNPJ
   - Phone
   - Email
   - Address + CEP
   - School name and unit (optional)
   - School shift/turno (optional)
   - Mother's name
   - Mother's phone (WhatsApp)
   - Father's name
   - Father's phone (WhatsApp)
   - Photo/video consent (boolean) — authorization for social media usage
   - Session recording consent (boolean) — authorization for session recording for supervision

3. **New Patient model fields needed**: father's phone, mother's phone, school unit/shift, photo/video consent, session recording consent. Existing fields already cover: name, birthDate, cpf, phone, email, address fields, fatherName, motherName, schoolName, billingResponsibleName, billingCpf.

4. **Public URL**: `/intake/[slug]` — uses existing `Clinic.slug` field. Shows clinic name/logo on the form.

5. **Approval workflow**: Admin reviews under Patients menu (tab or sub-section). Can edit data before approving. Approval creates Patient + prompts to schedule first appointment. Rejection keeps the record with a filter to hide rejected.

6. **Duplicates**: No duplicate detection. Multiple submissions with same CPF/phone are allowed — clinic handles dedup manually.

7. **Post-submission UX**: Simple "thank you" confirmation message.

8. **Notifications**: Notify clinic admin(s) when a new submission arrives (new `INTAKE_FORM_SUBMITTED` notification type).

9. **Security**: Rate limiting (existing `publicApi` config), Zod validation, no auth required. Separate layout without app chrome.

## Scope

### In scope
- `IntakeSubmission` Prisma model + migration
- New fields on `Patient` model (father phone, mother phone, school unit, school shift, photo/video consent, recording consent)
- Public form page at `/intake/[slug]` with dedicated layout (no nav chrome)
- Public API route `POST /api/public/intake/[slug]`
- Admin list view under Patients menu with status filter
- Admin review/edit screen
- Approve flow: create Patient + redirect to schedule appointment
- Reject flow: mark as rejected
- Notification to clinic on new submission
- Domain module `src/lib/intake/`

### Out of scope
- Configurable form fields per clinic
- Duplicate detection/merging
- Custom branding beyond clinic name/logo
- Appointment auto-scheduling (admin manually schedules)
- Email confirmation to the submitter

## Open Questions

None — all questions resolved during brainstorming.
