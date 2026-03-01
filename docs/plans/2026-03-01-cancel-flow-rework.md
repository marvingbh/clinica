# Cancel Flow Rework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the split cancel flow with 3 unified quick-action buttons (Faltou, Desmarcou, Cancelado s/ cobranca) each with a confirmation popup explaining billing impact.

**Architecture:** Modify status transitions to make CANCELADO_PROFISSIONAL non-terminal, add credit management for new transitions in the status API, create a new CancelConfirmDialog component, rewire AppointmentEditor to use it instead of the old CancelDialog, and clean up dead code.

**Tech Stack:** Next.js, React, Prisma, Vitest, TypeScript

---

### Task 1: Update Status Transitions (TDD)

**Files:**
- Modify: `src/lib/appointments/status-transitions.ts:36-38`
- Modify: `src/lib/appointments/status-transitions.test.ts:41-62`

**Step 1: Update the failing tests**

In `status-transitions.test.ts`, replace the test at line 41-44:

```typescript
// OLD: it("blocks transitions from CANCELADO_PROFISSIONAL (terminal)")
// Replace with:
it("allows CANCELADO_PROFISSIONAL → CANCELADO_FALTA", () => {
  expect(isValidTransition("CANCELADO_PROFISSIONAL", "CANCELADO_FALTA")).toBe(true)
})

it("allows CANCELADO_PROFISSIONAL → CANCELADO_ACORDADO", () => {
  expect(isValidTransition("CANCELADO_PROFISSIONAL", "CANCELADO_ACORDADO")).toBe(true)
})

it("blocks CANCELADO_PROFISSIONAL → non-cancel statuses", () => {
  expect(isValidTransition("CANCELADO_PROFISSIONAL", "AGENDADO")).toBe(false)
  expect(isValidTransition("CANCELADO_PROFISSIONAL", "CONFIRMADO")).toBe(false)
  expect(isValidTransition("CANCELADO_PROFISSIONAL", "FINALIZADO")).toBe(false)
})
```

Also update the ACORDADO/FALTA tests to include PROFISSIONAL transitions. Replace line 50-53:

```typescript
it("allows CANCELADO_ACORDADO → CANCELADO_FALTA and CANCELADO_PROFISSIONAL", () => {
  expect(isValidTransition("CANCELADO_ACORDADO", "CANCELADO_FALTA")).toBe(true)
  expect(isValidTransition("CANCELADO_ACORDADO", "CANCELADO_PROFISSIONAL")).toBe(true)
})

it("blocks CANCELADO_ACORDADO → non-cancel statuses", () => {
  expect(isValidTransition("CANCELADO_ACORDADO", "AGENDADO")).toBe(false)
  expect(isValidTransition("CANCELADO_ACORDADO", "FINALIZADO")).toBe(false)
})
```

Replace line 55-62:

```typescript
it("allows CANCELADO_FALTA → CANCELADO_ACORDADO and CANCELADO_PROFISSIONAL", () => {
  expect(isValidTransition("CANCELADO_FALTA", "CANCELADO_ACORDADO")).toBe(true)
  expect(isValidTransition("CANCELADO_FALTA", "CANCELADO_PROFISSIONAL")).toBe(true)
})

it("blocks CANCELADO_FALTA → non-cancel statuses", () => {
  expect(isValidTransition("CANCELADO_FALTA", "AGENDADO")).toBe(false)
  expect(isValidTransition("CANCELADO_FALTA", "FINALIZADO")).toBe(false)
})
```

Update the VALID_TRANSITIONS describe block (line 128-131):

```typescript
it("CANCELADO_PROFISSIONAL allows switching to other cancel types", () => {
  expect(VALID_TRANSITIONS.CANCELADO_PROFISSIONAL).toEqual(
    expect.arrayContaining(["CANCELADO_FALTA", "CANCELADO_ACORDADO"])
  )
  expect(VALID_TRANSITIONS.CANCELADO_PROFISSIONAL).toHaveLength(2)
})
```

Update STATUS_LABELS test to verify the new label (line 137):

```typescript
expect(STATUS_LABELS.CANCELADO_PROFISSIONAL).toBe("Cancelado (s/ cobranca)")
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/appointments/status-transitions.test.ts`
Expected: FAIL — transitions not yet updated

**Step 3: Update the implementation**

In `status-transitions.ts`, change line 36-38:

