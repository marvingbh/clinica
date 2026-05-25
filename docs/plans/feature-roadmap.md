# Feature Roadmap

Prioritized list of features based on competitor analysis (SimplePractice, PsicoManager, Jane App, Doctoralia, Ninsaude, Clinicorp, TherapyNotes, SimplesAgenda).

## Tier 1 — Must-haves

### 1. Prontuario Eletronico (Clinical Session Notes)
Structured note-taking (SOAP, DAP, or free-form evolution notes) linked to each appointment. Therapists record session observations, treatment progress, and clinical impressions directly in the system. Template system for different note formats.

- **Competitors:** PsicoManager, PsicoPlanner, Ninsaude, TherapyNotes, SimplePractice, Jane App, SimplesAgenda
- **Impact:** Very High — most used feature after the calendar; near-universal in competitors
- **Effort:** Medium

### 2. Autoagendamento (Patient Self-Booking Portal)
Public-facing booking page where patients see available slots and schedule appointments without calling or messaging. Reduces receptionist workload and captures after-hours bookings. Shareable link per professional.

- **Competitors:** Doctoralia, PsicoManager, PsicoPlanner, Ninsaude, SimplePractice, Jane App, SimplesAgenda
- **Impact:** Very High
- **Effort:** Medium

### 3. Area do Paciente (Patient Portal)
Dedicated patient-facing interface (web/PWA) where patients can view upcoming appointments, reschedule/cancel, see invoices, download receipts, complete intake forms, and communicate with their therapist.

- **Competitors:** SimplePractice, TherapyNotes, Jane App, PsicoManager, Ninsaude
- **Impact:** High
- **Effort:** Medium

### 4. Business Analytics Dashboard & Reports
Visual dashboard showing KPIs: revenue over time, no-show rate, session count per professional, patient retention rate, average sessions per patient, occupancy rate, revenue per professional, accounts receivable aging. Exportable reports (PDF/CSV).

- **Competitors:** Clinicorp (50+ reports), Ninsaude, Doctoralia, SimplePractice, Jane App
- **Impact:** High
- **Effort:** Medium

### 5. NFS-e Integration (Nota Fiscal de Servico Eletronica)
Automated issuance of NFS-e (service invoices for tax purposes) integrated with the billing module. Essential for Brazilian clinics to stay tax-compliant. Can integrate via API with NFe.io, eNotas, or the national NFS-e system.

- **Competitors:** PsicoManager (PsicoBank), Ninsaude, Clinicorp, SimplesAgenda
- **Impact:** High (Brazil-specific, critical for compliance)
- **Effort:** Medium

---

## Tier 2 — Strong Differentiators

### 6. Fichas de Anamnese (Intake Forms & Digital Documents)
Customizable intake questionnaires, consent forms (LGPD, treatment consent), and anamnesis forms that patients fill out digitally before their first session. Auto-attached to the patient record. Supports e-signature.

- **Competitors:** SimplePractice, TherapyNotes, Jane App, PsicoManager, SimplesAgenda, Ninsaude
- **Impact:** High
- **Effort:** Low-Medium

### 7. Lista de Espera (Waitlist Management)
When a professional's schedule is full, prospective patients join a waitlist. When a slot opens (cancellation), the system automatically notifies waitlisted patients in priority order and lets them claim the slot.

- **Competitors:** Jane App, SimplePractice, Doctoralia
- **Impact:** Medium-High
- **Effort:** Low

### 8. Teleconsulta (Video Sessions)
Integrated video calling for online therapy sessions, launched directly from the appointment card. No need for external Zoom/Google Meet links. Can embed Daily.co, Twilio, or Jitsi.

- **Competitors:** SimplePractice, TherapyNotes, Jane App, PsicoPlanner, Ninsaude, Doctoralia
- **Impact:** High
- **Effort:** Medium-High

### 9. Outcome Measures & Progress Tracking
Standardized psychological questionnaires (PHQ-9 for depression, GAD-7 for anxiety, BDI, BAI, etc.) sent to patients periodically. Automatic scoring with visual graphs showing symptom progression over time. Helps demonstrate treatment effectiveness.

- **Competitors:** TherapyNotes, SimplePractice, Jane App
- **Impact:** Medium-High
- **Effort:** Medium

### 10. Secure In-App Messaging
LGPD-compliant messaging between therapist and patient within the platform, replacing informal WhatsApp conversations for clinical communications. Message history linked to the patient record.

- **Competitors:** SimplePractice, Jane App, TherapyNotes
- **Impact:** Medium
- **Effort:** Medium

---

## Tier 3 — Valuable Additions

### 11. Diario de Emocoes (Patient Mood/Emotion Diary)
Patients log their daily mood, emotions, and brief reflections between sessions via the patient portal. Therapists see the timeline in the patient record, enriching session preparation.

- **Competitors:** PsicoManager, standalone apps (Daylio, eMoods)
- **Impact:** Medium
- **Effort:** Low

### 12. CRM / Patient Acquisition Funnel
Track prospective patients from first contact through intake to active treatment. Manage leads, follow-ups, and conversion metrics. Automated follow-up messages for patients who inquired but never booked.

- **Competitors:** Clinicorp, Ninsaude (Apolo Funnel), Doctoralia
- **Impact:** Medium
- **Effort:** Medium

### 13. Return/Follow-up Alerts
Automatic alerts when a patient has not scheduled a follow-up within a configurable period after their last session. Helps reduce patient drop-off and ensures continuity of care.

- **Competitors:** Clinicorp, Ninsaude
- **Impact:** Medium
- **Effort:** Low

### 14. AI-Assisted Session Notes
AI that helps generate or complete session notes from brief therapist inputs, keywords, or voice dictation. Saves significant documentation time.

- **Competitors:** Jane App (AI Scribe), TherapyNotes, standalone tools (Upheal, Mentalyc)
- **Impact:** Medium
- **Effort:** Medium

### 15. Cobranca Automatica (Automated Payment Collection)
AutoPay / recurring billing where patients' cards are charged automatically for each session or on a monthly cycle. Reduces payment friction and accounts receivable.

- **Competitors:** SimplePractice (AutoPay), PsicoManager (PsicoBank with PIX/boleto/card)
- **Impact:** Medium
- **Effort:** Medium

### 16. Professional Public Profile / Directory
Public-facing profile page for each professional with photo, specialties, bio, and a booking button. Acts as a mini-website and improves SEO/discoverability.

- **Competitors:** Doctoralia (marketplace), SimplePractice (Therapy Finder), Ninsaude
- **Impact:** Low-Medium
- **Effort:** Low

### 17. Document Storage & File Attachments
Upload and attach files (PDFs, images, exam results, referral letters) to patient records. Organized document library per patient.

- **Competitors:** SimplePractice, TherapyNotes, Jane App, Ninsaude, PsicoManager
- **Impact:** Medium
- **Effort:** Low-Medium

### 18. Marketing Campaigns & Patient Communication
Bulk email/WhatsApp campaigns for patient re-engagement, health tips, seasonal reminders, or clinic announcements. Segmented by patient attributes.

- **Competitors:** Doctoralia, Clinicorp, Ninsaude
- **Impact:** Low-Medium
- **Effort:** Medium

---

## Recommended Implementation Order

Start with **Session Notes (#1)** — biggest gap, daily use by therapists. Then **Self-Booking (#2)** and **Patient Portal (#3)** to reduce operational load and match table-stakes for customer acquisition. **Analytics (#4)** and **NFS-e (#5)** close the deal for clinic owners evaluating the product.
