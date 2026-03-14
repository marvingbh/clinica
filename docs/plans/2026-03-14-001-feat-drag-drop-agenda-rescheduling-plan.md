---
title: "feat: Drag-and-Drop Agenda Rescheduling"
type: feat
status: completed
date: 2026-03-14
origin: docs/brainstorms/2026-03-14-drag-drop-agenda-brainstorm.md
deepened: 2026-03-14
---

# feat: Drag-and-Drop Agenda Rescheduling

## Enhancement Summary

**Deepened on:** 2026-03-14
**Agents used:** TypeScript reviewer, Performance oracle, Frontend races reviewer, Architecture strategist, Code simplicity reviewer, Security sentinel, Pattern recognition specialist, Best practices researcher

### Key Improvements from Deepening
1. **State machine architecture** — explicit 5-state DnD lifecycle prevents race conditions and interleaved operations
2. **Correct layer separation** — pixel math in presentation layer (`src/app/agenda/lib/`), domain logic in `src/lib/appointments/`
3. **Performance guardrails** — pre-processed intervals, throttled conflict checks, React.memo on all blocks
4. **Type safety fixes** — use `Pick<Appointment, ...>` and `AppointmentStatus` instead of raw strings
5. **Prerequisite refactoring** — extract appointment blocks from oversized DailyOverviewGrid (618 lines) before adding drag
6. **Security hardening** — add zod validation to PATCH endpoint (pre-existing gap)
7. **Phased rollout** — weekly view first, daily view second

### Considerations Discovered
- Pre-existing SQL injection risk in recurrence endpoint (`$executeRawUnsafe`)
- `weekly/page.tsx` (903 lines) duplicates hook logic from daily page — refactor before adding drag
- `onDragMove` (not `onDragOver`) is the correct event for continuous position tracking
- Day columns should be `useDroppable` instances, not detected via `document.elementsFromPoint`

---

## Overview

Add drag-and-drop rescheduling to the weekly (`WeeklyGrid`) and daily (`DailyOverviewGrid`) agenda views. Users grab an appointment block and drop it on a new time slot (and in weekly view, a new day) to reschedule instantly — without opening the edit form. Uses `@dnd-kit/core` v6 with `MouseSensor` (desktop only). (see brainstorm: docs/brainstorms/2026-03-14-drag-drop-agenda-brainstorm.md)

## Key Decisions (from brainstorm)

- **Library**: `@dnd-kit/core` v6 + `@dnd-kit/modifiers` + `@dnd-kit/utilities`
- **Draggable**: All appointment types, only AGENDADO/CONFIRMADO status, NOT group sessions, NOT in "Todos" admin view
- **Snap**: 15-minute intervals
- **Conflicts**: Visual overlap highlighting during drag (presentation-layer hint), server confirms on drop
- **Recurring**: Dialog → "just this one" (PATCH appointment) vs "all future" (PATCH recurrence)
- **Visual**: Ghost/shadow overlay showing projected time + highlighted target slot
- **Platform**: Desktop mouse only. Mobile stays click-to-edit.
- **Feedback**: Success toast ("Agendamento movido para HH:mm")

## Technical Approach

### Architecture

The DnD system is built as a layer on top of existing components. Strict separation of concerns:

1. **Domain functions** in `src/lib/appointments/drag-constraints.ts` — `isDraggable()`, `computeNewTimeRange()` (pure scheduling logic, no pixels)
2. **Presentation functions** in `src/app/agenda/lib/grid-geometry.ts` — `pixelToMinutes()`, `snapToGrid()`, `findVisualOverlaps()` (pixel math, grid concerns)
3. **Grid config** in `src/app/agenda/lib/grid-config.ts` — `GridConfig` interface consumed by grids + drag hooks
4. **DnD state hook** `useAppointmentDrag` — wraps @dnd-kit sensors, computes projected position, manages state machine
5. **Move operation** — uses existing `updateAppointment()` service, applies PATCH response locally
6. **UI components** — `RecurrenceMoveDialog` (uses existing `Dialog` from `Sheet.tsx`), DragOverlay renders existing `AppointmentBlock`

