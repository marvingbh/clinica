# PRD: Sistema de Agenda Mobile-First para Clínica de Psicologia

## Overview

Sistema de agenda web mobile-first para clínicas de psicologia, onde profissionais gerenciam seus próprios atendimentos. Profissionais com perfil ADMIN podem gerenciar a agenda de todos. O sistema é multi-tenant (preparado para múltiplas clínicas) e LGPD by design.

**Stack:**
- Frontend/Backend: Next.js 14+ (App Router) com Route Handlers
- Banco: PostgreSQL (versão mais recente)
- ORM: Prisma
- UI: Componentes custom com Tailwind CSS (estilo minimalista/clean)
- Forms: React Hook Form + Zod
- State: React Query + useState/useReducer
- Deploy: Vercel
- Dev: Docker Compose

**Princípios:**
- Mobile-first (UX projetado primeiro para celular)
- Sem recepção física
- Confirmação/cancelamento exclusivamente via link público
- Backend e frontend separados por camadas
- Interface em PT-BR, código em inglês

## Goals

- Permitir que profissionais gerenciem sua própria agenda de forma autônoma
- Eliminar conflitos de horário (double-booking) através de validações robustas
- Facilitar confirmação/cancelamento pelo paciente em 1 clique via link
- Garantir conformidade com LGPD desde o design
- Entregar UX otimizada para uso em celular (touch targets ≥ 44px, ≤ 2 toques)
- Preparar arquitetura multi-tenant para expansão futura
- Deploy funcional na Vercel

## Quality Gates

These commands must pass for every user story:
- `npm run typecheck` - Type checking
- `npm run lint` - Linting

## User Stories

### Fase 1: Infraestrutura e Autenticação

---

### US-001: Setup inicial do projeto Next.js com Docker
As a developer, I want the project scaffolded with Next.js App Router, Tailwind CSS, and Docker Compose so that I have a working development environment.

**Acceptance Criteria:**
- [ ] Next.js 14+ project created with App Router enabled
- [ ] Tailwind CSS configured with custom color palette (minimalista: neutros, bordas sutis)
- [ ] Docker Compose file with PostgreSQL (latest version)
- [ ] `.env.example` with required environment variables
- [ ] `npm run dev` starts the app successfully
- [ ] `docker-compose up` starts PostgreSQL successfully
- [ ] Project structure follows hybrid approach: `/features` for domain, `/shared` for common components
- [ ] Base layout with mobile viewport meta tags configured

---

### US-002: Prisma schema com modelo de dados completo
As a developer, I want the complete database schema defined in Prisma so that all entities and relationships are established.

**Acceptance Criteria:**
- [ ] Prisma initialized with PostgreSQL provider
- [ ] Models created: Clinic, User, ProfessionalProfile, AvailabilityRule, AvailabilityException, Patient, Appointment, AppointmentRecurrence, AppointmentToken, Notification, AuditLog
- [ ] Multi-tenant structure: all relevant models have `clinicId` foreign key
- [ ] Enum types defined: Role (ADMIN, PROFESSIONAL), AppointmentStatus (AGENDADO, CONFIRMADO, CANCELADO_PACIENTE, CANCELADO_PROFISSIONAL, NAO_COMPARECEU, FINALIZADO), AppointmentModality (ONLINE, PRESENCIAL), NotificationType, ConsentType
- [ ] Indexes created for frequently queried fields (clinicId, date ranges, status)
- [ ] `npx prisma migrate dev` runs without errors
- [ ] `npx prisma generate` creates client successfully

---

### US-003: Sistema de autenticação com NextAuth.js
As a professional, I want to log in with email and password so that I can access my clinic's system securely.

**Acceptance Criteria:**
- [ ] NextAuth.js configured with Credentials provider
- [ ] Login page at `/login` with email/password fields
- [ ] Password hashing with bcrypt
- [ ] JWT session strategy configured
- [ ] Session includes: userId, clinicId, role, professionalProfileId
- [ ] Protected API routes return 401 for unauthenticated requests
- [ ] Protected pages redirect to `/login` when not authenticated
- [ ] Login form is mobile-friendly (full-width inputs, large touch targets)

---

### US-004: Middleware de autorização RBAC
As a system, I want role-based access control so that professionals can only access permitted resources.

