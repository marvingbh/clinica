# Multiple Patient Phone Numbers for Notifications

## Summary

Allow patients to have up to 5 phone numbers (1 primary + 4 additional) that all receive WhatsApp/Email notifications. Each additional number has a label (e.g., "Mãe", "Trabalho") for identification. The existing `consentWhatsApp` flag gates all numbers.

## Data Model

New `PatientPhone` model:

```prisma
model PatientPhone {
  id        String   @id @default(cuid())
  patientId String
  clinicId  String
  phone     String   // Normalized digits only
  label     String   // e.g., "Mãe", "Trabalho", "Esposo"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  patient Patient @relation(fields: [patientId], references: [id], onDelete: Cascade)
  clinic  Clinic  @relation(fields: [clinicId], references: [id], onDelete: Cascade)

  @@unique([clinicId, phone])
  @@index([patientId])
  @@index([clinicId])
}
```

- Cascade delete with patient
- Clinic-scoped phone uniqueness (same as Patient.phone)
- Max 4 additional enforced at application level
- Existing `Patient.phone` stays as primary — no data migration

## Notification Flow

When a notification is triggered, send to all phone numbers:

1. Helper function `getPatientPhoneNumbers(patientId, clinicId)` returns primary + additional numbers
2. Create one `Notification` record per phone number (same content, different `recipient`)
3. Gated by existing `patient.consentWhatsApp` — if off, no numbers get notified

### Affected code paths

- `src/app/api/appointments/route.ts` — appointment confirmation
- `src/app/api/appointments/[id]/cancel/route.ts` — cancellation notification
- `src/app/api/jobs/send-reminders/route.ts` — scheduled reminders

No changes to notification service, providers, or templates.

## API Changes

### Patient create (`POST /api/patients`)

- Accept optional `additionalPhones: Array<{ phone, label }>` in request body
- Validate phone format (same regex), label (required, max 30 chars), count <= 4
- Create `PatientPhone` records in same transaction as patient

### Patient update (`PUT /api/patients/[id]`)

- Accept `additionalPhones: Array<{ id?, phone, label }>` — full replacement
- With `id`: update. Without `id`: create. Missing from array: delete.
- Same validation. Runs in a transaction.

### Patient read (`GET /api/patients`, `GET /api/patients/[id]`)

- Include `additionalPhones` in response via Prisma `include`

No new API routes — phones managed as part of patient CRUD.

## UI Changes

### Patient form (create/edit)

- Section "Telefones adicionais" below primary phone input
- Each row: `[label input] [phone input] [remove button]`
- "Adicionar telefone" button, disabled at 4 additional
- Same phone validation as primary
- Label: free text, placeholder examples ("Mãe", "Trabalho", "Esposo")

### Patient detail view

- Additional phones shown below primary phone
- Label displayed as a small badge next to formatted number

### Validation

- Phone: `/^(\+?55)?(\d{2})(\d{8,9})$/`
- Label: required, max 30 characters
- No duplicate numbers within patient (frontend + backend unique constraint)
- Max 4 additional (5 total)

## Implementation Steps

1. Add `PatientPhone` model to Prisma schema + add relation to Patient and Clinic models
2. Run migration
3. Create helper `getPatientPhoneNumbers()` in `src/lib/notifications/`
4. Update appointment creation to notify all numbers
5. Update appointment cancellation to notify all numbers
6. Update reminder job to notify all numbers
7. Update patient create API to accept and store additional phones
8. Update patient update API with full replacement logic
9. Update patient read APIs to include additional phones
10. Update patient form UI with additional phones section
11. Update patient detail view to display additional phones