```typescript
CANCELADO_ACORDADO: [AppointmentStatus.CANCELADO_FALTA, AppointmentStatus.CANCELADO_PROFISSIONAL],
CANCELADO_FALTA: [AppointmentStatus.CANCELADO_ACORDADO, AppointmentStatus.CANCELADO_PROFISSIONAL],
CANCELADO_PROFISSIONAL: [AppointmentStatus.CANCELADO_FALTA, AppointmentStatus.CANCELADO_ACORDADO],
```

Update STATUS_LABELS line 47:

```typescript
CANCELADO_PROFISSIONAL: "Cancelado (s/ cobranca)",
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/appointments/status-transitions.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/appointments/status-transitions.ts src/lib/appointments/status-transitions.test.ts
git commit -m "feat: make CANCELADO_PROFISSIONAL non-terminal, allow cancel status interchange"
```

---

### Task 2: Update Status API for New Transitions

**Files:**
- Modify: `src/app/api/appointments/[id]/status/route.ts:140-244`

**Step 1: Add pre-check for ACORDADO → PROFISSIONAL (same as ACORDADO → FALTA)**

After line 155 (the existing ACORDADO→FALTA pre-check block), add:

```typescript
// Pre-check: block ACORDADO→PROFISSIONAL if credit was already consumed
if (currentStatus === AppointmentStatus.CANCELADO_ACORDADO && targetStatus === AppointmentStatus.CANCELADO_PROFISSIONAL) {
  const unconsumedCredit = await prisma.sessionCredit.findFirst({
    where: {
      originAppointmentId: existing.id,
      consumedByInvoiceId: null,
    },
  })
  if (!unconsumedCredit) {
    return NextResponse.json(
      { error: "Credito ja foi utilizado em uma fatura. Nao e possivel alterar para cancelado sem cobranca." },
      { status: 400 }
    )
  }
}
```

**Step 2: Add credit deletion for ACORDADO → PROFISSIONAL**

After the existing ACORDADO→FALTA credit deletion block (line 227), add:

```typescript
// Switching from ACORDADO to PROFISSIONAL: delete the unconsumed credit
if (currentStatus === AppointmentStatus.CANCELADO_ACORDADO && targetStatus === AppointmentStatus.CANCELADO_PROFISSIONAL) {
  const credit = await prisma.sessionCredit.findFirst({
    where: {
      originAppointmentId: existing.id,
      consumedByInvoiceId: null,
    },
  })
  if (credit) {
    await prisma.sessionCredit.delete({ where: { id: credit.id } })
    await prisma.appointment.update({
      where: { id: existing.id },
      data: { creditGenerated: false },
    })
  }
}
```

**Step 3: Add credit creation for PROFISSIONAL → ACORDADO**

After the existing FALTA→ACORDADO credit creation block (line 244), add:

```typescript
// Switching from PROFISSIONAL to ACORDADO: create credit
if (currentStatus === AppointmentStatus.CANCELADO_PROFISSIONAL && targetStatus === AppointmentStatus.CANCELADO_ACORDADO && existing.patientId) {
  await prisma.sessionCredit.create({
    data: {
      clinicId: user.clinicId,
      professionalProfileId: existing.professionalProfileId,
      patientId: existing.patientId,
      originAppointmentId: existing.id,
      reason: `Desmarcou - ${new Date(existing.scheduledAt).toLocaleDateString("pt-BR")}`,
    },
  })
  await prisma.appointment.update({
    where: { id: existing.id },
    data: { creditGenerated: true },
  })
}
```

Note: FALTA ↔ PROFISSIONAL needs no credit logic (neither has credits).

**Step 4: Run build to verify no type errors**

Run: `npx vitest run src/lib/appointments/status-transitions.test.ts`
Expected: PASS (API changes are runtime, transition tests already cover the logic)

**Step 5: Commit**

```bash
git add src/app/api/appointments/[id]/status/route.ts
git commit -m "feat: handle credit management for CANCELADO_PROFISSIONAL transitions"
```

---

### Task 3: Create CancelConfirmDialog Component

**Files:**
- Create: `src/app/agenda/components/CancelConfirmDialog.tsx`

**Step 1: Create the new component**