**Acceptance Criteria:**
- [ ] Middleware checks user role on protected routes
- [ ] PROFESSIONAL can only access own resources (appointments, profile)
- [ ] ADMIN can access all resources within their clinic
- [ ] API routes validate permissions before executing actions
- [ ] Unauthorized access returns 403 with appropriate message
- [ ] AuditLog entry created for permission denied attempts

---

### US-005: API e tela de perfil do usuário logado
As a professional, I want to view and edit my profile so that my information is up to date.

**Acceptance Criteria:**
- [ ] GET `/api/me` returns current user with professional profile
- [ ] PATCH `/api/me` allows updating profile fields
- [ ] Profile page at `/profile` displays user info
- [ ] Editable fields: name, phone, specialty, default session duration
- [ ] Form validation with React Hook Form + Zod
- [ ] Success/error feedback via toast notification
- [ ] Mobile-friendly form layout

---

### Fase 2: CRUD de Profissionais e Pacientes

---

### US-006: CRUD de profissionais (ADMIN only)
As an admin, I want to manage professionals so that I can add, edit, and deactivate team members.

**Acceptance Criteria:**
- [ ] GET `/api/professionals` returns list of professionals (ADMIN only)
- [ ] POST `/api/professionals` creates new professional with User + ProfessionalProfile
- [ ] PATCH `/api/professionals/:id` updates professional data
- [ ] DELETE `/api/professionals/:id` soft-deletes (deactivates) professional
- [ ] List page at `/admin/professionals` with search/filter
- [ ] Create/edit form as bottom sheet (mobile pattern)
- [ ] Fields: name, email, password (create only), phone, specialty, default session duration, timezone
- [ ] Only ADMIN role can access these endpoints and pages

---

### US-007: Configuração de disponibilidade semanal
As a professional, I want to configure my weekly availability so that appointments can only be scheduled during my working hours.

**Acceptance Criteria:**
- [ ] GET `/api/availability` returns current user's availability rules
- [ ] POST `/api/availability` creates/updates availability rules
- [ ] AvailabilityRule model supports: dayOfWeek (0-6), startTime, endTime, isActive
- [ ] UI at `/settings/availability` shows weekly grid
- [ ] Can set multiple time blocks per day
- [ ] Can toggle days on/off
- [ ] ADMIN can manage availability for any professional
- [ ] Mobile-friendly time picker (native or custom)

---

### US-008: Bloqueios e exceções de disponibilidade
As a professional, I want to block specific dates/times so that I'm not scheduled during vacations or personal time.

**Acceptance Criteria:**
- [ ] POST `/api/availability/exceptions` creates exception (block or override)
- [ ] GET `/api/availability/exceptions` lists exceptions for date range
- [ ] DELETE `/api/availability/exceptions/:id` removes exception
- [ ] Exception types: BLOCK (unavailable) and OVERRIDE (available outside normal hours)
- [ ] UI to add exception with date picker and optional time range
- [ ] Exceptions displayed on availability settings page
- [ ] ADMIN can manage exceptions for any professional

---

### US-009: CRUD de pacientes
As a professional, I want to manage patients so that I can register and update their information.

**Acceptance Criteria:**
- [ ] GET `/api/patients` returns paginated list with search
- [ ] POST `/api/patients` creates new patient
- [ ] GET `/api/patients/:id` returns patient details with appointment history
- [ ] PATCH `/api/patients/:id` updates patient data
- [ ] Required fields: name, phone (WhatsApp format validation)
- [ ] Optional fields: email, notes (administrative observations)
- [ ] Consent fields: consentWhatsApp, consentEmail (boolean + timestamp)
- [ ] Patient list page at `/patients` with search
- [ ] Patient detail/edit as bottom sheet or separate page
- [ ] LGPD: consent checkboxes clearly labeled

---

### Fase 3: Agenda e Agendamentos

---

### US-010: Visualização de agenda diária
As a professional, I want to view my daily schedule so that I can see all appointments for a given day.

**Acceptance Criteria:**
- [ ] GET `/api/appointments?date=YYYY-MM-DD` returns appointments for date
- [ ] Main agenda page at `/agenda` (default route after login)
- [ ] Daily view as default (timeline style)
- [ ] Swipe left/right to change days (touch gesture)
- [ ] Date picker accessible via header tap
- [ ] Appointments colored by status (defined color palette)
- [ ] Empty slots visible based on availability
- [ ] ADMIN can filter by professional (dropdown)
- [ ] Bottom navigation with: Agenda, Pacientes, Configurações

