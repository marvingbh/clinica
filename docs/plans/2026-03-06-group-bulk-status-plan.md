# Group Session Bulk Status Actions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bulk status actions (Confirmar, Compareceu, Desmarcou, Faltou, Sem cobrança) to group sessions, updating all participants in a single transaction, with visual feedback in the agenda.

**Architecture:** New `PATCH /api/group-sessions/status` endpoint performs an atomic transaction updating all group appointment statuses. Frontend adds bulk action buttons in the GroupSessionSheet header with confirmation dialogs. Group session status is derived from participant uniformity.

**Tech Stack:** Next.js API route, Prisma transaction, React (GroupSessionSheet component)

---

### Task 1: Fix group-sessions GET to include cancelled appointments

The current GET `/api/group-sessions` filters out cancelled appointments (`status: { notIn: [...] }`), which means cancelled group sessions disappear from the agenda. Remove this filter so all statuses are visible.

**Files:**
- Modify: `src/app/api/group-sessions/route.ts:50`

**Step 1: Remove the status filter**

In the `where` clause, remove the line:
```typescript
status: { notIn: ["CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL"] },
```

So the where clause becomes:
```typescript
const where: Record<string, unknown> = {
  clinicId: user.clinicId,
  groupId: groupId ? groupId : { not: null },
}
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/group-sessions/route.ts
git commit -m "fix(groups): include cancelled appointments in group sessions API"
```

---

### Task 2: Create bulk status update API endpoint

**Files:**
- Create: `src/app/api/group-sessions/status/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { meetsMinAccess } from "@/lib/rbac"
import { createAuditLog } from "@/lib/rbac/audit"
import { AppointmentStatus } from "@prisma/client"
import { computeStatusUpdateData, shouldUpdateLastVisitAt } from "@/lib/appointments/status-transitions"

/**
 * PATCH /api/group-sessions/status
 * Bulk update all appointments in a group session to a new status.
 * Runs in a single transaction for atomicity.
 */
export const PATCH = withFeatureAuth(
  { feature: "agenda_own", minAccess: "WRITE" },
  async (req, { user }) => {
    const canSeeOthers = meetsMinAccess(user.permissions.agenda_others, "WRITE")

    let body: { groupId?: string; scheduledAt?: string; status?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Requisição inválida" }, { status: 400 })
    }

    const { groupId, scheduledAt, status: newStatus } = body

    if (!groupId || !scheduledAt || !newStatus) {
      return NextResponse.json(
        { error: "groupId, scheduledAt e status são obrigatórios" },
        { status: 400 }
      )
    }

    if (!Object.values(AppointmentStatus).includes(newStatus as AppointmentStatus)) {
      return NextResponse.json({ error: `Status "${newStatus}" não é válido` }, { status: 400 })
    }

    // Parse scheduledAt to get the day range
    const dayStart = new Date(scheduledAt.split("T")[0] + "T00:00:00")
    const dayEnd = new Date(scheduledAt.split("T")[0] + "T23:59:59.999")

    // Find all appointments for this group session
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        groupId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      include: {
        patient: { select: { id: true, name: true } },
        professionalProfile: { include: { user: { select: { name: true } } } },
        additionalProfessionals: { select: { professionalProfileId: true } },
      },
    })

    if (appointments.length === 0) {
      return NextResponse.json({ error: "Nenhum agendamento encontrado para esta sessão" }, { status: 404 })
    }

    // Check ownership if user cannot manage others
    if (!canSeeOthers && user.professionalProfileId) {
      const ownsAll = appointments.every(
        apt =>
          apt.professionalProfileId === user.professionalProfileId ||
          apt.additionalProfessionals.some(ap => ap.professionalProfileId === user.professionalProfileId)
      )
      if (!ownsAll) {
        return NextResponse.json({ error: "Você só pode atualizar seus próprios agendamentos" }, { status: 403 })
      }
    }

    const targetStatus = newStatus as AppointmentStatus
    const now = new Date()
    const updateData = computeStatusUpdateData(targetStatus, now)
    const isCancelAcordado = targetStatus === AppointmentStatus.CANCELADO_ACORDADO
    const isFinalizado = shouldUpdateLastVisitAt(targetStatus)

    const ipAddress = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
    const userAgent = req.headers.get("user-agent") ?? undefined

    // Execute all updates in a single transaction
    await prisma.$transaction(async (tx) => {
      for (const apt of appointments) {
        // Skip if already in target status
        if (apt.status === targetStatus) continue

        // Handle credit cleanup when leaving CANCELADO_ACORDADO
        if (apt.status === AppointmentStatus.CANCELADO_ACORDADO && targetStatus !== AppointmentStatus.CANCELADO_ACORDADO) {
          const credit = await tx.sessionCredit.findFirst({
            where: { originAppointmentId: apt.id, consumedByInvoiceId: null },
          })
          if (credit) {
            await tx.sessionCredit.delete({ where: { id: credit.id } })
          }
          await tx.appointment.update({
            where: { id: apt.id },
            data: { creditGenerated: false },
          })
        }

        // Update appointment status
        await tx.appointment.update({
          where: { id: apt.id },
          data: updateData,
        })

        // Create credit for CANCELADO_ACORDADO
        if (isCancelAcordado && apt.patientId && !apt.creditGenerated) {
          await tx.sessionCredit.create({
            data: {
              clinicId: user.clinicId,
              professionalProfileId: apt.professionalProfileId,
              patientId: apt.patientId,
              originAppointmentId: apt.id,
              reason: `Desmarcou - ${new Date(apt.scheduledAt).toLocaleDateString("pt-BR")}`,
            },
          })
          await tx.appointment.update({
            where: { id: apt.id },
            data: { creditGenerated: true },
          })
        }

        // Update patient lastVisitAt for FINALIZADO
        if (isFinalizado && apt.patientId) {
          await tx.patient.update({
            where: { id: apt.patientId },
            data: { lastVisitAt: apt.scheduledAt },
          })
        }

        // Audit log
        await createAuditLog({
          user,
          action: "APPOINTMENT_STATUS_CHANGED",
          entityType: "Appointment",
          entityId: apt.id,
          oldValues: { status: apt.status },
          newValues: { status: targetStatus },
          ipAddress,
          userAgent,
        }, tx)
      }
    })

    return NextResponse.json({
      success: true,
      updatedCount: appointments.filter(a => a.status !== targetStatus).length,
    })
  }
)
```

