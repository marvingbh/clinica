---
title: "feat: Intake approve → edit patient → optional schedule"
type: feat
status: completed
date: 2026-05-06
origin: docs/brainstorms/2026-05-06-intake-approve-with-edit-and-schedule-brainstorm.md
---

# feat: Intake approve → edit patient → optional schedule

## Overview

Replace today's one-click "Aprovar" — which only maps a `IntakeSubmission`
into a `Patient` and redirects (broken) to the agenda — with an inline
flow that lets the operator complete admin-only fields (projeto
terapêutico, reference professional, session value, due date, last fee
adjustment, NFS-e prefs, etc.) and *optionally* schedule the first
session, all without leaving the intake list view.

The form rendered after "Aprovar" is the **same** patient form already
used at `/patients`, refactored to be reusable. No new patient-form code.
A new approve-with-overrides API path creates the Patient and flips the
submission `APPROVED` in one transaction. After save, two CTAs:
"Agendar primeira sessão" (deep-link to a fixed agenda redirect that
will *actually* open the create-appointment sheet pre-filled) and
"Concluído" (close).

This plan also fixes the existing dead redirect: the agenda page must
honor `?newAppointment=1&patientId=…&title=…` query params so the
deep-link works (it doesn't today — see Research findings).

## Problem Statement

Today's approve flow:

- Operator clicks **Aprovar** in `IntakeSubmissionDetail`
- API creates a `Patient` with only the intake-captured fields
  (childName → name, guardian CPF → billingCpf, etc. via
  `mapSubmissionToPatient`)
- All admin-only fields (sessionFee, referenceProfessionalId,
  therapeuticProject, invoiceGrouping, invoiceDueDay,
  lastFeeAdjustmentDate, nfse* template fields, additionalPhones,
  consentWhatsApp/Email) are left blank
- The submission flips to `APPROVED`
- The frontend redirects to `/agenda?newAppointment=true&patientId=…`
  — but the agenda page **doesn't read those params**, so the operator
  lands on the agenda with no create-appointment sheet open. They have
  to either (a) navigate back to `/patients`, find the new patient,
  open it, fill in admin fields, save, then click "+ Novo agendamento"
  and pick the patient again, or (b) manually create an appointment
  from the agenda for a patient missing essential admin info.

Both paths are slow and easy to get wrong. The operator typically wants
to do all three things — approve, complete the patient, schedule a
first parent meeting — in one flow.

This plan implements **Approach A** from the brainstorm
(see brainstorm: docs/brainstorms/2026-05-06-intake-approve-with-edit-and-schedule-brainstorm.md):
inline expand on the intake panel, reusing the existing patient form,
with a working deep-link to schedule the first session.

## Proposed Solution

```
IntakeSubmissionsTab
  └─ list (left)
      └─ row "Aprovar" click ───┐
                                ▼
  └─ IntakeSubmissionDetail (right panel)
        ├─ State: viewMode = "review" | "approve-edit"
        │
        ├─ when viewMode = "review":
        │     [...current detail render...]
        │     [Rejeitar]  [Aprovar  →  sets viewMode="approve-edit"]
        │
        └─ when viewMode = "approve-edit":
              <PatientFormPanel
                 mode="approve-from-intake"
                 defaultValues={mapSubmissionToFormDefaults(submission)}
                 onSave={...calls new approve API...}
                 onCancel={...returns to viewMode="review", submission stays PENDING...}
              />
              ↓ on successful save:
              [Agendar primeira sessão]  [Concluído]
                  │                            │
                  │                            └─ closes panel, refreshes list
                  └─ navigates to /agenda?newAppointment=1&patientId={id}&title=Reunião+com+responsáveis
                     ↑ NEW: agenda page reads these params and opens the CreateAppointmentSheet pre-filled
```

### API contract change

Current: `PATCH /api/intake-submissions/[id]` body `{ action: "approve" }`.
New: same endpoint, same `action`, optional new field
`patient: { ...PatientFormData }` in the body.

```jsonc
{
  "action": "approve",
  "patient": {
    "name": "João da Silva",
    "phone": "31999990000",
    "email": "...",
    "sessionFee": 250.00,
    "referenceProfessionalId": "prof-1",
    // ... all PatientFormData fields
    "additionalPhones": [{ "phone": "...", "label": "Mãe", "notify": true }]
  }
}
```

Server logic (one transaction):

1. Load the submission (must be `PENDING`, same `clinicId`).
2. Compute `mapped = mapSubmissionToPatient(submission, clinicId)` — this
   includes consent timestamps reflecting the original submission time.
3. **Merge:** `final = { ...mapped, ...validated(patient), consentPhotoVideoAt: mapped.consentPhotoVideoAt, consentSessionRecordingAt: mapped.consentSessionRecordingAt }`
   — operator's data wins for everything **except** the consent
   timestamps, which always reflect the original submission.
4. Run the same uniqueness/duplicate guards POST /api/patients does
   (CPF, phones).
5. Create the Patient + additionalPhones.
6. Flip submission `APPROVED` with `patientId`, `reviewedByUserId`,
   `reviewedAt`.
7. Audit log `INTAKE_APPROVED` with `editedFields: [...]` (which fields
   the operator changed vs. the mapping baseline).

If `patient` is omitted, the endpoint falls back to today's behavior
(map-only, no operator edits) — backwards compatible.

### Why a context, not a prop

Same justification as the brainstorm: three call sites (sidebar nav
badge, header badge, bottom-nav dot, banner) consume the count via
context. **N/A here** — this feature has a single render site, no
context needed. Disregard.

## Technical Considerations

- **Architecture.** No new infrastructure. New files: a
  `PatientFormPanel` wrapper that owns the `useForm` + side state,
  consumed by both `/patients/page.tsx` (replace inline) and the new
  `IntakeApprovalView` rendered inside `IntakeSubmissionDetail`.
- **Form schema.** Today the patient form has its own zod schema
  (inline in `src/app/patients/page.tsx`) and the API has a separate
  `createPatientSchema` (in `src/app/api/patients/route.ts`). They
  drift trivially. Extract a single `patientFormSchema` to
  `src/lib/patients/schema.ts`; both UI and API import it.
- **Atomicity.** Patient creation + submission flip remain in a single
  Prisma transaction. The "Agendar primeira sessão" navigation is *not*
  inside that transaction (intentional, per brainstorm) — if the
  operator's network drops between save and clicking the button, they
  see an APPROVED patient with no first session. Easy recovery.
- **Backwards compatibility.** Keeping the existing `action: "approve"`
  contract (with new optional `patient` body) means superadmin tooling
  or any future automation that calls approve-without-edits still works.
- **CLAUDE.md `useEffect` rule.** No raw `useEffect` for state sync.
  Form pre-fill happens via RHF `defaultValues`. Query-param parsing on
  the agenda page uses `window.location` once on mount via
  `useMountEffect` (matches how the patients page reads `?tab=fichas`).
- **File size limit (200 lines, CLAUDE.md).** PatientForm.tsx (442
  lines) and /patients/page.tsx (huge) are pre-existing — we don't
  reduce them as part of this plan, but we don't grow them either. New
  files we add (`PatientFormPanel`, `IntakeApprovalView`,
  `usePatientForm`) stay <200 lines each.
- **Multi-tenant.** Patient creation already scopes to `user.clinicId`
  via the existing transaction. No change in scoping; the new endpoint
  reuses the same.
- **LGPD consent timestamps.** The intake submission captured the
  consents at a specific moment. The mapping stamps
  `consentPhotoVideoAt` / `consentSessionRecordingAt` based on
  `submission.submittedAt`. The merge step in the new endpoint **must
  preserve** those timestamps even if the operator toggles the consent
  booleans (toggling off should null the timestamp; toggling on after
  it was off in the submission should require a fresh `now()`). Spell
  this out in the merge logic — it's the trickiest server-side rule.
- **Audit traceability.** Operators can change consent flags during
  approve. Log the diff (changed fields list) in the audit row so we
  have a record of operator-vs-patient consent claims for compliance.
- **Permissions.** All paths require `patients` WRITE — already enforced
  on both the existing patient API and the existing approve endpoint.
- **Mobile layout.** The intake detail panel goes full-screen on mobile
  today. The patient form has 3 tabs already; rendering it inside the
  detail panel on mobile is the same as on desktop. Verify during build,
  no special handling expected.

## System-Wide Impact

### Interaction Graph

`Operator clicks Aprovar` → `IntakeSubmissionDetail` flips to
`approve-edit` mode → renders `PatientFormPanel` with submission-derived
defaults → operator edits → submits → `PATCH /api/intake-submissions/[id]`
with `{ action: "approve", patient: {...} }` → server runs transaction:
`prisma.intakeSubmission.findFirst` → `mapSubmissionToPatient` → `merge` →
duplicate guards → `tx.patient.create` (with nested `additionalPhones`) →
`tx.intakeSubmission.update` → `audit.log INTAKE_APPROVED` → response
returned → frontend shows post-save CTAs → `pendingIntakeCount` poll
on next tick decrements → banner + nav badges drop on next render.

### Error & Failure Propagation

| Layer | Error | Handled where | User sees |
|-------|-------|---------------|-----------|
| zod validation | invalid form data | Endpoint returns 400 | Toast + form field errors |
| CPF unique | dup CPF on patient create | Endpoint returns 409 with `field: "cpf"` | Inline form error on cpf field |
| Phone unique | dup phone on additionalPhones | Endpoint returns 409 with `field: "phone"` | Inline form error |
| Concurrent approve | submission no longer PENDING | `findFirst` returns null inside tx → endpoint 404 with code `ALREADY_REVIEWED` | Toast: "Esta ficha já foi revisada" + close panel + refresh list |
| Network drop mid-save | tx didn't commit | Submission stays PENDING, no Patient created | Toast: "Erro ao salvar, tente novamente" |
| Network drop after save, before redirect | tx committed, browser navigation failed | Submission APPROVED, patient created | Operator can find patient via `/patients` and schedule manually |

### State Lifecycle Risks

- **Half-saved patient.** The transaction wraps Patient.create AND
  IntakeSubmission.update — both succeed or both fail. No partial state.
- **Stale form view.** If a different operator approves the submission
  while this operator has the form open, this operator's submit returns
  ALREADY_REVIEWED. The first-write-wins behavior is correct; we just
  need a clear toast.
- **Orphan additionalPhones.** Patient.create with nested
  additionalPhones is one Prisma call → atomic. No risk.

### API Surface Parity

- `POST /api/patients` (existing) — used by `/patients` page for create.
  Same zod schema (after extraction).
- `PATCH /api/patients/[id]` (existing) — used for edit. Same schema.
- `PATCH /api/intake-submissions/[id]` (this plan extends) — accepts the
  same patient shape under a `patient` key. Three writers of patient
  rows now share one schema.
- The future audit/admin views must show the same fields the form
  exposes. No drift after extraction.

### Integration Test Scenarios

1. **Cross-clinic isolation.** Operator A in clinic-1 attempts to
   approve a submission belonging to clinic-2 via crafted body. Endpoint
   must return 404 (the `findFirst` clinicId filter blocks it).
2. **Concurrent approve.** Two simultaneous PATCH calls — exactly one
   wins; the loser receives ALREADY_REVIEWED.
3. **Operator strips a required intake field.** Operator clears `name`
   in the form before submit. Server schema must reject (zod required).
4. **Consent toggle preserves original timestamp on toggle-off.**
   Submission had `consentPhotoVideo: true` (timestamped at
   `submittedAt`). Operator toggles to false. Patient row must store
   `consentPhotoVideo: false` AND `consentPhotoVideoAt: null`.
5. **First-session redirect.** Click "Agendar primeira sessão" →
   navigate to agenda → CreateAppointmentSheet opens with
   `patientId` selected and title pre-filled. Verify on
   `/agenda` and `/agenda/weekly` (whichever is the active page).
6. **Reject path unchanged.** Click "Rejeitar" → no form, no patient
   created, submission flips REJECTED, panel closes. (Regression check.)

## Implementation Plan

Order matters; each step ends with a green build + tests.

### Step 0: Pre-refactor integration tests (REQUIRED before extraction)

Per stored feedback (`feedback_integration_tests_before_refactor.md`):
add tests covering existing behavior before refactoring.

**Files:**
- `src/app/api/patients/route.test.ts` (new) — happy path POST + edge
  cases (CPF dup, phone dup, additionalPhones nested create, audit log)
- `src/app/api/patients/[id]/route.test.ts` (new) — PATCH happy path +
  edge cases
- `src/app/api/intake-submissions/[id]/route.test.ts` (new) — current
  approve behavior (map-only path), reject behavior, ALREADY_REVIEWED
  on a non-PENDING submission, cross-clinic 404

These lock in the existing contracts so the extraction in steps 1-3
doesn't drift them.

### Step 1: Extract patient form schema to `src/lib/patients`

**Files:**
- `src/lib/patients/schema.ts` (new) — exports `patientFormSchema`
  (zod) and `PatientFormData` (inferred type). Mirrors today's inline
  schema in `src/app/patients/page.tsx:33-67`.
- `src/lib/patients/schema.test.ts` (new) — happy path, invalid
  email, invalid phone regex, sessionFee bounds, etc.

**Update:**
- `src/app/patients/page.tsx` — import from new module instead of
  inline declaration.
- `src/app/api/patients/route.ts` — replace `createPatientSchema` with
  the shared module's schema.

Run the Step 0 tests — they must still pass.

### Step 2: Extract `usePatientForm` hook + `PatientFormPanel` wrapper

**File:** `src/app/patients/components/usePatientForm.ts` (new)

Bundles:
- `useForm({ resolver: zodResolver(patientFormSchema), defaultValues })`
- additionalPhones array state (mirrors page.tsx:114)
- professionals list fetch (mirrors page.tsx:112) — accepts an optional
  pre-loaded list to skip the fetch
- billingMode fetch (mirrors page.tsx:125) — same opt-out
- `handleSubmit` builder that knows the `mode`:
  - `"create"` → POST /api/patients
  - `"edit"` → PATCH /api/patients/[id]
  - `"approve-from-intake"` → PATCH /api/intake-submissions/[id] with
    `{ action: "approve", patient: data }`
- Returns `{ form, additionalPhones, professionals, billingMode, isSaving, onSubmit }`

**File:** `src/app/patients/components/PatientFormPanel.tsx` (new)

Thin wrapper:
- Accepts `{ mode, defaultValues, ...overrides, onSaved, onCancel, professionals?, billingMode? }`
- Mounts `usePatientForm`
- Renders the existing `PatientForm` dumb component with all required props threaded through
- On save, calls `onSaved(patient)` with the persisted entity
- On cancel, calls `onCancel()` (parent decides what to do)

**Update:**
- `src/app/patients/page.tsx` — replace the in-page useForm + state with
  `<PatientFormPanel mode="create" | "edit" ... />`. The page becomes
  significantly thinner.

Run all tests + manual smoke at `/patients` (create + edit) — no
behavior change.

### Step 3: Extend approve endpoint with optional `patient` body

**File:** `src/app/api/intake-submissions/[id]/route.ts` (edit)

- Schema for the PATCH body extends to optional
  `patient: patientFormSchema` (the shared zod from step 1).
- Inside the existing transaction, after `mapSubmissionToPatient`:
  - If `body.patient` present, run merge logic:
    - `final = { ...mapped, ...validated(body.patient) }`
    - **Consent timestamp rules** (the tricky part):
      - If operator's `consentPhotoVideo === false` → set
        `consentPhotoVideoAt = null` regardless of mapping
      - If operator's `consentPhotoVideo === true` AND mapping had
        `consentPhotoVideoAt` → keep mapping's timestamp
      - If operator's `consentPhotoVideo === true` AND mapping had no
        timestamp (i.e. submission had it false but operator is
        flipping to true) → stamp with `new Date()`
      - Same for `consentSessionRecording*`
      - Same for `consentWhatsAppAt`, `consentEmailAt` if those exist
        in the schema (they don't on Patient today; verify)
    - Run the same duplicate guards POST /api/patients runs (CPF,
      phones) — extract those checks into a helper if needed
    - Create Patient with nested `additionalPhones`
  - Else: today's behavior (map-only).
- Audit log includes `edited: true | false` and a list of changed
  fields (operator's data vs mapped baseline) for compliance.

**File:** `src/app/api/intake-submissions/[id]/route.test.ts` (extend)

- Approve with `patient` body: patient created with operator's overrides
- Approve without `patient` body: backwards-compat (map-only)
- Consent toggle-off zeros the timestamp
- Consent toggle-on stamps now() when mapping had no timestamp
- CPF dup returns 409 with field hint
- Cross-clinic returns 404
- Concurrent approve: only first call wins; second returns
  ALREADY_REVIEWED

### Step 4: Render the form inline in `IntakeSubmissionDetail`

**File:** `src/app/patients/components/IntakeSubmissionDetail.tsx` (edit)

- Add local state `viewMode: "review" | "approve-edit" | "post-save"`,
  default `"review"`.
- "Aprovar" button: instead of calling fetch directly, set
  `viewMode = "approve-edit"`.
- "Rejeitar" button: unchanged.
- When `viewMode === "approve-edit"`:
  - Render `<PatientFormPanel mode="approve-from-intake"
    defaultValues={submissionToFormDefaults(submission)} onSaved={(p) => setViewMode("post-save"); setSavedPatient(p)} onCancel={() => setViewMode("review")} />`
- When `viewMode === "post-save"`:
  - Render success block + two CTAs:
    - "Agendar primeira sessão" → navigate to
      `/agenda?newAppointment=1&patientId={p.id}&title=${encodeURIComponent("Reunião com responsáveis")}`
    - "Concluído" → close panel, trigger list refetch.

**Helper** (probably in `src/lib/intake/form-defaults.ts`, new):
- `submissionToFormDefaults(submission): PatientFormData` — produces
  the partial form values from intake fields (strict subset of
  PatientFormData, with admin fields blank/null).

### Step 5: Make the agenda redirect actually work

**File:** `src/app/agenda/page.tsx` (edit) and/or
`src/app/agenda/weekly/page.tsx` (edit) — whichever is the default
landing page.

- Add `useMountEffect` (mirrors the `?tab=fichas` pattern in
  `src/app/patients/page.tsx`):
  ```ts
  useMountEffect(() => {
    if (typeof window === "undefined") return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get("newAppointment") === "1") {
      const patientId = sp.get("patientId")
      const title = sp.get("title") ?? undefined
      openCreateSheet({ patientId, title })
      // strip query params from URL so refresh doesn't re-open the sheet
      window.history.replaceState({}, "", window.location.pathname)
    }
  })
  ```
- Plumb `patientId` + `title` into the existing `CreateAppointmentSheet`
  via the agenda's existing open-create-sheet handler. The sheet
  already accepts `selectedPatient`; this step adds title support if
  it's not already there.

### Step 6: Build + manual smoke

- `npm run build` — clean
- `npm run test` — full pass
- Manual smoke against local DB synced from prod:
  1. Submit a fresh intake form via `/intake/[slug]` (or restore one
     of the stale rejected ones to PENDING for the test)
  2. Open `/patients` → Fichas tab → click the row → "Aprovar"
  3. Confirm the form opens pre-filled with intake data
  4. Fill in `sessionFee`, `referenceProfessionalId`, optionally
     `therapeuticProject`
  5. Click "Salvar"
  6. Confirm patient appears in `/patients` list
  7. Confirm intake submission shows APPROVED in Fichas tab
  8. Click "Agendar primeira sessão" → confirm the agenda opens with
     the create-appointment sheet pre-filled with the patient and
     title "Reunião com responsáveis"
  9. Click "Concluído" instead → confirm panel closes, list refreshes
  10. Reject path: confirm still works as today.

## Acceptance Criteria

### Functional Requirements

- [ ] `PATCH /api/intake-submissions/[id]` accepts optional `patient`
      body validated against `patientFormSchema`; persists operator
      overrides atomically with the submission flip
- [ ] Without the `patient` body, the endpoint behaves identically to
      today (map-only)
- [ ] Patient creation respects the same uniqueness/duplicate guards as
      `POST /api/patients`
- [ ] Consent timestamps (`consentPhotoVideoAt`,
      `consentSessionRecordingAt`) reflect the original submission time
      when consent stays true; null out when operator toggles to false;
      use `now()` when operator flips a previously-false consent to true
- [ ] `IntakeSubmissionDetail` renders the patient form inline after
      "Aprovar" instead of immediately calling the API
- [ ] Operator can cancel mid-form; submission stays `PENDING`
- [ ] After successful save, panel shows "Agendar primeira sessão" + "Concluído" CTAs
- [ ] "Agendar primeira sessão" deep-link opens the
      `CreateAppointmentSheet` on the agenda with the new patient
      pre-selected and a default title "Reunião com responsáveis"
- [ ] The patient form used in `/patients` (create + edit) and in the
      intake panel is the **same** component (PatientFormPanel)
- [ ] No new patient form duplicating fields, validation, or layout

### Non-Functional Requirements

- [ ] All new files <200 lines (CLAUDE.md size rule)
- [ ] No raw `useEffect` for fetching/state sync; use `useMountEffect`
      where one-time setup is needed
- [ ] Patient form schema is a single source of truth
      (`src/lib/patients/schema.ts`) imported by UI + API
- [ ] Tests cover the new endpoint shape (with and without `patient`
      body), the consent timestamp rules, and the intake panel state
      machine
- [ ] No mobile-layout regression in the intake detail panel
- [ ] No regression in `/patients` page (create + edit)
- [ ] No regression in the reject path

### Quality Gates

- [ ] Step 0 integration tests for existing behavior land **before**
      any extraction (per stored feedback)
- [ ] `npm run build` passes
- [ ] `npm run test` passes (existing 1554 + new tests)
- [ ] Manual smoke confirms the full happy path

## Success Metrics

- Operator time to "approve + complete patient + schedule first session"
  drops from a multi-page navigation cycle to one panel + one CTA click
  (target: ~30s vs ~3 min)
- Zero "I had to find the patient and edit them again" reports
- Zero "the agenda did nothing after I approved" reports (current dead
  redirect)

## Dependencies & Risks

- **Dependency: existing patient form quality.** The current 442-line
  PatientForm.tsx is presentational; the integration logic lives in
  `/patients/page.tsx`. The extraction (Step 2) needs to faithfully
  port that integration. Step 0's pre-refactor tests reduce regression
  risk.
- **Risk: schema unification surfaces field drift.** The form's
  `patientSchema` and the API's `createPatientSchema` may have minor
  divergences (e.g. one allows null where the other doesn't). Step 1
  forces them to converge. Audit the diff during implementation; if
  unification breaks any existing behavior, prefer the looser of the
  two and document why.
- **Risk: consent timestamp rules wrong.** The merge logic is the
  trickiest server-side change. Tests must cover all four toggle paths
  (intake true → operator true; intake true → operator false; intake
  false → operator true; intake false → operator false).
- **Risk: agenda redirect side effects.** Step 5 adds query-param
  handling to a hot page. Use `useMountEffect` (one-time) and
  `window.history.replaceState` to avoid the sheet re-opening on
  re-render or after the user closes it.
- **Out of scope:** general patient form size reduction (442 lines is
  pre-existing). May be tackled separately.

## Open Questions

- **Default title for the first session.** The brainstorm and this plan
  use "Reunião com responsáveis". Confirm with the user during
  implementation; it's a one-line change to swap.
- **Save-and-schedule composite button.** A "Salvar e agendar" primary
  button could combine the two steps. Easy to add as a second primary
  CTA next to "Salvar" without changing the API. Decide during build.
- **Should `consentWhatsAppAt` / `consentEmailAt` exist on Patient?**
  The form has the booleans but the model may not have timestamps.
  Verify schema; if missing and required for LGPD compliance, add as a
  follow-up — out of scope for this plan unless the user wants it
  bundled.

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-05-06-intake-approve-with-edit-and-schedule-brainstorm.md](../brainstorms/2026-05-06-intake-approve-with-edit-and-schedule-brainstorm.md)

  Key decisions carried forward:
  1. Approach A (inline expand on intake panel) over wizard or single
     combined form
  2. Reuse the existing patient form, refactor if needed (no
     duplication)
  3. Atomic approve endpoint with optional patient overrides
  4. Schedule first session is optional, one-click after save

### Internal References

- **Patient form (presentation):**
  `src/app/patients/components/PatientForm.tsx` (442 lines)
- **Patient form (integration today):**
  `src/app/patients/page.tsx:33-67` (zod), `:114` (additionalPhones),
  `:351-422` (onSubmit)
- **Intake submission detail panel:**
  `src/app/patients/components/IntakeSubmissionDetail.tsx`
  (`:62-88` handleApprove, `:83` redirect line)
- **Intake submissions tab (list+detail layout):**
  `src/app/patients/components/IntakeSubmissionsTab.tsx`
- **Approve endpoint:**
  `src/app/api/intake-submissions/[id]/route.ts:79-179`
  (PATCH approve branch)
- **Patient API:**
  `src/app/api/patients/route.ts:18-50` (createPatientSchema),
  `:249-387` (POST handler)
- **Mapping helper:**
  `src/lib/intake/mapping.ts:7` (mapSubmissionToPatient)
- **Appointment-create sheet:**
  `src/app/agenda/components/CreateAppointmentSheet.tsx:74-106` (props)
- **`?tab=fichas` pattern to mirror:**
  `src/app/patients/page.tsx` (the useMountEffect that reads window.location)
- **Form-extracted-from-page precedent:**
  `src/app/groups/components/GroupForm.tsx` (201 lines, takes
  `editingGroup | null` to toggle mode)
- **Current dead redirect:**
  `IntakeSubmissionDetail.tsx:83` — points at
  `/agenda?newAppointment=true&patientId=...` but the agenda page does
  NOT parse those params (verified during research).

### CLAUDE.md Rules in Force

- **Tests required** for every new feature/refactor
- **No raw useEffect** for state sync; use `useMountEffect`
- **Files <200 lines**; new files we add must respect this
- **Brazilian Portuguese** UI copy
- **No `prisma db push`** — though no schema changes here
- **Multi-tenant clinicId scoping** at the query level
- **DDD: domain logic in `src/lib/`** (schema + form-defaults helper
  live there)

### Related Work

- **Pending intake alert:** docs/plans/2026-05-05-001-feat-pending-intake-alert-plan.md
  (commit `cbc10e7`, fix `b028e01`) — banner + nav badge that surface
  PENDING submissions; this plan picks up where that one left off
  (after the operator clicks the badge and lands on the intake panel)
- **Intake notification fix:** commit `4b3d637` — per-clinic verified
  sender for the intake admin email