```typescript
"use client"

import { useState } from "react"
import { Dialog } from "./Sheet"
import { AlertTriangleIcon } from "@/shared/components/ui/icons"

export type CancelVariant = "faltou" | "desmarcou" | "sem_cobranca"

const CANCEL_CONFIG: Record<CancelVariant, {
  title: string
  status: string
  description: string
  paymentMessage: string
  paymentColor: string
  buttonLabel: string
  buttonColor: string
}> = {
  faltou: {
    title: "Marcar como Falta",
    status: "CANCELADO_FALTA",
    description: "O paciente nao compareceu a esta sessao.",
    paymentMessage: "Sessao sera cobrada normalmente na fatura.",
    paymentColor: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
    buttonLabel: "Confirmar Falta",
    buttonColor: "bg-amber-600 hover:bg-amber-700",
  },
  desmarcou: {
    title: "Marcar como Desmarcou",
    status: "CANCELADO_ACORDADO",
    description: "O paciente desmarcou a sessao.",
    paymentMessage: "Sessao gera credito para desconto em fatura futura.",
    paymentColor: "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300",
    buttonLabel: "Confirmar Desmarcou",
    buttonColor: "bg-teal-600 hover:bg-teal-700",
  },
  sem_cobranca: {
    title: "Cancelar sem Cobranca",
    status: "CANCELADO_PROFISSIONAL",
    description: "A sessao sera cancelada sem nenhuma cobranca.",
    paymentMessage: "Sessao nao sera cobrada e nao aparecera na fatura.",
    paymentColor: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400",
    buttonLabel: "Confirmar Cancelamento",
    buttonColor: "bg-red-600 hover:bg-red-700",
  },
}

interface CancelConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  variant: CancelVariant
  onConfirm: (status: string, reason: string) => Promise<void>
}

export function CancelConfirmDialog({ isOpen, onClose, variant, onConfirm }: CancelConfirmDialogProps) {
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const config = CANCEL_CONFIG[variant]

  function handleClose() {
    setReason("")
    onClose()
  }

  async function handleConfirm() {
    setIsSubmitting(true)
    try {
      await onConfirm(config.status, reason.trim())
      handleClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title={config.title}>
      <p className="text-sm text-muted-foreground mb-4">
        {config.description}
      </p>

      {/* Payment impact message */}
      <div className={`p-3 rounded-xl border text-sm font-medium mb-4 flex items-start gap-2.5 ${config.paymentColor}`}>
        <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{config.paymentMessage}</span>
      </div>

      {/* Optional reason */}
      <div className="mb-4">
        <label htmlFor="cancelReason" className="block text-sm font-medium text-foreground mb-1.5">
          Motivo (opcional)
        </label>
        <textarea
          id="cancelReason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Informe o motivo..."
          className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring transition-colors resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={isSubmitting}
          className="flex-1 h-11 rounded-xl border border-input bg-background text-foreground font-medium text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting}
          className={`flex-1 h-11 rounded-xl text-white font-medium text-sm transition-colors disabled:opacity-50 ${config.buttonColor}`}
        >
          {isSubmitting ? "Processando..." : config.buttonLabel}
        </button>
      </div>
    </Dialog>
  )
}
```

**Step 2: Export from barrel**

In `src/app/agenda/components/index.ts`, replace the CancelDialog export (line 6):

```typescript
export { CancelConfirmDialog } from "./CancelConfirmDialog"
export type { CancelVariant } from "./CancelConfirmDialog"
```

**Step 3: Commit**

```bash
git add src/app/agenda/components/CancelConfirmDialog.tsx src/app/agenda/components/index.ts
git commit -m "feat: add CancelConfirmDialog with payment impact messages"
```

---

### Task 4: Rewire AppointmentEditor Quick Action Buttons

**Files:**
- Modify: `src/app/agenda/components/AppointmentEditor.tsx:430-525` (quick actions) and `758-778` (danger zone)

**Step 1: Add state and handler for the confirm dialog**

Add import at top of file:

```typescript
import { CancelConfirmDialog, CancelVariant } from "./CancelConfirmDialog"
```

Remove imports that are no longer needed: `BanIcon` (if only used in the removed cancel button).

Inside the `AppointmentEditor` component function, add state:

```typescript
const [cancelVariant, setCancelVariant] = useState<CancelVariant | null>(null)
```

**Step 2: Replace the quick action cancel buttons**

Replace the AGENDADO 4-column grid (lines 432-468) with a layout that has 2 rows:
- Row 1 (2 cols): Confirmar, Atendido
- Row 2 (3 cols): Faltou, Desmarcou, S/ cobranca

