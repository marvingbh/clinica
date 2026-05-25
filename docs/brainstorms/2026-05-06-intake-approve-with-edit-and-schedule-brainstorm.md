---
date: 2026-05-06
topic: intake-approve-with-edit-and-schedule
---

# Intake Approve → Edit Patient → Schedule First Session

## What We're Building

Replace today's one-click "Aprovar" — which only maps intake fields into a
new Patient row — with an inline flow that lets the operator complete the
admin-only fields (projeto terapêutico, reference professional, session
value, due date, last readjustment date, etc.) and optionally schedule
the first session, all without leaving the intake list view.

The patient form rendered after "Aprovar" is the **same form** used at
`/patients` for editing — refactored into a reusable component if needed.
No new patient form gets written; existing fields/validation/UX stay the
same.

After save, the operator sees a "Agendar primeira sessão" CTA that opens
the existing appointment-create sheet pre-filled with the new patient
and a sensible default title ("Reunião com responsáveis"). Skipping it
is one click away — the approve is already complete.

## Why This Approach

Three approaches considered:
- **A. Inline expand on the intake panel (chosen).** Click "Aprovar"
  swaps the right-side submission detail for the existing patient-edit
  form, pre-filled with intake data + blank admin fields. Save creates
  Patient + flips submission `APPROVED` atomically. Optional "Agendar
  primeira sessão" CTA after save.
- **B. Two-step wizard.** Patient form → appointment form, atomic both.
  Rejected: forces scheduling even when not wanted, requires a new
  wizard component, couples Patient + Appointment in a single
  transaction (more failure modes).
- **C. Single combined form.** Patient + appointment fields on one
  screen. Rejected: too tall, mixes domains, validation gets confusing.

A is preferred because the patient edit form already handles every admin
field the operator needs to fill in (projeto terapêutico, reference
professional, session value, billing day, last readjust). Reusing it
guarantees parity with the existing edit screen, no double maintenance.

## Key Decisions

- **Reuse the patient form, refactor if needed.** No duplicated form
  code. If the current edit form lives inline in `src/app/patients/page.tsx`,
  extract it into a `PatientForm` component that the intake panel can
  also mount. Both call sites pass `defaultValues` + `onSubmit`; the
  form itself is identical.
- **Atomic approve endpoint with optional patient overrides.** Replace
  the current `POST /api/intake-submissions/[id]` with `action=approve`
  shape. New body: `action: "approve", patient: { ...full patient
  fields }`. The endpoint creates the Patient (with the operator's
  filled-in values overriding/extending the intake-derived ones), then
  flips the submission to APPROVED in the same transaction. Reject
  stays untouched.
- **First-session scheduling stays optional.** After approve succeeds,
  the panel shows two buttons: "Agendar primeira sessão" (opens the
  existing appointment-create sheet pre-filled with `patientId`,
  default title "Reunião com responsáveis", no other defaults forced)
  and "Concluído" (closes the panel). No new scheduling endpoint.
- **Submission status flips only on successful save.** If the operator
  cancels the patient form, the submission stays PENDING (no orphan
  state).
- **Reject path is unchanged.** Single click, no edit panel — same as
  today.
- **Banner / nav badge already react automatically.** The pending count
  drops the moment APPROVED lands; no extra wiring.

## Open Questions

- **Where does the patient form currently live?** Plan should pin
  exactly which file holds the edit form today and what the extraction
  looks like (props, react-hook-form integration, validation schema).
  Likely `src/app/patients/page.tsx` based on prior context.
- **Default title for the first session.** "Reunião com responsáveis"
  sounds right but confirm with the user during implementation. The
  appointment can be created with `type: CONSULTA` (the only kind that
  needs a patient + blocks time); a custom title fits the existing
  appointment model.
- **Do we want a "Save and schedule" composite button?** I.e. a single
  button that saves the patient and immediately opens the appointment
  sheet. Probably yes for ergonomic, but easy to add as a second
  primary CTA next to "Salvar" without changing the API.
- **Mobile layout.** Today the intake submission detail probably opens
  full-screen on mobile. Confirm the patient form fits in that
  constraint (it already does on the dedicated patients page, so this
  is mostly a styling check).

## Next Steps

→ `/ce:plan` for implementation details:
1. Audit the current patient-edit form's location, deps, and shape
2. Decide on the extraction boundary (`PatientForm` component, where
   it lives, what props/callbacks it exposes)
3. Update the existing `/patients` page to consume the extracted
   component (no behavior change there)
4. Update `IntakeSubmissionDetail` to render the form after "Aprovar"
   and call the new endpoint shape
5. Update `POST /api/intake-submissions/[id]` to accept the optional
   `patient: {...}` body and apply it inside the existing transaction
6. Wire the post-save CTA to the appointment-create sheet
7. Tests: endpoint accepts/rejects new shape; submission stays PENDING
   on cancel; APPROVED on save; appointment-sheet pre-fill works