---

### US-011: Criar novo agendamento
As a professional, I want to create appointments so that I can schedule sessions with patients.

**Acceptance Criteria:**
- [ ] POST `/api/appointments` creates new appointment
- [ ] FAB (floating action button) on agenda opens creation flow
- [ ] Required fields: patientId, date, startTime, duration, modality
- [ ] Optional fields: notes, price
- [ ] Duration defaults to professional's default session duration
- [ ] Validates against availability rules
- [ ] Validates against existing appointments (no double-booking)
- [ ] Validates against availability exceptions (blocks)
- [ ] Returns created appointment with generated tokens
- [ ] Form as full-screen modal or bottom sheet
- [ ] Patient searchable/selectable from list
- [ ] Date/time picker mobile-optimized

---

### US-012: Validação anti-conflito de horários
As a system, I want to prevent double-booking so that professionals never have overlapping appointments.

**Acceptance Criteria:**
- [ ] Before creating/updating appointment, check for conflicts
- [ ] Conflict = any appointment where time ranges overlap for same professional
- [ ] Consider buffer time if configured (future enhancement, prepare structure)
- [ ] Return 409 Conflict with clear error message if conflict exists
- [ ] Use database-level locking to prevent race conditions
- [ ] Conflict check excludes cancelled appointments
- [ ] API response includes conflicting appointment info for debugging

---

### US-013: Editar agendamento existente
As a professional, I want to edit appointments so that I can update details or reschedule.

**Acceptance Criteria:**
- [ ] PATCH `/api/appointments/:id` updates appointment
- [ ] Tap on appointment in agenda opens detail view
- [ ] Edit button opens edit form (pre-filled)
- [ ] Can change: date, time, duration, modality, notes, price
- [ ] Cannot change patient (must cancel and recreate)
- [ ] Validates conflicts on time changes
- [ ] Regenerates confirmation tokens if date/time changed
- [ ] AuditLog entry for changes
- [ ] ADMIN can edit any appointment, PROFESSIONAL only own

---

### US-014: Cancelar agendamento (profissional)
As a professional, I want to cancel appointments so that I can free up the slot when needed.

**Acceptance Criteria:**
- [ ] POST `/api/appointments/:id/cancel` with reason
- [ ] Status changes to CANCELADO_PROFISSIONAL
- [ ] Cancellation reason stored in appointment record
- [ ] Confirmation dialog before canceling
- [ ] Option to notify patient (triggers notification if consent exists)
- [ ] AuditLog entry for cancellation
- [ ] Cancelled appointments remain visible (grayed out) but slot becomes free
- [ ] ADMIN can cancel any appointment

---

### US-015: Marcar status do agendamento
As a professional, I want to update appointment status so that I can track attendance.

**Acceptance Criteria:**
- [ ] PATCH `/api/appointments/:id/status` updates status
- [ ] Allowed transitions: AGENDADO→CONFIRMADO, CONFIRMADO→FINALIZADO, CONFIRMADO→NAO_COMPARECEU, any→CANCELADO_*
- [ ] Quick action buttons on appointment detail: "Finalizar", "Não compareceu"
- [ ] Status change reflected immediately in UI
- [ ] AuditLog entry for status changes
- [ ] Color coding updates on agenda view

---

### Fase 4: Confirmação e Cancelamento via Link

---

### US-016: Geração de tokens únicos para agendamento
As a system, I want to generate unique tokens for each appointment so that patients can confirm/cancel via secure links.

**Acceptance Criteria:**
- [ ] On appointment creation, generate 2 tokens: confirmToken, cancelToken
- [ ] Tokens are cryptographically random (UUID v4 or similar)
- [ ] Tokens stored in AppointmentToken table with expiration
- [ ] Token expiration = appointment datetime + 24h (configurable)
- [ ] Links format: `/confirm?token=xxx`, `/cancel?token=xxx`
- [ ] Tokens invalidated after use (one-time use)
- [ ] New tokens generated if appointment is rescheduled

---

### US-017: Página pública de confirmação
As a patient, I want to confirm my appointment via link so that I don't need to log in or call the clinic.