**Step 2: Check if `createAuditLog` supports transaction parameter**

Read `src/lib/rbac/audit.ts` to verify. If it doesn't accept a `tx` param, call `createAuditLog` outside the transaction (after the `$transaction` block) in a separate loop, or update the function signature.

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/group-sessions/status/route.ts
git commit -m "feat(groups): add bulk status update endpoint for group sessions"
```

---

### Task 3: Add frontend service function

**Files:**
- Modify: `src/app/agenda/services/appointmentService.ts`

**Step 1: Add the service function**

Add at the end of the file, before the last export:

```typescript
export async function updateGroupSessionStatus(
  groupId: string,
  scheduledAt: string,
  status: string
): Promise<{ success?: boolean; updatedCount?: number; error?: string }> {
  const response = await fetch("/api/group-sessions/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, scheduledAt, status }),
  })

  const result = await response.json()

  if (!response.ok) {
    return { error: result.error || "Erro ao atualizar status do grupo" }
  }

  return result
}
```

**Step 2: Export from barrel**

Check `src/app/agenda/services/index.ts` and add `updateGroupSessionStatus` to the exports if needed.

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/agenda/services/appointmentService.ts src/app/agenda/services/index.ts
git commit -m "feat(groups): add frontend service for bulk group status update"
```

---

### Task 4: Add bulk action buttons to GroupSessionSheet

**Files:**
- Modify: `src/app/agenda/components/GroupSessionSheet.tsx`

**Step 1: Import the new service and add bulk handler**

Add import:
```typescript
import { updateGroupSessionStatus } from "../services/appointmentService"
```

Add state and handler inside the component (after existing `handleUpdateStatus`):

```typescript
const [isBulkUpdating, setIsBulkUpdating] = useState(false)

const handleBulkUpdateStatus = async (newStatus: AppointmentStatus) => {
  const statusMessages: Record<string, string> = {
    CONFIRMADO: "Confirmar todos os participantes",
    FINALIZADO: "Marcar todos como compareceram",
    CANCELADO_ACORDADO: "Marcar todos como desmarcou",
    CANCELADO_FALTA: "Marcar todos como faltou",
    CANCELADO_PROFISSIONAL: "Marcar todos como sem cobrança",
  }
  const message = statusMessages[newStatus] || "Atualizar todos"
  if (!window.confirm(`${message}?`)) return

  setIsBulkUpdating(true)
  try {
    const result = await updateGroupSessionStatus(
      session!.groupId,
      session!.scheduledAt,
      newStatus
    )
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${result.updatedCount} participantes atualizados`)
      onStatusUpdated()
    }
  } catch {
    toast.error("Erro ao atualizar status do grupo")
  } finally {
    setIsBulkUpdating(false)
  }
}
```

**Step 2: Add derived session status badge**

Replace the `statusCounts` display in the header. When all participants share the same status, show a single large badge. Otherwise show the existing per-status counts.

After the `statusCounts` computation, add:
```typescript
const allSameStatus = session.participants.length > 0 &&
  session.participants.every(p => p.status === session.participants[0].status)