No new API endpoints. Reuses `PATCH /api/appointments/:id` and `PATCH /api/appointments/recurrences/:id`.

### DnD State Machine

All drag lifecycle is managed by an explicit state machine to prevent race conditions:

```
IDLE → DRAGGING → PERSISTING → IDLE
                → DIALOG     → PERSISTING → IDLE
                                           → IDLE (cancel)
                → IDLE (cancel/escape)
PERSISTING → IDLE (success, apply PATCH response locally)
           → IDLE (failure, show error toast)
```

**Rules:**
- No new drag can start unless state is `IDLE`
- Suppress data refetches while state is `DRAGGING` or `DIALOG` (queue for later)
- Block all other appointment interactions while `DIALOG` is open
- Use `Symbol()` states, not boolean flags (5 states, not 16 boolean combos)

```typescript
const DND_IDLE = Symbol('DND_IDLE')
const DND_DRAGGING = Symbol('DND_DRAGGING')
const DND_DIALOG = Symbol('DND_DIALOG')
const DND_PERSISTING = Symbol('DND_PERSISTING')
```

### Implementation Phases

#### Phase 0: Prerequisite Refactoring

**0.1 Extract `DailyAppointmentBlock` from `DailyOverviewGrid.tsx`**

`DailyOverviewGrid.tsx` is 618 lines — well above the 200-line guideline. Lines 337-513 render appointment blocks inline. Extract into a dedicated `DailyAppointmentBlock` component before adding drag logic. This:
- Brings `DailyOverviewGrid` under the size guideline
- Creates a component parallel to weekly's `AppointmentBlock`
- Makes the drag integration clean (add `useDraggable` to the new component)

**0.2 Extract `GridConfig` and shared constants**

`src/app/agenda/lib/grid-config.ts`:

```typescript
export interface GridConfig {
  pixelsPerMinute: number
  hourHeight: number
  startHour: number
  endHour: number
  snapIntervalMinutes: number
}

export const WEEKLY_GRID: GridConfig = {
  pixelsPerMinute: 1.6,
  hourHeight: 96,
  startHour: 7,
  endHour: 21,
  snapIntervalMinutes: 15,
}

// Daily grid has dynamic startHour/endHour, so only partial config
export const DAILY_GRID_BASE = {
  pixelsPerMinute: 2.4,
  hourHeight: 144,
  snapIntervalMinutes: 15,
} as const
```

Update `WeeklyGrid.tsx`, `AppointmentBlock.tsx`, `GroupSessionBlock.tsx`, `AvailabilitySlotBlock.tsx`, `DailyOverviewGrid.tsx` to import from here.

**0.3 Add zod validation to PATCH /api/appointments/:id** (security hardening)

The PATCH endpoint currently accepts `scheduledAt`, `endAt`, `status`, `price`, etc. without schema validation. Add zod:

```typescript
const updateSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  status: z.enum([...AppointmentStatus values]).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  price: z.number().nonnegative().optional().nullable(),
  title: z.string().max(500).optional().nullable(),
  additionalProfessionalIds: z.array(z.string()).optional(),
}).refine(data => {
  if (data.scheduledAt && data.endAt) {
    return new Date(data.endAt) > new Date(data.scheduledAt)
  }
  return true
}, { message: "endAt must be after scheduledAt" })
```

#### Phase 1: Domain Logic + Grid Geometry

**1.1 Install @dnd-kit packages**

```bash
npm install @dnd-kit/core @dnd-kit/modifiers @dnd-kit/utilities --legacy-peer-deps
```

**1.2 Create domain functions**

`src/lib/appointments/drag-constraints.ts` — pure scheduling logic, no pixel/UI dependencies:

