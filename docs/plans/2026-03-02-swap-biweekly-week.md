# Swap Biweekly Week Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Trocar semana quinzenal" feature that shifts all biweekly appointments by +7 days (swapping on/off weeks), with conflict checking and choice of future-only or all appointments.

**Architecture:** Pure domain function `calculateBiweeklySwapDates()` in `src/lib/appointments/recurrence.ts` handles date math. The existing PATCH `/api/appointments/recurrences/[id]` endpoint gets a new `swapBiweeklyWeek: true` field. The UI adds a button + confirmation dialog in `RecurrenceTabContent.tsx`, visible only for BIWEEKLY recurrences.

**Tech Stack:** TypeScript, Vitest, Next.js API routes, Prisma raw SQL, React

---

### Task 1: Add `calculateBiweeklySwapDates` pure function — write failing test

**Files:**
- Test: `src/lib/appointments/recurrence.test.ts`

**Step 1: Write the failing test**

Add to the end of `recurrence.test.ts`:

```typescript
describe("calculateBiweeklySwapDates", () => {
  it("shifts each appointment forward by 7 days", () => {
    const appointments = [
      {
        id: "apt-1",
        scheduledAt: new Date("2026-03-03T08:45:00"),
        endAt: new Date("2026-03-03T09:35:00"),
      },
      {
        id: "apt-2",
        scheduledAt: new Date("2026-03-17T08:45:00"),
        endAt: new Date("2026-03-17T09:35:00"),
      },
    ]
    const result = calculateBiweeklySwapDates(appointments)
    expect(result).toHaveLength(2)
    expect(result[0].newScheduledAt).toEqual(new Date("2026-03-10T08:45:00"))
    expect(result[0].newEndAt).toEqual(new Date("2026-03-10T09:35:00"))
    expect(result[1].newScheduledAt).toEqual(new Date("2026-03-24T08:45:00"))
    expect(result[1].newEndAt).toEqual(new Date("2026-03-24T09:35:00"))
  })

  it("preserves appointment IDs in results", () => {
    const appointments = [
      { id: "apt-abc", scheduledAt: new Date("2026-03-03T10:00:00"), endAt: new Date("2026-03-03T10:50:00") },
    ]
    const result = calculateBiweeklySwapDates(appointments)
    expect(result[0].id).toBe("apt-abc")
  })

  it("returns empty array for empty input", () => {
    expect(calculateBiweeklySwapDates([])).toEqual([])
  })
})
```

Also add `calculateBiweeklySwapDates` to the import at the top of the file.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/appointments/recurrence.test.ts`
Expected: FAIL — `calculateBiweeklySwapDates` is not exported

---

### Task 2: Implement `calculateBiweeklySwapDates` — make test pass

**Files:**
- Modify: `src/lib/appointments/recurrence.ts` (add function at end, before `isOffWeek`)
- Modify: `src/lib/appointments/index.ts` (add to exports)

**Step 1: Write minimal implementation**

Add to `src/lib/appointments/recurrence.ts` (before the `isOffWeek` function, around line 366):

```typescript
export interface BiweeklySwapDate {
  id: string
  newScheduledAt: Date
  newEndAt: Date
}

/**
 * Calculates new dates for a biweekly week swap.
 * Shifts each appointment by +7 days, flipping on/off weeks.
 */
export function calculateBiweeklySwapDates(
  appointments: Array<{ id: string; scheduledAt: Date; endAt: Date }>
): BiweeklySwapDate[] {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  return appointments.map(apt => ({
    id: apt.id,
    newScheduledAt: new Date(apt.scheduledAt.getTime() + msPerWeek),
    newEndAt: new Date(apt.endAt.getTime() + msPerWeek),
  }))
}
```

Add to `src/lib/appointments/index.ts` exports from `"./recurrence"`:

```typescript
  calculateBiweeklySwapDates,
  type BiweeklySwapDate,
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run src/lib/appointments/recurrence.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/appointments/recurrence.ts src/lib/appointments/recurrence.test.ts src/lib/appointments/index.ts
git commit -m "feat: add calculateBiweeklySwapDates pure function with tests"
```

---

### Task 3: Add `swapBiweeklyWeek` to the PATCH endpoint — backend logic

**Files:**
- Modify: `src/app/api/appointments/recurrences/[id]/route.ts`

**Step 1: Add `swapBiweeklyWeek` to the zod schema**

In `route.ts`, add to `updateRecurrenceSchema` (line ~23):

```typescript
  swapBiweeklyWeek: z.boolean().optional(),
  swapScope: z.enum(["future", "all"]).optional(), // "future" = only future appointments, "all" = all appointments