**Acceptance Criteria:**
- [ ] Public page at `/confirm` (no auth required)
- [ ] Accepts `token` query parameter
- [ ] POST `/api/public/appointments/confirm` processes confirmation
- [ ] Page shows: professional name, date, time, modality (details do agendamento)
- [ ] Single "Confirmar" button prominently displayed
- [ ] On success: status → CONFIRMADO, show success message with appointment details
- [ ] On expired/invalid token: show friendly error message
- [ ] On already confirmed: show "já confirmado" message
- [ ] Mobile-friendly, works in WhatsApp WebView
- [ ] Rate limited to prevent abuse

---

### US-018: Página pública de cancelamento
As a patient, I want to cancel my appointment via link so that I can free up the slot easily.

**Acceptance Criteria:**
- [ ] Public page at `/cancel` (no auth required)
- [ ] Accepts `token` query parameter
- [ ] POST `/api/public/appointments/cancel` processes cancellation
- [ ] Page shows appointment details before confirming cancellation
- [ ] Single "Cancelar Agendamento" button
- [ ] Optional: reason field (not required)
- [ ] On success: status → CANCELADO_PACIENTE, show confirmation message
- [ ] On expired/invalid token: show friendly error message
- [ ] On already cancelled: show "já cancelado" message
- [ ] AuditLog entry for patient-initiated cancellation
- [ ] Rate limited

---

### US-019: Reenviar links de confirmação
As a professional, I want to resend confirmation links so that patients who lost the message can still confirm.

**Acceptance Criteria:**
- [ ] POST `/api/appointments/:id/resend-confirmation` triggers resend
- [ ] Generates new tokens (invalidates old ones)
- [ ] Triggers notification send (WhatsApp/email based on consent)
- [ ] Button on appointment detail: "Reenviar confirmação"
- [ ] Cooldown period: cannot resend within 1 hour
- [ ] AuditLog entry for resend action

---

### Fase 5: Recorrência

---

### US-020: Criar agendamento recorrente
As a professional, I want to create recurring appointments so that regular patients are automatically scheduled.

**Acceptance Criteria:**
- [ ] POST `/api/appointments` accepts recurrence options
- [ ] Recurrence types: WEEKLY, BIWEEKLY, MONTHLY
- [ ] Recurrence end: by date or by number of occurrences
- [ ] Creates AppointmentRecurrence record linking all instances
- [ ] Each instance is a separate Appointment record
- [ ] Validates all instances against availability (fails if any conflict)
- [ ] UI toggle "Agendamento recorrente" shows recurrence options
- [ ] Preview of dates before confirming
- [ ] Maximum 52 occurrences (1 year weekly)

---

### US-021: Cancelar série ou ocorrência única
As a professional, I want to cancel recurring appointments flexibly so that I can cancel one session or the entire series.

**Acceptance Criteria:**
- [ ] When canceling recurring appointment, prompt: "Esta ocorrência" or "Toda a série"
- [ ] Cancel single: only that Appointment is cancelled
- [ ] Cancel series: all future appointments in recurrence are cancelled
- [ ] Past appointments in series are not affected
- [ ] Cancellation reason applies to all cancelled appointments
- [ ] UI clearly indicates appointment is part of recurrence

---

### US-022: Exceções em recorrência
As a professional, I want to skip specific dates in a recurrence so that holidays or exceptions are handled.

**Acceptance Criteria:**
- [ ] Can mark specific occurrence as "exception" (skipped)
- [ ] Skipped occurrence does not count towards total
- [ ] UI shows skipped dates differently in recurrence preview
- [ ] Can "unskip" an exception to restore it
- [ ] Exception stored in AppointmentRecurrence.exceptions (date array)

---

### Fase 6: Notificações

---

### US-023: Infraestrutura de notificações
As a system, I want a notification queue so that messages are sent reliably with retry logic.

**Acceptance Criteria:**
- [ ] Notification model tracks: type, channel (WHATSAPP/EMAIL), status, attempts, appointmentId
- [ ] Service layer for sending notifications (interface ready for providers)
- [ ] Mock implementation for WhatsApp (logs to console, stores as sent)
- [ ] Email implementation with Resend or similar
- [ ] Retry logic: 3 attempts with exponential backoff
- [ ] Status tracking: PENDING, SENT, FAILED
- [ ] Notification log viewable on appointment detail

---