```typescript
import type { Appointment } from "@/app/agenda/lib/types"

// Use Pick to stay in sync with Appointment type
type DragCandidate = Pick<Appointment, 'status' | 'groupId' | 'type'>

const DRAGGABLE_STATUSES: ReadonlySet<string> = new Set(["AGENDADO", "CONFIRMADO"])

/** Whether an appointment can be dragged */
export function isDraggable(
  appointment: DragCandidate,
  canWriteAgenda: boolean
): boolean {
  if (!canWriteAgenda) return false
  if (!DRAGGABLE_STATUSES.has(appointment.status)) return false
  if (appointment.groupId) return false
  return true
}

/** Calculate new scheduledAt/endAt preserving duration */
export function computeNewTimeRange(
  original: { scheduledAt: string; endAt: string },
  target: { hours: number; minutes: number; date?: string } // date as YYYY-MM-DD
): { scheduledAt: string; endAt: string } {
  // Preserves original duration, computes new ISO strings
}
```

Update barrel export in `src/lib/appointments/index.ts`.

**1.3 Create grid geometry functions**

`src/app/agenda/lib/grid-geometry.ts` — presentation-layer pixel math:

```typescript
import type { GridConfig } from "./grid-config"

/** Convert pixel Y offset to minutes-since-midnight, snapped to grid */
export function pixelToMinutes(
  pixelY: number,
  config: Pick<GridConfig, 'pixelsPerMinute' | 'startHour' | 'snapIntervalMinutes'>
): number {
  const rawMinutes = config.startHour * 60 + pixelY / config.pixelsPerMinute
  return Math.round(rawMinutes / config.snapIntervalMinutes) * config.snapIntervalMinutes
}

/** Inverse: minutes-since-midnight to pixel Y offset */
export function minutesToPixel(
  totalMinutes: number,
  config: Pick<GridConfig, 'pixelsPerMinute' | 'startHour'>
): number {
  return (totalMinutes - config.startHour * 60) * config.pixelsPerMinute
}

/** Minutes to {hours, minutes} tuple */
export function minutesToTime(totalMinutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}

/** Find appointment IDs that visually overlap a proposed time range (presentation hint only) */
export function findVisualOverlaps(
  proposedStartMs: number,
  proposedEndMs: number,
  intervals: ReadonlyArray<{ id: string; startMs: number; endMs: number }>
): string[] {
  return intervals
    .filter(i => proposedStartMs < i.endMs && proposedEndMs > i.startMs)
    .map(i => i.id)
}
```

**1.4 Unit tests**

`src/lib/appointments/drag-constraints.test.ts`:
- `isDraggable`: AGENDADO=true, CONFIRMADO=true, FINALIZADO=false, CANCELADO_*=false, groupId → false, canWrite=false → false

`src/app/agenda/lib/grid-geometry.test.ts`:
- `pixelToMinutes`: daily PPM=2.4, weekly PPM=1.6, snap to 15min, boundary values
- `findVisualOverlaps`: overlap detection, non-overlap, self-exclusion
- `minutesToPixel`: inverse of pixelToMinutes

#### Phase 2: DnD Hook + Components

**2.1 Create the drag hook**

`src/app/agenda/hooks/useAppointmentDrag.ts`:

```typescript
import type { Appointment } from "@/app/agenda/lib/types"
import type { GridConfig } from "@/app/agenda/lib/grid-config"

interface UseAppointmentDragParams {
  appointments: Appointment[]
  gridConfig: GridConfig
  gridRef: RefObject<HTMLElement>
  canWriteAgenda: boolean
  onAppointmentMoved: (updated: Appointment) => void
  onRecurrenceMoveRequested: (params: {
    appointment: Appointment
    newTime: { scheduledAt: string; endAt: string }
  }) => void
}

interface UseAppointmentDragReturn {
  sensors: ReturnType<typeof useSensors>
  dndState: typeof DND_IDLE | typeof DND_DRAGGING | typeof DND_PERSISTING
  activeAppointment: Appointment | null
  projectedTime: { hours: number; minutes: number; date?: string } | null
  overlappingIds: string[]
  handleDragStart: (event: DragStartEvent) => void
  handleDragMove: (event: DragMoveEvent) => void
  handleDragEnd: (event: DragEndEvent) => void
  handleDragCancel: () => void
  isDragging: boolean
  apiError: string | null
  clearApiError: () => void
}
```