```

**Step 2: Add swap handling logic after the `isDayOfWeekChange` block**

After the day-of-week change block (around line 362) and before the recurrence type change block, add a new block for biweekly swap. The logic is:

1. Validate: recurrence must be BIWEEKLY type
2. Select appointments based on `swapScope`: if "future" only get future active appointments, if "all" get all active appointments (including past)
3. Call `calculateBiweeklySwapDates()` on selected appointments
4. Run `checkConflictsBulk()` on new dates (exclude current appointment IDs)
5. If conflicts, return 409 with `code: "BIWEEKLY_SWAP_CONFLICTS"`
6. Populate a `swapShiftedAppointments` array (same shape as `dayShiftedAppointments`)

Inside the `$transaction`:
- Bulk update appointment dates via raw SQL (same pattern as day-of-week shifts)
- Update recurrence `startDate` by +7 days

Add `calculateBiweeklySwapDates` to the imports at top of file:

```typescript
import { calculateDayShiftedDates, calculateBiweeklySwapDates } from "@/lib/appointments/recurrence"
```

**Full implementation for the swap block** (add after the `isDayOfWeekChange` block, before `isRecurrenceTypeChange`):

```typescript
    // Handle biweekly week swap
    const isSwapBiweeklyWeek = body.swapBiweeklyWeek === true
    const swapShiftedAppointments: Array<{
      id: string
      newScheduledAt: Date
      newEndAt: Date
    }> = []

    if (isSwapBiweeklyWeek) {
      if (recurrence.recurrenceType !== RecurrenceType.BIWEEKLY) {
        return NextResponse.json(
          { error: "Trocar semana so e possivel para recorrencias quinzenais" },
          { status: 400 }
        )
      }

      // Get appointments based on scope
      const swapScope = body.swapScope || "future"
      const appointmentsToSwap = swapScope === "all"
        ? await prisma.appointment.findMany({
            where: {
              recurrenceId: recurrenceId,
              status: { in: [AppointmentStatus.AGENDADO, AppointmentStatus.CONFIRMADO, AppointmentStatus.FINALIZADO] },
            },
            select: { id: true, scheduledAt: true, endAt: true },
          })
        : recurrence.appointments // already fetched (future only, AGENDADO/CONFIRMADO)

      if (appointmentsToSwap.length === 0) {
        return NextResponse.json(
          { error: "Nenhum agendamento encontrado para trocar" },
          { status: 400 }
        )
      }

      // Calculate new dates
      const swappedDates = calculateBiweeklySwapDates(appointmentsToSwap)

      // Bulk conflict check (exclude the appointments being moved)
      const effectiveAdditionalProfIds = body.additionalProfessionalIds
        ?? recurrence.additionalProfessionals.map(ap => ap.professionalProfileId)
      const bulkResult = await checkConflictsBulk({
        professionalProfileId: recurrence.professionalProfileId,
        dates: swappedDates.map(d => ({ scheduledAt: d.newScheduledAt, endAt: d.newEndAt })),
        excludeAppointmentIds: appointmentsToSwap.map(a => a.id),
        additionalProfessionalIds: effectiveAdditionalProfIds,
      })

      if (bulkResult.conflicts.length > 0) {
        const conflicts = bulkResult.conflicts.map(c => ({
          date: swappedDates[c.index].newScheduledAt.toLocaleDateString("pt-BR"),
          conflictsWith: c.conflictingAppointment.patientName || c.conflictingAppointment.title || "outro compromisso",
        }))

        return NextResponse.json(
          {
            error: "Conflitos de horario encontrados ao trocar a semana quinzenal",
            code: "BIWEEKLY_SWAP_CONFLICTS",
            conflicts,
          },
          { status: 409 }
        )
      }

      // No conflicts — populate swap shifted appointments
      for (const swapped of swappedDates) {
        swapShiftedAppointments.push({
          id: swapped.id,
          newScheduledAt: swapped.newScheduledAt,
          newEndAt: swapped.newEndAt,
        })
      }
    }
```

**Inside the `$transaction` block**, after the day-of-week bulk update (after `updatedAppointmentsCount = dayShiftedAppointments.length`), add:

```typescript
      // If biweekly week swap, bulk update appointments + shift startDate
      if (isSwapBiweeklyWeek && swapShiftedAppointments.length > 0) {
        const values = swapShiftedAppointments.map(apt =>
          `('${apt.id}'::text, '${apt.newScheduledAt.toISOString()}'::timestamptz, '${apt.newEndAt.toISOString()}'::timestamptz)`
        ).join(", ")

        await tx.$executeRawUnsafe(`
          UPDATE "Appointment" SET
            "scheduledAt" = v.new_start,
            "endAt" = v.new_end
          FROM (VALUES ${values}) AS v(id, new_start, new_end)
          WHERE "Appointment".id = v.id
        `)

        // Shift startDate by +7 days
        const currentStartDate = recurrence.startDate
        const newStartDate = new Date(currentStartDate.getTime() + 7 * 24 * 60 * 60 * 1000)
        await tx.appointmentRecurrence.update({
          where: { id: recurrenceId },
          data: { startDate: newStartDate },
        })

        updatedAppointmentsCount = swapShiftedAppointments.length
      }
