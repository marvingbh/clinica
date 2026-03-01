---
title: "refactor: Extract biweekly logic into dedicated module"
type: refactor
date: 2026-02-23
---

# Extract Biweekly Logic into `src/lib/appointments/biweekly.ts`

## Overview

The biweekly appointment pairing logic (~170 lines) is currently inlined in `src/app/api/appointments/route.ts`. The "find paired recurrence" matching criteria is duplicated 3 times, which caused a production bug (matching by time+professional but forgetting `dayOfWeek`, showing Friday's patient as Monday's alternate).

Extract all biweekly logic into a dedicated, testable module with a single source of truth for the pairing match.

## Problem Statement

1. **Duplication** — The recurrence matching logic (`professionalProfileId` + `startTime` + `dayOfWeek` + different `patientId`) appears 3 times in the route. Bug fixed in one place was missing from all three.
2. **Complexity** — ~170 lines of biweekly logic inlined in an already ~500 line API route.
3. **Untestable** — The matching logic is coupled to the route handler and can't be unit tested independently.

## Proposed Solution

Create `src/lib/appointments/biweekly.ts` with pure functions. The route keeps Prisma queries and passes data into these functions.

### Module Exports

```typescript
// --- Types ---

interface BiweeklyRecurrence {
  id: string
  professionalProfileId: string
  patientId: string | null
  dayOfWeek: number
  startTime: string        // "HH:mm"
  startDate: Date
  patient: { id: string; name: string } | null
}

interface BiweeklyAppointment {
  id: string
  scheduledAt: Date
  professionalProfileId: string
  patientId: string | null
  patient?: { name: string } | null
  recurrence?: { recurrenceType: string; isActive: boolean } | null
}

interface BiweeklyHint {
  time: string
  professionalProfileId: string
  patientName: string
  recurrenceId: string
  date?: string
}

interface PairedInfo {
  recurrenceId: string
  patientName: string | null
}

interface AlternateWeekInfo {
  pairedAppointmentId: string | null
  pairedPatientName: string | null
  isAvailable: boolean
}

// --- Functions ---

/** Format a Date to "HH:mm" string */
formatTimeStr(date: Date): string

/** Format a Date to "YYYY-MM-DD" string */
formatDateStr(date: Date): string

/**
 * Build a composite key for slot identification: "YYYY-MM-DD|professionalId|HH:mm"
 * Single source of truth for the key format used across hints, pairing, and blocking.
 */
buildSlotKey(date: Date, professionalProfileId: string): string

/**
 * SINGLE SOURCE OF TRUTH for pairing criteria.
 * Matches: same professional + same time + same dayOfWeek + different patient.
 */
findPairedRecurrence(
  appointment: { scheduledAt: Date; professionalProfileId: string; patientId: string | null },
  recurrences: BiweeklyRecurrence[]
): BiweeklyRecurrence | null

/**
 * Compute biweekly hints (off-week empty slots showing alternate patient).
 * Pure function — no DB calls.
 */
computeBiweeklyHints(params: {
  dateRangeStart: string   // "YYYY-MM-DD"
  dateRangeEnd: string     // "YYYY-MM-DD"
  recurrences: BiweeklyRecurrence[]
  occupiedSlots: Set<string>  // slot keys
}): BiweeklyHint[]

/**
 * Build Map of appointmentId → paired recurrence info.
 * Uses findPairedRecurrence internally — no duplication.
 */
computePairedRecurrenceMap(
  biweeklyAppointments: BiweeklyAppointment[],
  recurrences: BiweeklyRecurrence[]
): Map<string, PairedInfo>

/**
 * Build Set of slot keys blocked by non-CONSULTA entries on alternate weeks.
 */
buildBlockedAlternateKeys(
  blockingEntries: Array<{ scheduledAt: Date; professionalProfileId: string }>
): Set<string>

/**
 * Annotate appointments with alternateWeekInfo (paired partner name, availability).
 */
annotateAlternateWeekInfo(
  appointments: BiweeklyAppointment[],
  pairedMap: Map<string, PairedInfo>,
  blockedSlots: Set<string>
): Array<BiweeklyAppointment & { alternateWeekInfo?: AlternateWeekInfo }>
```