### Research Insights

**Sensor configuration:**
- `MouseSensor` with `activationConstraint: { distance: 8 }` — prevents click→drag confusion
- 8px distance (not 150ms delay) — feels more responsive for desktop users

**Performance-critical patterns:**
- Pre-process appointment intervals into `{ id, startMs, endMs }` in `useMemo` — eliminates `new Date()` allocations during drag
- Throttle `onDragMove` conflict check to 66ms (~15fps) — 75% less work, visually indistinguishable
- Cache grid `getBoundingClientRect()` once at drag start in a ref — no layout reads during drag
- Memoize `data` prop on each `useDraggable` to prevent re-registrations
- Use `React.memo` on all `AppointmentBlock` components

**Race condition mitigations:**
- `isDraggingRef` suppresses refetches during drag (queue pending refetch for after)
- `flushSync` for `setActiveAppointment` in `onDragStart` to avoid 1-frame ghost delay
- State machine blocks new drags while PATCH is in-flight
- Generation counter on refetches to discard stale responses

**After drop — apply PATCH response locally, don't immediately refetch:**
```typescript
// On PATCH success: apply response to local state
onAppointmentMoved(result.appointment)
toast.success(`Agendamento movido para ${newTimeStr}`)
// Defer full refetch by 2-3 seconds for read-replica sync
```

**2.2 DragOverlay — reuse existing AppointmentBlock**

No separate `DragOverlayPreview` component needed. Render the existing `AppointmentBlock` inside `<DragOverlay>` with a style wrapper:

```tsx
<DragOverlay
  modifiers={[snapModifier]}
  dropAnimation={{ duration: 200, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }}
  zIndex={50}
>
  {activeAppointment ? (
    <div className="opacity-90 shadow-lg ring-2 ring-primary/30 pointer-events-none rounded">
      {/* Show projected time badge */}
      <span className="absolute -top-5 left-0 text-xs font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
        {projectedTimeStr}
      </span>
      <AppointmentBlock
        appointment={activeAppointment}
        onClick={() => {}}
        /* inherit dimensions from original */
      />
    </div>
  ) : null}
</DragOverlay>
```

**2.3 Drop zone indicator — inline, not a separate component**

The drop zone highlight is 5-8 lines of inline JSX inside the grid. A colored rectangle positioned absolutely at the projected time:

```tsx
{isDragging && projectedTime && (
  <div
    className={cn(
      "absolute left-0 right-0 rounded border-2 border-dashed pointer-events-none transition-colors",
      overlappingIds.length > 0
        ? "bg-destructive/10 border-destructive/40"
        : "bg-primary/10 border-primary/40"
    )}
    style={{
      top: minutesToPixel(projectedMinutes, gridConfig),
      height: durationMinutes * gridConfig.pixelsPerMinute,
    }}
  />
)}
```

**2.4 Conflict visualization during drag**

Existing appointment blocks that would overlap get a visual indicator via data attribute (avoids React re-renders):

```typescript
// In onDragMove handler (throttled):
const overlapping = findVisualOverlaps(newStartMs, newEndMs, processedIntervals)
// Apply via DOM mutation (no setState):
document.querySelectorAll('[data-appointment-id]').forEach(el => {
  el.dataset.dragConflict = overlapping.includes(el.dataset.appointmentId!) ? 'true' : 'false'
})
```

```css
[data-drag-conflict="true"] {
  outline: 2px solid rgb(239 68 68 / 0.7);
  outline-offset: -1px;
}
```