```

**Update the "no changes" check** — make sure `isSwapBiweeklyWeek` is considered:

```typescript
    if (Object.keys(updateData).length === 0 && !hasAdditionalProfChange && !isSwapBiweeklyWeek) {
```

**Update the audit log `newValues`** to include swap info:

```typescript
      newValues: {
        ...updateData,
        applyTo: body.applyTo,
        swapBiweeklyWeek: body.swapBiweeklyWeek,
        swapScope: body.swapScope,
        updatedAppointmentsCount,
        deletedAppointmentsCount,
      },
```

**Update the response message**:

```typescript
    if (isSwapBiweeklyWeek) {
      message = `Semana quinzenal trocada com sucesso. ${updatedAppointmentsCount} agendamento(s) atualizado(s).`
    } else if (deletedAppointmentsCount > 0) {
```

**Step 3: Run linter to check for issues**

Run: `npm run lint`

**Step 4: Commit**

```bash
git add src/app/api/appointments/recurrences/[id]/route.ts
git commit -m "feat: add biweekly week swap to recurrence PATCH endpoint"
```

---

### Task 4: Add "Trocar semana quinzenal" UI to RecurrenceTabContent

**Files:**
- Modify: `src/app/agenda/components/RecurrenceTabContent.tsx`

**Step 1: Add state and handler for swap dialog**

After the finalize dialog state (line ~41), add:

```typescript
  // Swap biweekly week dialog state
  const [isSwapDialogOpen, setIsSwapDialogOpen] = useState(false)
  const [swapScope, setSwapScope] = useState<"future" | "all">("future")
  const [isSwapping, setIsSwapping] = useState(false)
```

**Step 2: Add the handleSwapBiweeklyWeek function**

After `handleFinalize` function (around line 178), add:

```typescript
  async function handleSwapBiweeklyWeek() {
    if (!appointment?.recurrence) return

    setIsSwapping(true)

    try {
      const response = await fetch(
        `/api/appointments/recurrences/${appointment.recurrence.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            swapBiweeklyWeek: true,
            swapScope,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        if (result.code === "BIWEEKLY_SWAP_CONFLICTS" && result.conflicts) {
          const conflictDates = result.conflicts.map((c: { date: string; conflictsWith: string }) =>
            `${c.date} (conflito com ${c.conflictsWith})`
          ).join(", ")
          toast.error(`Conflitos encontrados: ${conflictDates}`)
        } else {
          toast.error(result.error || "Erro ao trocar semana quinzenal")
        }
        return
      }

      toast.success(result.message || "Semana quinzenal trocada com sucesso")
      setIsSwapDialogOpen(false)
      onSave()
      onClose()
    } catch {
      toast.error("Erro ao trocar semana quinzenal")
    } finally {
      setIsSwapping(false)
    }
  }
```

**Step 3: Add the swap button in the JSX**

After the "Dia da semana" section (after the day-of-week warning div, around line 247) and before the "Time + Duration + End Time" section, add:

```tsx
        {/* Swap biweekly week — only for BIWEEKLY recurrences */}
        {recurrenceType === "BIWEEKLY" && (
          <div>
            <button
              type="button"
              onClick={() => setIsSwapDialogOpen(true)}
              className="w-full h-10 rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
            >
              Trocar semana quinzenal
            </button>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              Move todos os agendamentos para a semana alternada (+7 dias).
            </p>
          </div>
        )}
```

**Step 4: Add the swap dialog**

After the Finalize `<Dialog>` closing tag (around line 535), add:

```tsx
      {/* Swap Biweekly Week Dialog */}
      <Dialog
        isOpen={isSwapDialogOpen}
        onClose={() => setIsSwapDialogOpen(false)}
        title="Trocar Semana Quinzenal"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Todos os agendamentos serao movidos 7 dias para frente, trocando a semana ativa da recorrencia quinzenal.
        </p>

        <div className="space-y-2 mb-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="swapScope"
              checked={swapScope === "future"}
              onChange={() => setSwapScope("future")}
              className="w-4 h-4 text-primary focus:ring-ring/40"
            />
            <div>
              <span className="text-sm font-medium">Somente agendamentos futuros</span>
              <p className="text-xs text-muted-foreground">Agendamentos passados permanecem inalterados.</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="swapScope"
              checked={swapScope === "all"}
              onChange={() => setSwapScope("all")}
              className="w-4 h-4 text-primary focus:ring-ring/40"
            />
            <div>
              <span className="text-sm font-medium">Todos os agendamentos</span>
              <p className="text-xs text-muted-foreground">Inclui agendamentos passados para manter o historico correto.</p>
            </div>
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setIsSwapDialogOpen(false)}
            disabled={isSwapping}
            className="flex-1 h-11 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSwapBiweeklyWeek}
            disabled={isSwapping}
            className="flex-1 h-11 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSwapping ? "Trocando..." : "Trocar semana"}
          </button>
        </div>
      </Dialog>
```

**Step 5: Run build to check for type errors**

Run: `npm run build`

**Step 6: Commit**

```bash
git add src/app/agenda/components/RecurrenceTabContent.tsx
git commit -m "feat: add swap biweekly week UI with scope selection dialog"
```

---

### Task 5: Handle `BIWEEKLY_SWAP_CONFLICTS` in existing error toast

**Files:**
- Already handled in Task 4's `handleSwapBiweeklyWeek` function (conflict toast is in the handler)

This task is a verification step only.

**Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "feat: complete biweekly week swap feature"
```