const derivedStatus = allSameStatus ? session.participants[0].status : null
```

In the header JSX, replace the status summary div:
```tsx
{/* Derived session status or per-status counts */}
<div className="flex flex-wrap gap-2 mt-3">
  {derivedStatus ? (
    <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
      STATUS_COLORS[derivedStatus as AppointmentStatus] || "bg-gray-100 text-gray-800"
    }`}>
      {STATUS_LABELS[derivedStatus as AppointmentStatus] || derivedStatus}
    </span>
  ) : (
    Object.entries(statusCounts).map(([status, count]) => (
      <span
        key={status}
        className={`text-xs px-2 py-1 rounded-full font-medium ${
          STATUS_COLORS[status as AppointmentStatus] || "bg-gray-100 text-gray-800"
        }`}
      >
        {count} {STATUS_LABELS[status as AppointmentStatus] || status}
      </span>
    ))
  )}
</div>
```

**Step 3: Add bulk action buttons in header**

After the status summary, still inside the purple header div, add:

```tsx
{/* Bulk actions */}
<div className="flex items-center gap-1.5 mt-3 flex-wrap">
  <button
    type="button"
    onClick={() => handleBulkUpdateStatus("CONFIRMADO")}
    disabled={isBulkUpdating}
    className="h-7 px-3 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
  >
    {isBulkUpdating ? "..." : "Confirmar Todos"}
  </button>
  <button
    type="button"
    onClick={() => handleBulkUpdateStatus("FINALIZADO")}
    disabled={isBulkUpdating}
    className="h-7 px-3 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
  >
    {isBulkUpdating ? "..." : "Todos Compareceram"}
  </button>
  <button
    type="button"
    onClick={() => handleBulkUpdateStatus("CANCELADO_ACORDADO")}
    disabled={isBulkUpdating}
    className="h-7 px-2 rounded border border-purple-200 dark:border-purple-700 text-[11px] font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
  >
    Desmarcou
  </button>
  <button
    type="button"
    onClick={() => handleBulkUpdateStatus("CANCELADO_FALTA")}
    disabled={isBulkUpdating}
    className="h-7 px-2 rounded border border-purple-200 dark:border-purple-700 text-[11px] font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
  >
    Faltou
  </button>
  <button
    type="button"
    onClick={() => handleBulkUpdateStatus("CANCELADO_PROFISSIONAL")}
    disabled={isBulkUpdating}
    className="h-7 px-2 rounded border border-purple-200 dark:border-purple-700 text-[11px] font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
  >
    Sem cobrança
  </button>
</div>
```

**Step 4: Disable individual buttons during bulk update**

Pass `isBulkUpdating` to disable individual participant buttons. Update the `isUpdating` check in the participant loop:
```typescript
const isUpdating = updatingId === participant.appointmentId || isBulkUpdating
```

**Step 5: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/app/agenda/components/GroupSessionSheet.tsx
git commit -m "feat(groups): add bulk status actions and derived status badge in GroupSessionSheet"
```

---

### Task 5: Add opacity for all-cancelled group sessions in agenda views

Currently group blocks only fade for all-FINALIZADO. Extend to also fade for all-cancelled.

**Files:**
- Modify: `src/app/agenda/weekly/components/GroupSessionBlock.tsx`
- Modify: `src/app/agenda/components/DailyOverviewGrid.tsx`

**Step 1: Update GroupSessionBlock.tsx**

Change `allFinalized` to a more general `allTerminal`:
```typescript
const TERMINAL_STATUSES = ["FINALIZADO", "CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL"]
const allTerminal = participantCount > 0 && session.participants.every(
  p => TERMINAL_STATUSES.includes(p.status)
)
const allCancelled = participantCount > 0 && session.participants.every(
  p => ["CANCELADO_ACORDADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL"].includes(p.status)
)
```

Update the opacity class:
```
${allCancelled ? "opacity-40" : allTerminal ? "opacity-60" : ""}
```

**Step 2: Update DailyOverviewGrid.tsx group session blocks**

Same pattern: replace `allFinalized` with `allTerminal` and `allCancelled` checks.

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/agenda/weekly/components/GroupSessionBlock.tsx src/app/agenda/components/DailyOverviewGrid.tsx
git commit -m "feat(groups): fade group session blocks for all-cancelled states"
```

---

### Task 6: Manual testing

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test bulk actions**

1. Open agenda, find a group session, click to open the sheet
2. Verify the derived status badge shows (e.g., "Agendado" when all are AGENDADO)
3. Click "Confirmar Todos" → confirm dialog → verify all participants update to CONFIRMADO
4. Click "Todos Compareceram" → verify all update to FINALIZADO
5. Verify the group block in the agenda fades (opacity)
6. Test cancel variants (Desmarcou, Faltou, Sem cobrança)
7. Test individual buttons still work alongside bulk

**Step 3: Test cancelled session visibility**

1. Bulk-cancel all participants in a group session
2. Verify the group session still appears in the agenda (not filtered out)
3. Verify it shows with reduced opacity

**Step 4: Final build check**

Run: `npm run build`
Expected: Build succeeds