**2.5 RecurrenceMoveDialog**

`src/app/agenda/components/RecurrenceMoveDialog.tsx` — uses existing `Dialog` from `Sheet.tsx`:

```typescript
interface RecurrenceMoveDialogProps {
  isOpen: boolean
  appointment: Appointment | null
  newTimeRange: { scheduledAt: string; endAt: string } | null
  onMoveThis: () => Promise<void>
  onMoveAllFuture: () => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
}
```

- "Mover apenas este agendamento" → PATCH individual appointment
- "Mover este e todos os futuros" → PATCH recurrence with updated `startTime`, `endTime`, `dayOfWeek`
- Shows: patient name, current time → new time
- Uses existing button styling pattern (rounded-xl, h-11)

#### Phase 3: Integrate into Weekly View (first)

**3.1 Wrap WeeklyGrid with DndContext**

Modify `src/app/agenda/weekly/page.tsx`:
- Initialize `useAppointmentDrag` with `WEEKLY_GRID` config
- Wrap in `<DndContext>` with sensors and `closestCenter` collision detection
- Add `<DragOverlay>` rendering existing `AppointmentBlock`
- Add `<RecurrenceMoveDialog>` with callbacks
- Enable auto-scroll: `<DndContext autoScroll={{ threshold: { x: 0.15, y: 0.15 } }}>`

**3.2 Make each day column a `useDroppable`**

Instead of `document.elementsFromPoint()`, make each day column a proper droppable with `useDroppable`:

```tsx
// Inside WeeklyGrid, for each day column:
const { setNodeRef, isOver } = useDroppable({
  id: `day-${dateStr}`,
  data: useMemo(() => ({ date: dateStr }), [dateStr]),
})
```

This gives 7 droppables total (not hundreds of time slots). dnd-kit's collision detection determines which day column the pointer is over. Time is computed from pointer Y position.

**3.3 Make `AppointmentBlock` draggable**

Modify `src/app/agenda/weekly/components/AppointmentBlock.tsx`:
- Add `useDraggable` with `disabled: !isDraggable(appointment, canWrite)`
- Memoize `data` prop: `useMemo(() => ({ appointment }), [appointment.id])`
- `opacity: isDragging ? 0.3 : 1` + dashed border when dragging
- `cursor: grab` on hover (non-draggable stays default cursor)
- Wrap component in `React.memo`
- Add `data-appointment-id={appointment.id}` for conflict highlighting

**3.4 Auto-scroll for horizontal scrolling**

Weekly view uses `overflow-x-auto`. dnd-kit's built-in `autoScroll` handles this when configured on `DndContext`.

#### Phase 4: Integrate into Daily View (second)

**4.1 Make `DailyAppointmentBlock` draggable**

The new extracted component (from Phase 0.1) gets `useDraggable` — same pattern as weekly.

**4.2 Wrap daily page with DndContext**

Modify `src/app/agenda/page.tsx`:
- Same hook, but daily config has dynamic `startHour` from `computeHourRange`
- Single droppable for the grid area
- Only enabled when viewing a single professional (not "Todos")

**4.3 Daily-specific concerns**
- Dynamic `startHour` means `GridConfig` is constructed in `useMemo` from computed hour range
- No cross-day drag (daily view shows one day)
- Vertical-only movement

#### Phase 5: Polish + Edge Cases

**5.1 Cursor styles**
- `cursor: grab` on draggable appointments (hover)
- `cursor: grabbing` during drag (via `[data-dragging] { cursor: grabbing }`)
- Default cursor on non-draggable appointments

**5.2 After-drop flow**
1. Drop fires → state transitions to `PERSISTING`
2. Call `updateAppointment()` with new `{ scheduledAt, endAt }`
3. Success → apply PATCH response to local state, toast "Agendamento movido para HH:mm", transition to `IDLE`
4. Failure (409) → show error toast with conflict details (from `formatConflictError`), transition to `IDLE`
5. Deferred full refetch after 2-3 seconds for read-replica sync