### Route changes

The route (`src/app/api/appointments/route.ts`) replaces ~170 inline lines with:

```typescript
import {
  findPairedRecurrence,
  computeBiweeklyHints,
  computePairedRecurrenceMap,
  buildBlockedAlternateKeys,
  annotateAlternateWeekInfo,
  buildSlotKey,
} from "@/lib/appointments/biweekly"

// 1. Build occupied slots set (reuse existing buildSlotKey)
const occupiedSlots = new Set(appointments.map(apt => buildSlotKey(apt.scheduledAt, apt.professionalProfileId)))

// 2. Compute hints
const biweeklyHints = computeBiweeklyHints({
  dateRangeStart: hintRangeStart,
  dateRangeEnd: hintRangeEnd,
  recurrences: biweeklyRecurrences,
  occupiedSlots,
})

// 3. Compute paired recurrence map
const pairedRecMap = computePairedRecurrenceMap(biweeklyAppointments, biweeklyRecurrences)

// 4. Resolve paired appointment IDs (Prisma query stays in route)
// ... existing query using pairedRecMap.values() to get recurrenceIds ...

// 5. Build blocked alternate slots
const blockedSlots = buildBlockedAlternateKeys(blockingEntries)

// 6. Annotate appointments
const appointmentsWithAlternateInfo = annotateAlternateWeekInfo(
  appointments, pairedMap, blockedSlots
)
```

### Re-export from index

Add to `src/lib/appointments/index.ts`:

```typescript
export {
  findPairedRecurrence,
  computeBiweeklyHints,
  computePairedRecurrenceMap,
  buildBlockedAlternateKeys,
  annotateAlternateWeekInfo,
  buildSlotKey,
  formatTimeStr,
} from "./biweekly"
```

## Test File: `src/lib/appointments/biweekly.test.ts`

### `findPairedRecurrence`
- [x] Returns null when same time but different dayOfWeek (THE BUG)
- [x] Returns match for same professional + time + dayOfWeek + different patient
- [x] Returns null when same patient (self-match)
- [x] Returns null when different professional
- [x] Returns null when different time
- [x] Returns null when empty recurrences array

### `computeBiweeklyHints`
- [x] Returns hints only for off-week dates
- [x] Skips occupied slots
- [x] Skips recurrences that don't match the day of week
- [x] Returns empty array for empty date range
- [x] Handles multi-day range (weekly view)

### `computePairedRecurrenceMap`
- [x] Maps each biweekly appointment to its paired recurrence
- [x] Returns empty map for appointments with no pairs
- [x] Handles multiple biweekly pairs correctly

### `buildBlockedAlternateKeys`
- [x] Builds correct slot keys from blocking entries
- [x] Returns empty set for no entries

### `annotateAlternateWeekInfo`
- [x] Adds alternateWeekInfo with paired patient name
- [x] Sets isAvailable=true when no pair and no block
- [x] Sets isAvailable=false when blocked by non-CONSULTA entry
- [x] Skips non-biweekly appointments

## Acceptance Criteria

- [x] All biweekly matching logic uses `findPairedRecurrence` — no duplication
- [x] Route biweekly section drops from ~170 lines to ~30 lines of orchestration
- [x] All new functions are pure (no Prisma, no side effects)
- [x] Test file covers the dayOfWeek bug scenario explicitly
- [x] Existing behavior unchanged — hints, paired info, blocked slots all work as before
- [x] `npm run build` passes
- [x] `npm run test` passes (including new tests)

## References

- Current biweekly logic: `src/app/api/appointments/route.ts:213-441`
- `isOffWeek` function: `src/lib/appointments/recurrence.ts`
- Existing module pattern: `src/lib/appointments/conflict-check.ts`
- Bug fix commit: missing `dayOfWeek` filter in paired recurrence lookup
