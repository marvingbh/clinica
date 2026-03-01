# Cancel Flow Rework Design

**Date:** 2026-03-01
**Status:** Approved

## Problem

The current cancel flow is split across two UI patterns:
- Quick-action buttons (Faltou / Desmarcou) fire instantly with no confirmation
- A separate "Cancelar Agendamento" button opens a dialog (CancelDialog) and sets CANCELADO_PROFISSIONAL

Users need to understand the billing impact of each cancel action before confirming. A third cancel option ("Cancelado s/ cobranca") is needed for sessions that should not appear on invoices or generate credits.

## Design

### 3 Unified Cancel Options

| Button | Status | Payment Message | Credit? |
|---|---|---|---|
| Faltou | CANCELADO_FALTA | Sessao sera cobrada normalmente na fatura | No |
| Desmarcou | CANCELADO_ACORDADO | Sessao gera credito para desconto em fatura futura | Yes |
| Cancelado s/ cobranca | CANCELADO_PROFISSIONAL | Sessao nao sera cobrada e nao aparecera na fatura | No |

### UI Changes

**Quick action grid (AppointmentEditor.tsx):**
- AGENDADO status: 5 buttons — Confirmar, Atendido, Faltou, Desmarcou, Cancelado s/ cobranca
- CONFIRMADO status: 4 buttons — Atendido, Faltou, Desmarcou, Cancelado s/ cobranca
- All 3 cancel buttons open a confirmation popup instead of firing instantly

**New component: CancelConfirmDialog**
- Replaces the old CancelDialog
- Shows: icon, title, payment impact message (highlighted), optional reason textarea
- Buttons: Confirmar / Voltar
- Receives: cancelType (faltou|desmarcou|sem_cobranca), onConfirm callback

**Remove:**
- Bottom "Cancelar Agendamento" red button
- Old CancelDialog component
- onCancelClick / canCancel prop chain through AppointmentEditor

**Terminal state toggles:**
- Keep existing Faltou <-> Desmarcou toggle
- Add transitions to/from Cancelado s/ cobranca (CANCELADO_PROFISSIONAL)

### Backend Changes

**Status transitions (status-transitions.ts):**
- Make CANCELADO_PROFISSIONAL non-terminal
- Allow: CANCELADO_PROFISSIONAL <-> CANCELADO_FALTA
- Allow: CANCELADO_PROFISSIONAL <-> CANCELADO_ACORDADO

**Status API (appointments/[id]/status/route.ts):**
- Handle transition CANCELADO_ACORDADO -> CANCELADO_PROFISSIONAL: delete unconsumed credit, set creditGenerated=false (same pattern as ACORDADO -> FALTA)
- Handle transition CANCELADO_PROFISSIONAL -> CANCELADO_ACORDADO: create credit, set creditGenerated=true (same pattern as FALTA -> ACORDADO)
- Handle transitions CANCELADO_PROFISSIONAL <-> CANCELADO_FALTA: no credit changes needed

**No changes needed:**
- Prisma schema (CANCELADO_PROFISSIONAL already exists)
- Invoice generator (already excludes all CANCELADO_* statuses)
- Credit generation logic for CANCELADO_ACORDADO (unchanged)

### Files Affected

| File | Change |
|---|---|
| src/lib/appointments/status-transitions.ts | Make CANCELADO_PROFISSIONAL non-terminal |
| src/lib/appointments/status-transitions.test.ts | Update tests |
| src/app/api/appointments/[id]/status/route.ts | Handle new transitions + credit logic |
| src/app/agenda/components/CancelConfirmDialog.tsx | New component |
| src/app/agenda/components/AppointmentEditor.tsx | Replace cancel flow with popup buttons |
| src/app/agenda/components/CancelDialog.tsx | Delete |
| src/app/agenda/hooks/useAppointmentActions.ts | Remove cancelAppointment, simplify |
| src/app/agenda/services/appointmentService.ts | Remove cancelAppointment service call |