**5.3 Edge cases**
- **Grid boundaries**: clamp pixelToMinutes to `[startHour * 60, endHour * 60 - 1]`
- **Appointment past grid end**: allow drop, grid clips visually
- **No reflow during drag**: other appointments stay in place, only ghost moves
- **Data refresh during drag**: suppressed via `isDraggingRef`, queued for after
- **Rapid drags**: blocked by state machine — `PERSISTING` state refuses new `onDragStart`
- **Recurrence dialog open**: all other interactions blocked

## Acceptance Criteria

### Core Functionality
- [x] Appointments (AGENDADO/CONFIRMADO) can be dragged to a new time in weekly view
- [x] Appointments can be dragged to a different day in weekly view
- [x] Appointments can be dragged to a new time in daily view
- [x] Time snaps to 15-minute intervals during drag
- [x] Duration is preserved when dragging (only start time changes)
- [x] Ghost/shadow preview follows cursor with projected time badge
- [x] Drop zone indicator shows valid (blue) or conflict (red) tint
- [x] Success toast shown after successful reschedule

### Conflict Handling
- [x] Visual overlap highlighting during drag (presentation hint from loaded data)
- [x] Server-side conflict check on drop (existing 409 handling)
- [x] Non-blocking types (LEMBRETE, NOTA) skip conflict visual + server checks
- [x] On 409: error toast with conflict details, appointment stays at original position

### Recurring Appointments
- [x] Dragging a recurring appointment opens `RecurrenceMoveDialog`
- [x] "Mover apenas este" updates only the single appointment via PATCH
- [x] "Mover todos os futuros" updates recurrence pattern via PATCH recurrence endpoint
- [x] Cross-day drag of recurring appointment updates `dayOfWeek` in recurrence

### Guards & Restrictions
- [x] FINALIZADO/CANCELADO: NOT draggable (no grab cursor, no drag activation)
- [x] Group sessions (groupId != null): NOT draggable
- [x] Drag disabled in Admin "Todos" (all professionals) view
- [x] Users with READ-only permission cannot drag
- [x] Click (< 8px movement) still opens the edit sheet
- [x] Mobile: click-to-edit only (MouseSensor, no touch)
- [x] No concurrent drags: blocked while PATCH in flight

### Tests
- [x] `isDraggable()` — all status/type/permission/group combinations
- [x] `pixelToMinutes()` — daily PPM, weekly PPM, snap behavior, boundaries
- [x] `findVisualOverlaps()` — overlap, non-overlap
- [x] `computeNewTimeRange()` — duration preservation, date change

## File Changes Summary

### Prerequisite Refactoring (Phase 0)
| File | Changes |
|------|---------|
| `src/app/agenda/components/DailyOverviewGrid.tsx` | Extract lines 337-513 into `DailyAppointmentBlock` |
| `src/app/agenda/components/DailyAppointmentBlock.tsx` | **NEW** — extracted from DailyOverviewGrid |
| `src/app/agenda/lib/grid-config.ts` | **NEW** — `GridConfig` interface + view configs |
| `src/app/api/appointments/[id]/route.ts` | Add zod schema validation |
| 4 weekly component files | Import constants from `grid-config.ts` |