```tsx
{canMarkStatus && isConsulta && appointment.status === "AGENDADO" && (
  <div className="space-y-2">
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onUpdateStatus("CONFIRMADO", "Consulta confirmada com sucesso")} disabled={isUpdatingStatus}
        className="h-11 rounded-xl bg-blue-600 text-white font-medium text-sm flex items-center justify-center gap-1.5 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-50">
        <CheckCircleIcon className="w-4 h-4" />
        {isUpdatingStatus ? "..." : "Confirmar"}
      </button>
      <button type="button" onClick={() => onUpdateStatus("FINALIZADO", "Consulta finalizada com sucesso")} disabled={isUpdatingStatus}
        className="h-11 rounded-xl bg-emerald-600 text-white font-medium text-sm flex items-center justify-center hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50">
        {isUpdatingStatus ? "..." : "Atendido"}
      </button>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <button type="button" onClick={() => setCancelVariant("faltou")} disabled={isUpdatingStatus}
        className="h-11 rounded-xl border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-medium text-sm flex items-center justify-center hover:bg-amber-50 dark:hover:bg-amber-950/30 active:scale-[0.98] transition-all disabled:opacity-50">
        Faltou
      </button>
      <button type="button" onClick={() => setCancelVariant("desmarcou")} disabled={isUpdatingStatus}
        className="h-11 rounded-xl border-2 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 font-medium text-sm flex items-center justify-center hover:bg-teal-50 dark:hover:bg-teal-950/30 active:scale-[0.98] transition-all disabled:opacity-50">
        Desmarcou
      </button>
      <button type="button" onClick={() => setCancelVariant("sem_cobranca")} disabled={isUpdatingStatus}
        className="h-11 rounded-xl border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 font-medium text-sm flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-[0.98] transition-all disabled:opacity-50">
        S/ cobranca
      </button>
    </div>
  </div>
)}
```

Do the same for the CONFIRMADO section (lines 471-498) — replace 3-col grid with:
- Row 1 (1 col): Atendido
- Row 2 (3 cols): Faltou, Desmarcou, S/ cobranca

```tsx
{canMarkStatus && isConsulta && appointment.status === "CONFIRMADO" && (
  <div className="space-y-2">
    <button type="button" onClick={() => onUpdateStatus("FINALIZADO", "Consulta finalizada com sucesso")} disabled={isUpdatingStatus}
      className="w-full h-11 rounded-xl bg-emerald-600 text-white font-medium text-sm flex items-center justify-center hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50">
      {isUpdatingStatus ? "..." : "Atendido"}
    </button>
    <div className="grid grid-cols-3 gap-2">
      <button type="button" onClick={() => setCancelVariant("faltou")} disabled={isUpdatingStatus}
        className="h-11 rounded-xl border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 font-medium text-sm flex items-center justify-center hover:bg-amber-50 dark:hover:bg-amber-950/30 active:scale-[0.98] transition-all disabled:opacity-50">
        Faltou
      </button>
      <button type="button" onClick={() => setCancelVariant("desmarcou")} disabled={isUpdatingStatus}
        className="h-11 rounded-xl border-2 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 font-medium text-sm flex items-center justify-center hover:bg-teal-50 dark:hover:bg-teal-950/30 active:scale-[0.98] transition-all disabled:opacity-50">
        Desmarcou
      </button>
      <button type="button" onClick={() => setCancelVariant("sem_cobranca")} disabled={isUpdatingStatus}
        className="h-11 rounded-xl border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 font-medium text-sm flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-[0.98] transition-all disabled:opacity-50">
        S/ cobranca
      </button>
    </div>
  </div>
)}
```

**Step 3: Update terminal state area (lines 528-596)**

Add CANCELADO_PROFISSIONAL message in the terminal state section:

```tsx
{appointment.status === "CANCELADO_PROFISSIONAL" && (
  <>
    Sessao cancelada sem cobranca.
    {appointment.cancellationReason && (
      <span className="block mt-1 text-xs opacity-75">
        Motivo: {appointment.cancellationReason}
      </span>
    )}
  </>
)}
```

Update the toggle buttons section (lines 569-593) to handle all 3 cancel statuses. Replace with:

```tsx
{canMarkStatus && isConsulta && (
  appointment.status === "CANCELADO_ACORDADO" ||
  appointment.status === "CANCELADO_FALTA" ||
  appointment.status === "CANCELADO_PROFISSIONAL"
) && (
  <div className="mt-2 flex flex-wrap gap-2">
    {appointment.status !== "CANCELADO_FALTA" && (
      <button type="button"
        onClick={() => onUpdateStatus("CANCELADO_FALTA", "Status alterado para falta")}
        disabled={isUpdatingStatus}
        className="h-8 px-3 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-medium hover:bg-amber-50 dark:hover:bg-amber-950/30 active:scale-[0.98] transition-all disabled:opacity-50">
        {isUpdatingStatus ? "..." : "Alterar para Falta"}
      </button>
    )}
    {appointment.status !== "CANCELADO_ACORDADO" && (
      <button type="button"
        onClick={() => onUpdateStatus("CANCELADO_ACORDADO", "Status alterado para desmarcou")}
        disabled={isUpdatingStatus}
        className="h-8 px-3 rounded-lg border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 text-xs font-medium hover:bg-teal-50 dark:hover:bg-teal-950/30 active:scale-[0.98] transition-all disabled:opacity-50">
        {isUpdatingStatus ? "..." : "Alterar para Desmarcou"}
      </button>
    )}
    {appointment.status !== "CANCELADO_PROFISSIONAL" && (
      <button type="button"
        onClick={() => onUpdateStatus("CANCELADO_PROFISSIONAL", "Status alterado para cancelado sem cobranca")}
        disabled={isUpdatingStatus}
        className="h-8 px-3 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-[0.98] transition-all disabled:opacity-50">
        {isUpdatingStatus ? "..." : "Alterar p/ s/ cobranca"}
      </button>
    )}
  </div>
)}
```

**Step 4: Remove the "Cancelar Agendamento" button from the danger zone (lines 758-768)**

Delete the `canCancel` button block entirely. Keep only the "Excluir permanentemente" button.

**Step 5: Remove canCancel/onCancelClick props from OccurrenceTabContent**

Remove from the interface (line ~368) and function params (line ~415):
- `canCancel`
- `onCancelClick`

**Step 6: Add CancelConfirmDialog render inside OccurrenceTabContent**

Before the `{/* API Error */}` block, add:

```tsx
{cancelVariant && (
  <CancelConfirmDialog
    isOpen={!!cancelVariant}
    onClose={() => setCancelVariant(null)}
    variant={cancelVariant}
    onConfirm={async (status, reason) => {
      await onUpdateStatus(status, `Status alterado com sucesso`)
    }}
  />
)}
```

Note: `onUpdateStatus` is already a prop — reuse it. The reason field from the popup should be passed through. We need to extend the `onUpdateStatus` signature to optionally accept a reason. See next step.

**Step 7: Extend onUpdateStatus to accept optional reason**

In `AppointmentEditor.tsx`, update the prop type:

```typescript
onUpdateStatus: (status: string, message: string, reason?: string) => Promise<void>
```

In the CancelConfirmDialog onConfirm, pass reason:

```tsx
onConfirm={async (status, reason) => {
  await onUpdateStatus(status, "Status alterado com sucesso", reason || undefined)
}}
```

**Step 8: Commit**

```bash
git add src/app/agenda/components/AppointmentEditor.tsx
git commit -m "feat: replace cancel buttons with confirmation popups in AppointmentEditor"
```

---

### Task 5: Update useAppointmentActions Hook and Status API for Reason

**Files:**
- Modify: `src/app/agenda/hooks/useAppointmentActions.ts`
- Modify: `src/app/api/appointments/[id]/status/route.ts`
- Modify: `src/app/agenda/services/appointmentService.ts`

**Step 1: Update the service to send reason**

In `appointmentService.ts`, update `updateStatus`:

```typescript
export async function updateStatus(
  id: string,
  status: string,
  reason?: string
): Promise<UpdateStatusResponse> {
  const response = await fetch(`/api/appointments/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, cancellationReason: reason }),
  })
  // ... rest unchanged
}
```

**Step 2: Update the hook to pass reason through**

In `useAppointmentActions.ts`, update `handleUpdateStatus`:

```typescript
const handleUpdateStatus = useCallback(
  async (newStatus: string, successMessage: string, reason?: string) => {
    if (!selectedAppointment) return

    setIsUpdatingStatus(true)
    try {
      const result = await updateStatus(selectedAppointment.id, newStatus, reason)
      // ... rest unchanged
```

Update the return type `handleUpdateStatus` signature:

```typescript
handleUpdateStatus: (newStatus: string, successMessage: string, reason?: string) => Promise<void>
```

**Step 3: Update the status API route to accept and save cancellationReason**

In `src/app/api/appointments/[id]/status/route.ts`, extract `cancellationReason` from body (line 43):

```typescript
const { status: newStatus, cancellationReason } = body
```

In the appointment update (line 162-164), include cancellationReason when it's a cancel transition:

```typescript
const isCancelStatus = [
  "CANCELADO_FALTA", "CANCELADO_ACORDADO", "CANCELADO_PROFISSIONAL"
].includes(targetStatus)

const updatedAppointment = await prisma.appointment.update({
  where: { id: params.id },
  data: {
    ...updateData,
    ...(isCancelStatus && cancellationReason ? { cancellationReason } : {}),
  },
  // ... include unchanged
})
```

**Step 4: Commit**

```bash
git add src/app/agenda/hooks/useAppointmentActions.ts src/app/agenda/services/appointmentService.ts src/app/api/appointments/[id]/status/route.ts
git commit -m "feat: pass cancellation reason through status update flow"
```

---

### Task 6: Update Parent Pages (Daily + Weekly)

**Files:**
- Modify: `src/app/agenda/page.tsx`
- Modify: `src/app/agenda/weekly/page.tsx`

**Step 1: Update daily agenda page**

In `src/app/agenda/page.tsx`:

1. Remove `CancelDialog` import (line 15), add `CancelConfirmDialog` if not already
2. Remove `canCancelAppointment` import (line 8)
3. Remove `isCancelDialogOpen`, `setIsCancelDialogOpen`, `handleCancelAppointment` from destructured hook (lines 188-190)
4. Remove the `canCancel` and `onCancelClick` props from `AppointmentEditor` (lines 386-387)
5. Remove the `<CancelDialog>` JSX block (lines 400-405)
6. Pass `reason` through `handleUpdateStatus` — it's already in the hook

**Step 2: Update weekly agenda page**

In `src/app/agenda/weekly/page.tsx`:

1. Remove `CancelDialog` import (line 43), `canCancelAppointment` import (line 35)
2. Remove `isCancelDialogOpen` state (line 105)
3. Remove `handleCancelAppointment` function (lines 403-428)
4. Remove `canCancel`/`onCancelClick` props from `AppointmentEditor` (lines 864-865)
5. Remove `<CancelDialog>` JSX block (lines 879-884)

**Step 3: Commit**

```bash
git add src/app/agenda/page.tsx src/app/agenda/weekly/page.tsx
git commit -m "feat: remove CancelDialog from agenda pages, cancel flow now in AppointmentEditor"
```

---

### Task 7: Clean Up Dead Code

**Files:**
- Delete: `src/app/agenda/components/CancelDialog.tsx`
- Modify: `src/app/agenda/components/index.ts` (remove CancelDialog export, already done in Task 3)
- Modify: `src/app/agenda/hooks/useAppointmentActions.ts` (remove cancel dialog state)
- Modify: `src/app/agenda/lib/utils.ts` (remove `canCancelAppointment`)
- Modify: `src/app/agenda/lib/utils.test.ts` (remove `canCancelAppointment` tests)

**Step 1: Delete CancelDialog.tsx**

```bash
rm src/app/agenda/components/CancelDialog.tsx
```

**Step 2: Remove `canCancelAppointment` from utils.ts**

Remove the function at lines 95-101 and its export.

**Step 3: Remove tests for canCancelAppointment from utils.test.ts**

Remove the describe block for `canCancelAppointment`.

**Step 4: Clean up useAppointmentActions.ts**

Remove:
- `isCancelDialogOpen` state and setter (line 50)
- `handleCancelAppointment` callback (lines 57-86)
- `cancelAppointment` import from services (line 5)
- These from the return object (lines 211-213)
- These from the interface (lines 21-23)

**Step 5: Remove `cancelAppointment` from services if unused elsewhere**

Check `src/app/agenda/services/appointmentService.ts` — remove the `cancelAppointment` function and its types if not imported anywhere else.

**Step 6: Run tests**

Run: `npm run test`
Expected: ALL PASS

**Step 7: Run build**

Run: `npm run build`
Expected: Build succeeds with no type errors

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove CancelDialog and dead cancel code"
```

---

### Task 8: Update Constants Labels

**Files:**
- Modify: `src/app/agenda/lib/constants.ts`

**Step 1: Update STATUS_LABELS and STATUS_COLORS if they exist in constants**

Check if `STATUS_LABELS` in `src/app/agenda/lib/constants.ts` has `CANCELADO_PROFISSIONAL`. If so, update the label to "Cancelado (s/ cobranca)".

Also check `STATUS_COLORS` — ensure `CANCELADO_PROFISSIONAL` has appropriate styling (red tones to match the "sem cobranca" theme).

**Step 2: Commit**

```bash
git add src/app/agenda/lib/constants.ts
git commit -m "feat: update CANCELADO_PROFISSIONAL label to 'Cancelado (s/ cobranca)'"
```