### US-024: Templates de notificação configuráveis
As an admin, I want to configure notification templates so that messages match the clinic's tone.

**Acceptance Criteria:**
- [ ] Default templates for: new appointment, reminder, cancellation
- [ ] Templates support variables: {{patientName}}, {{professionalName}}, {{date}}, {{time}}, {{confirmLink}}, {{cancelLink}}
- [ ] Templates stored per clinic
- [ ] Admin UI to edit templates at `/admin/settings/notifications`
- [ ] Preview functionality before saving
- [ ] Separate templates for WhatsApp and Email

---

### US-025: Envio automático ao criar agendamento
As a system, I want to automatically notify patients when appointments are created so that they receive confirmation links.

**Acceptance Criteria:**
- [ ] After appointment creation, check patient consent
- [ ] If consentWhatsApp: queue WhatsApp notification
- [ ] If consentEmail: queue email notification
- [ ] Notification includes: appointment details + confirm/cancel links
- [ ] Notification queued asynchronously (don't block API response)
- [ ] Failure to send does not fail appointment creation

---

### US-026: Lembretes automáticos via Cron
As a system, I want to send automatic reminders so that patients don't forget their appointments.

**Acceptance Criteria:**
- [ ] Vercel Cron job at `/api/jobs/send-reminders`
- [ ] Runs every hour
- [ ] Finds appointments needing reminders (configurable: 48h and 2h before)
- [ ] Only sends if not already sent (check Notification records)
- [ ] Only sends to AGENDADO or CONFIRMADO status
- [ ] Respects patient consent preferences
- [ ] Logs execution to AuditLog
- [ ] Idempotent (safe to run multiple times)

---

### Fase 7: Auditoria e Configurações

---

### US-027: Sistema de auditoria completo
As an admin, I want audit logs so that I can track all important actions in the system.

**Acceptance Criteria:**
- [ ] AuditLog records: action, entityType, entityId, userId, clinicId, timestamp, metadata (JSON)
- [ ] Actions logged: CREATE, UPDATE, DELETE, STATUS_CHANGE, LOGIN, PERMISSION_DENIED
- [ ] Service layer method `audit.log(action, entity, metadata)`
- [ ] All appointment changes logged
- [ ] All patient changes logged
- [ ] All authentication events logged
- [ ] GET `/api/admin/audit-logs` with filters (ADMIN only)
- [ ] Audit log viewer page at `/admin/audit`

---

### US-028: Configurações da clínica
As an admin, I want to configure clinic settings so that the system matches our operations.

**Acceptance Criteria:**
- [ ] Clinic model includes settings: name, timezone, defaultSessionDuration, minAdvanceBooking, reminderHours[]
- [ ] GET `/api/admin/settings` returns clinic settings
- [ ] PATCH `/api/admin/settings` updates settings
- [ ] Settings page at `/admin/settings`
- [ ] Fields editable: clinic name, timezone (America/Sao_Paulo default), default session duration, minimum advance booking (hours), reminder schedule

---

### US-029: Seed de dados para desenvolvimento
As a developer, I want seed data so that I can test the application with realistic data.

**Acceptance Criteria:**
- [ ] `npx prisma db seed` populates database
- [ ] Creates 1 clinic
- [ ] Creates 1 ADMIN user and 2 PROFESSIONAL users
- [ ] Creates 10 patients with varied consent settings
- [ ] Creates appointments across next 2 weeks
- [ ] Creates sample availability rules
- [ ] Creates sample notifications
- [ ] Seed script is idempotent (can run multiple times)

---

### Fase 8: Polish e Deploy

---

### US-030: Responsividade e UX mobile final
As a user, I want the app to feel native on mobile so that I can use it comfortably on my phone.

**Acceptance Criteria:**
- [ ] All touch targets ≥ 44px
- [ ] Bottom navigation implemented (Agenda, Pacientes, Config)
- [ ] FAB positioned correctly (bottom right, above nav)
- [ ] Bottom sheets for quick actions (not modals)
- [ ] Swipe gestures working on agenda
- [ ] Loading states with skeleton screens
- [ ] Error states with retry actions
- [ ] LCP < 2s on simulated 4G
- [ ] No horizontal scroll on any page

---

### US-031: PWA básico
As a user, I want to install the app on my home screen so that I can access it quickly.

**Acceptance Criteria:**
- [ ] manifest.json configured with app name, icons, colors
- [ ] Service worker for offline shell (next-pwa or similar)
- [ ] App installable on iOS and Android
- [ ] Splash screen configured
- [ ] Theme color matches app design

---

### US-032: Deploy na Vercel
As a developer, I want the app deployed to Vercel so that it's accessible online.

**Acceptance Criteria:**
- [ ] Vercel project configured
- [ ] Environment variables set in Vercel dashboard
- [ ] PostgreSQL provisioned (Vercel Postgres or external)
- [ ] Prisma migrations run on deploy
- [ ] Cron jobs configured in vercel.json
- [ ] Production build passes without errors
- [ ] Custom domain configured (optional, can use vercel.app)

## Functional Requirements

- FR-01: System must support two roles: ADMIN and PROFESSIONAL with distinct permissions
- FR-02: PROFESSIONAL can only view and manage their own appointments
- FR-03: ADMIN can view and manage all appointments within their clinic
- FR-04: Appointments must have one of six statuses: AGENDADO, CONFIRMADO, CANCELADO_PACIENTE, CANCELADO_PROFISSIONAL, NAO_COMPARECEU, FINALIZADO
- FR-05: System must prevent double-booking through validation before save
- FR-06: System must validate appointments against professional availability rules
- FR-07: System must validate appointments against availability exceptions (blocks)
- FR-08: Each appointment must generate unique, time-limited tokens for confirm/cancel actions
- FR-09: Public confirm/cancel pages must work without authentication
- FR-10: Public pages must function correctly in WhatsApp WebView
- FR-11: System must support recurring appointments (weekly, biweekly, monthly)
- FR-12: Recurring appointments must allow canceling single occurrence or entire series
- FR-13: Notifications must respect patient consent (WhatsApp, email separately)
- FR-14: All data-modifying actions must create AuditLog entries
- FR-15: All entities must be scoped to a clinic (multi-tenant)
- FR-16: Patient data must include LGPD consent tracking with timestamps

## Non-Goals (Out of Scope)

- Native mobile app (iOS/Android) - this is web only
- Reception/front-desk role and workflows
- Clinical records/prontuário beyond basic appointment notes
- Insurance/convênio management
- Payment processing or financial reports
- Video call integration for online appointments
- SMS notifications (WhatsApp and email only)
- Multi-language support (PT-BR only for MVP)
- Offline-first functionality (basic PWA shell only)
- Patient self-scheduling portal
- Waiting list management
- Automated no-show fees or policies
- Integration with external calendars (Google Calendar, etc.)
- Custom reporting or analytics dashboards

## Technical Considerations

**Architecture:**
- Next.js App Router with Route Handlers for API
- Hybrid folder structure: `/features` for domain logic, `/shared` for common components
- Service layer pattern for business logic
- Zod schemas shared between frontend validation and API

**Database:**
- PostgreSQL with Prisma ORM
- All queries must be indexed for common access patterns
- Use database transactions for multi-step operations
- Implement row-level locking for conflict prevention

**Security:**
- Rate limiting on public endpoints (confirm/cancel)
- Input sanitization on all user inputs
- HTTPS only (enforced by Vercel)
- Secure token generation (crypto.randomUUID or similar)
- Password hashing with bcrypt (cost factor 12)

**Performance:**
- Server Components by default, Client Components only when needed
- React Query for data fetching with appropriate cache times
- Optimistic updates for better perceived performance
- Image optimization via next/image if needed

**Multi-tenant:**
- All database queries must filter by clinicId
- Middleware validates clinicId access
- No cross-clinic data leakage possible

## Success Metrics

- All professionals can manage their own agenda independently
- Zero double-bookings in production
- Patients can confirm/cancel in under 10 seconds via link
- Public pages load and function in WhatsApp WebView
- All CRUD operations complete without errors
- Audit log captures all significant actions
- App is installable as PWA on mobile devices
- Vercel deployment is stable and accessible

## Open Questions

1. Which WhatsApp provider should be integrated after MVP? (Evolution API, Z-API, Twilio?)
2. Should system theme auto-detection be added in v2?
3. Is there a need for appointment buffer time between sessions?
4. Should patients receive a summary of their upcoming appointments periodically?
5. Is there a maximum number of active professionals per clinic to consider for pricing tiers?