### New Files
| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/app/agenda/lib/grid-config.ts` | GridConfig interface + constants | ~25 |
| `src/app/agenda/lib/grid-geometry.ts` | Pixel↔time conversion functions | ~50 |
| `src/app/agenda/lib/grid-geometry.test.ts` | Tests for grid geometry | ~80 |
| `src/lib/appointments/drag-constraints.ts` | `isDraggable`, `computeNewTimeRange` | ~40 |
| `src/lib/appointments/drag-constraints.test.ts` | Unit tests | ~60 |
| `src/app/agenda/hooks/useAppointmentDrag.ts` | DnD state machine + drop handler | ~180 |
| `src/app/agenda/components/RecurrenceMoveDialog.tsx` | Recurring move dialog (uses Sheet/Dialog) | ~80 |
| `src/app/agenda/components/DailyAppointmentBlock.tsx` | Extracted from DailyOverviewGrid | ~150 |

### Modified Files
| File | Changes |
|------|---------|
| `package.json` | Add @dnd-kit dependencies |
| `src/app/agenda/weekly/page.tsx` | Wrap with DndContext, init useAppointmentDrag |
| `src/app/agenda/weekly/components/WeeklyGrid.tsx` | Day columns as `useDroppable`, drop zone indicator inline |
| `src/app/agenda/weekly/components/AppointmentBlock.tsx` | Add `useDraggable`, `React.memo`, `data-appointment-id` |
| `src/app/agenda/weekly/components/GroupSessionBlock.tsx` | Import from grid-config |
| `src/app/agenda/weekly/components/AvailabilitySlotBlock.tsx` | Import from grid-config |
| `src/app/agenda/page.tsx` | Wrap with DndContext (Phase 4) |
| `src/app/agenda/components/DailyOverviewGrid.tsx` | Use DailyAppointmentBlock, import grid-config |
| `src/lib/appointments/index.ts` | Add barrel export for drag-constraints |
| `src/app/api/appointments/[id]/route.ts` | Add zod validation schema |

## System-Wide Impact

- **No database changes** — no migrations needed
- **No new API endpoints** — reuses existing PATCH routes
- **No backend logic changes** — only adds zod validation to PATCH (defense in depth)
- **Audit logging** — already handled by existing PATCH endpoint
- **Conflict checking** — visual hint client-side (presentation only) + server authoritative (row locking)
- **Notification gap** — `APPOINTMENT_RESCHEDULED` type exists but isn't implemented. Pre-existing, out of scope.
- **Pre-existing security issues** — SQL injection via `$executeRawUnsafe` in recurrence endpoint should be fixed separately

## Performance Notes

| Concern | Mitigation |
|---------|-----------|
| 200 `useDraggable` instances (weekly) | Within @dnd-kit limits. `React.memo` on blocks prevents cascade re-renders |
| `onDragMove` fires ~60fps | Throttle conflict check to 66ms (~15fps). Pure arithmetic, no Date allocations |
| Grid rect measurement | Cache `getBoundingClientRect()` at drag start in ref, no layout reads during drag |
| `data` prop on useDraggable | Memoize with `useMemo` keyed on `appointment.id` |
| Post-drop latency | Apply PATCH response locally (no full refetch). Deferred sync after 2-3s |
| Conflict indicator | DOM mutation via `dataset.dragConflict`, not React state (zero re-renders) |

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-14-drag-drop-agenda-brainstorm.md](docs/brainstorms/2026-03-14-drag-drop-agenda-brainstorm.md)
- **@dnd-kit docs:** https://dndkit.com/ — v6 stable, MouseSensor, DragOverlay, createSnapModifier
- **Daily grid positioning:** `src/app/agenda/components/DailyOverviewGrid.tsx:347-351`
- **Weekly grid positioning:** `src/app/agenda/weekly/components/AppointmentBlock.tsx:43-44`
- **Existing click-to-time calc:** `src/app/agenda/components/DailyOverviewGrid.tsx:194-205`
- **PATCH appointment route:** `src/app/api/appointments/[id]/route.ts:97-288`
- **PATCH recurrence route:** `src/app/api/appointments/recurrences/[id]/route.ts`
- **Update service function:** `src/app/agenda/services/appointmentService.ts:172-189`
- **Existing Dialog component:** `src/app/agenda/components/Sheet.tsx`
- **CANCELLED_STATUSES constant:** `src/app/agenda/lib/constants.ts`
- **Barrel export:** `src/lib/appointments/index.ts`
