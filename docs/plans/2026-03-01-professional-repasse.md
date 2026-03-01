# Professional Repasse (Paycheck Report) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a read-only report showing how much each professional earns per month, calculated as a percentage of session revenue after clinic tax deduction.

**Architecture:** Two new schema fields (Clinic.taxPercentage, ProfessionalProfile.repassePercentage). Pure domain logic in `src/lib/financeiro/repasse.ts` with TDD. Two API routes (summary list + detail). Two pages (list + detail). Reuses existing FinanceiroContext for year/month filtering.

**Tech Stack:** Prisma, Next.js App Router, TypeScript, Vitest, TailwindCSS

---

### Task 1: Add schema fields

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add taxPercentage to Clinic model**

In `prisma/schema.prisma`, after `billingMode` field (line ~166), add:

```prisma
  taxPercentage          Decimal     @default(0) @db.Decimal(5, 2) // Clinic tax % deducted before repasse
```

**Step 2: Add repassePercentage to ProfessionalProfile model**

After `maxAdvanceBookingDays` field (line ~232), add:

```prisma
  repassePercentage     Decimal     @default(0) @db.Decimal(5, 2) // % paid to professional after tax
```

**Step 3: Push schema**

Run: `npx prisma db push`
Expected: Schema applied successfully

**Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add taxPercentage to Clinic and repassePercentage to ProfessionalProfile"
```

---

### Task 2: Write repasse calculation domain logic (TDD)

**Files:**
- Create: `src/lib/financeiro/repasse.ts`
- Create: `src/lib/financeiro/repasse.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/financeiro/repasse.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import {
  calculateRepasseForSession,
  buildRepasseLineItems,
  calculateRepasseSummary,
  REPASSE_BILLABLE_STATUSES,
} from "./repasse"

describe("REPASSE_BILLABLE_STATUSES", () => {
  it("includes AGENDADO, CONFIRMADO, FINALIZADO, CANCELADO_FALTA", () => {
    expect(REPASSE_BILLABLE_STATUSES).toEqual([
      "AGENDADO", "CONFIRMADO", "FINALIZADO", "CANCELADO_FALTA",
    ])
  })
})

describe("calculateRepasseForSession", () => {
  it("calculates repasse: gross -> tax -> percentage", () => {
    // R$200, 10% tax, 40% repasse
    // afterTax = 200 * 0.90 = 180
    // repasse = 180 * 0.40 = 72
    const result = calculateRepasseForSession(200, 10, 40)
    expect(result).toEqual({
      grossValue: 200,
      taxAmount: 20,
      afterTax: 180,
      repasseValue: 72,
    })
  })

  it("handles zero tax", () => {
    const result = calculateRepasseForSession(200, 0, 40)
    expect(result).toEqual({
      grossValue: 200,
      taxAmount: 0,
      afterTax: 200,
      repasseValue: 80,
    })
  })

  it("handles zero repasse percentage", () => {
    const result = calculateRepasseForSession(200, 10, 0)
    expect(result).toEqual({
      grossValue: 200,
      taxAmount: 20,
      afterTax: 180,
      repasseValue: 0,
    })
  })

  it("rounds to 2 decimal places", () => {
    // R$100, 7% tax, 33% repasse
    // afterTax = 100 * 0.93 = 93
    // repasse = 93 * 0.33 = 30.69
    const result = calculateRepasseForSession(100, 7, 33)
    expect(result.taxAmount).toBe(7)
    expect(result.afterTax).toBe(93)
    expect(result.repasseValue).toBe(30.69)
  })
})

describe("buildRepasseLineItems", () => {
  const baseApt = {
    id: "apt-1",
    scheduledAt: new Date("2026-03-02T10:00:00"),
    status: "FINALIZADO",
    type: "CONSULTA",
    recurrenceId: "rec-1",
    groupId: null,
    price: null as number | null,
    patientName: "Ana Silva",
    groupName: null as string | null,
  }

  it("builds line items for individual sessions", () => {
    const items = buildRepasseLineItems(
      [baseApt],
      150, // sessionFee
      10,  // taxPercent
      40,  // repassePercent
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      appointmentId: "apt-1",
      category: "individual",
      date: baseApt.scheduledAt,
      patientName: "Ana Silva",
      groupName: null,
      grossValue: 150,
      taxAmount: 15,
      afterTax: 135,
      repasseValue: 54,
    })
  })

  it("uses appointment.price when available (overrides sessionFee)", () => {
    const items = buildRepasseLineItems(
      [{ ...baseApt, price: 200 }],
      150, 10, 40,
    )
    expect(items[0].grossValue).toBe(200)
    expect(items[0].repasseValue).toBe(72)
  })

  it("classifies group sessions", () => {
    const items = buildRepasseLineItems(
      [{ ...baseApt, groupId: "grp-1", groupName: "Grupo A" }],
      150, 10, 40,
    )
    expect(items[0].category).toBe("group")
    expect(items[0].groupName).toBe("Grupo A")
  })

  it("classifies school meetings", () => {
    const items = buildRepasseLineItems(
      [{ ...baseApt, type: "REUNIAO", recurrenceId: null }],
      150, 10, 40,
    )
    expect(items[0].category).toBe("school_meeting")
  })

  it("classifies extra sessions (no recurrence)", () => {
    const items = buildRepasseLineItems(
      [{ ...baseApt, recurrenceId: null }],
      150, 10, 40,
    )
    expect(items[0].category).toBe("extra")
  })

  it("filters out non-billable statuses", () => {
    const items = buildRepasseLineItems(
      [{ ...baseApt, status: "CANCELADO_PROFISSIONAL" }],
      150, 10, 40,
    )
    expect(items).toHaveLength(0)
  })
})

describe("calculateRepasseSummary", () => {
  it("aggregates line items by category", () => {
    const items = [
      { appointmentId: "1", category: "individual" as const, date: new Date(), patientName: "A", groupName: null, grossValue: 200, taxAmount: 20, afterTax: 180, repasseValue: 72 },
      { appointmentId: "2", category: "individual" as const, date: new Date(), patientName: "B", groupName: null, grossValue: 200, taxAmount: 20, afterTax: 180, repasseValue: 72 },
      { appointmentId: "3", category: "group" as const, date: new Date(), patientName: "C", groupName: "G1", grossValue: 150, taxAmount: 15, afterTax: 135, repasseValue: 54 },
    ]
    const summary = calculateRepasseSummary(items)
    expect(summary.totalGross).toBe(550)
    expect(summary.totalTax).toBe(55)
    expect(summary.totalAfterTax).toBe(495)
    expect(summary.totalRepasse).toBe(198)
    expect(summary.totalSessions).toBe(3)
    expect(summary.byCategory.individual.count).toBe(2)
    expect(summary.byCategory.individual.repasse).toBe(144)
    expect(summary.byCategory.group.count).toBe(1)
    expect(summary.byCategory.group.repasse).toBe(54)
    expect(summary.byCategory.school_meeting.count).toBe(0)
    expect(summary.byCategory.extra.count).toBe(0)
  })

  it("handles empty items", () => {
    const summary = calculateRepasseSummary([])
    expect(summary.totalGross).toBe(0)
    expect(summary.totalRepasse).toBe(0)
    expect(summary.totalSessions).toBe(0)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/financeiro/repasse.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/lib/financeiro/repasse.ts`:

```typescript
/**
 * Professional repasse (paycheck) calculation logic.
 *
 * Formula per session:
 *   grossValue = appointment.price ?? patient.sessionFee
 *   taxAmount = grossValue * (taxPercent / 100)
 *   afterTax = grossValue - taxAmount
 *   repasseValue = afterTax * (repassePercent / 100)
 */

export const REPASSE_BILLABLE_STATUSES = [
  "AGENDADO", "CONFIRMADO", "FINALIZADO", "CANCELADO_FALTA",
]

export type RepasseCategory = "individual" | "group" | "school_meeting" | "extra"

export interface RepasseCalc {
  grossValue: number
  taxAmount: number
  afterTax: number
  repasseValue: number
}

export interface RepasseLineItem extends RepasseCalc {
  appointmentId: string
  category: RepasseCategory
  date: Date
  patientName: string
  groupName: string | null
}

export interface RepasseCategorySummary {
  count: number
  gross: number
  tax: number
  afterTax: number
  repasse: number
}

export interface RepasseSummary {
  totalSessions: number
  totalGross: number
  totalTax: number
  totalAfterTax: number
  totalRepasse: number
  byCategory: Record<RepasseCategory, RepasseCategorySummary>
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calculateRepasseForSession(
  grossValue: number,
  taxPercent: number,
  repassePercent: number,
): RepasseCalc {
  const taxAmount = round2(grossValue * taxPercent / 100)
  const afterTax = round2(grossValue - taxAmount)
  const repasseValue = round2(afterTax * repassePercent / 100)
  return { grossValue, taxAmount, afterTax, repasseValue }
}

interface AppointmentForRepasse {
  id: string
  scheduledAt: Date
  status: string
  type: string
  recurrenceId: string | null
  groupId: string | null
  price: number | null
  patientName: string
  groupName: string | null
}

function classifyCategory(apt: AppointmentForRepasse): RepasseCategory {
  if (apt.groupId) return "group"
  if (apt.type === "REUNIAO") return "school_meeting"
  if (apt.recurrenceId) return "individual"
  return "extra"
}

export function buildRepasseLineItems(
  appointments: AppointmentForRepasse[],
  defaultSessionFee: number,
  taxPercent: number,
  repassePercent: number,
): RepasseLineItem[] {
  return appointments
    .filter(a => REPASSE_BILLABLE_STATUSES.includes(a.status))
    .map(apt => {
      const gross = apt.price ?? defaultSessionFee
      const calc = calculateRepasseForSession(gross, taxPercent, repassePercent)
      return {
        appointmentId: apt.id,
        category: classifyCategory(apt),
        date: apt.scheduledAt,
        patientName: apt.patientName,
        groupName: apt.groupName,
        ...calc,
      }
    })
}

const EMPTY_CATEGORY: RepasseCategorySummary = {
  count: 0, gross: 0, tax: 0, afterTax: 0, repasse: 0,
}

export function calculateRepasseSummary(items: RepasseLineItem[]): RepasseSummary {
  const byCategory: Record<RepasseCategory, RepasseCategorySummary> = {
    individual: { ...EMPTY_CATEGORY },
    group: { ...EMPTY_CATEGORY },
    school_meeting: { ...EMPTY_CATEGORY },
    extra: { ...EMPTY_CATEGORY },
  }

  let totalGross = 0
  let totalTax = 0
  let totalAfterTax = 0
  let totalRepasse = 0

  for (const item of items) {
    const cat = byCategory[item.category]
    cat.count++
    cat.gross += item.grossValue
    cat.tax += item.taxAmount
    cat.afterTax += item.afterTax
    cat.repasse += item.repasseValue
    totalGross += item.grossValue
    totalTax += item.taxAmount
    totalAfterTax += item.afterTax
    totalRepasse += item.repasseValue
  }

  return {
    totalSessions: items.length,
    totalGross: round2(totalGross),
    totalTax: round2(totalTax),
    totalAfterTax: round2(totalAfterTax),
    totalRepasse: round2(totalRepasse),
    byCategory,
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/financeiro/repasse.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/financeiro/repasse.ts src/lib/financeiro/repasse.test.ts
git commit -m "feat: add repasse calculation domain logic with tests"
```

---

### Task 3: Add repasse summary API route

**Files:**
- Create: `src/app/api/financeiro/repasse/route.ts`

**Step 1: Create the summary API route**

This route returns a list of professionals with their monthly repasse summary. It follows the same auth pattern as `src/app/api/financeiro/dashboard/route.ts`.

```typescript
import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import {
  REPASSE_BILLABLE_STATUSES,
  buildRepasseLineItems,
  calculateRepasseSummary,
} from "@/lib/financeiro/repasse"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const url = new URL(req.url)
    const year = parseInt(url.searchParams.get("year") || String(new Date().getFullYear()))
    const month = url.searchParams.get("month") ? parseInt(url.searchParams.get("month")!) : null

    if (!month) {
      return NextResponse.json({ error: "Mês é obrigatório para o relatório de repasse" }, { status: 400 })
    }

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1)

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { taxPercentage: true },
    })
    const taxPercent = Number(clinic?.taxPercentage ?? 0)

    // Fetch professionals with repasse percentage
    const profWhere: Record<string, unknown> = {}
    if (scope === "own" && user.professionalProfileId) {
      profWhere.id = user.professionalProfileId
    }
    const professionals = await prisma.professionalProfile.findMany({
      where: {
        ...profWhere,
        user: { clinicId: user.clinicId },
      },
      select: {
        id: true,
        repassePercentage: true,
        user: { select: { name: true } },
      },
    })

    // Fetch all billable appointments for the month
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        scheduledAt: { gte: startDate, lt: endDate },
        status: { in: REPASSE_BILLABLE_STATUSES },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: {
        id: true, scheduledAt: true, status: true, type: true,
        recurrenceId: true, groupId: true, price: true,
        professionalProfileId: true, patientId: true,
        patient: { select: { name: true, sessionFee: true } },
        group: { select: { name: true } },
        additionalProfessionals: { select: { professionalProfileId: true } },
      },
    })

    // Also fetch group co-leadership (TherapyGroupProfessional)
    const groupIds = [...new Set(appointments.filter(a => a.groupId).map(a => a.groupId!))]
    const groupProfessionals = groupIds.length > 0
      ? await prisma.therapyGroupProfessional.findMany({
          where: { groupId: { in: groupIds } },
          select: { groupId: true, professionalProfileId: true },
        })
      : []

    const results = professionals.map(prof => {
      const repassePercent = Number(prof.repassePercentage)

      // Collect appointments where this professional participates:
      // 1. Primary professional
      // 2. Co-leader in group (via TherapyGroupProfessional)
      // 3. Additional professional (via AppointmentProfessional)
      const profApts = appointments.filter(a => {
        if (a.professionalProfileId === prof.id) return true
        if (a.groupId) {
          const isGroupCoPro = groupProfessionals.some(
            gp => gp.groupId === a.groupId && gp.professionalProfileId === prof.id
          )
          if (isGroupCoPro) return true
        }
        return a.additionalProfessionals.some(ap => ap.professionalProfileId === prof.id)
      })

      const lineItems = buildRepasseLineItems(
        profApts.map(a => ({
          id: a.id,
          scheduledAt: a.scheduledAt,
          status: a.status,
          type: a.type,
          recurrenceId: a.recurrenceId,
          groupId: a.groupId,
          price: a.price ? Number(a.price) : null,
          patientName: a.patient?.name ?? "—",
          groupName: a.group?.name ?? null,
        })),
        Number(profApts[0]?.patient?.sessionFee ?? 0), // fallback; per-line uses apt.price
        taxPercent,
        repassePercent,
      )
      const summary = calculateRepasseSummary(lineItems)

      return {
        professionalId: prof.id,
        name: prof.user.name,
        repassePercent,
        taxPercent,
        ...summary,
      }
    })

    return NextResponse.json({ year, month, taxPercent, professionals: results })
  }
)
```

**Note on sessionFee:** Each line item in `buildRepasseLineItems` uses `apt.price ?? defaultSessionFee`. The API should pass each patient's `sessionFee` per appointment. To simplify, we adjust the mapping to use `apt.price ?? patient.sessionFee` directly in the price field so the domain function always gets the right price.

Update the mapping in the route to set `price` correctly:

```typescript
price: a.price ? Number(a.price) : (a.patient?.sessionFee ? Number(a.patient.sessionFee) : null),
```

And pass `0` as `defaultSessionFee` (since price is already resolved).

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/financeiro/repasse/route.ts
git commit -m "feat: add repasse summary API route"
```

---

### Task 4: Add repasse detail API route

**Files:**
- Create: `src/app/api/financeiro/repasse/[professionalId]/route.ts`

**Step 1: Create the detail API route**

This returns the full line-item breakdown for a single professional.

```typescript
import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import {
  REPASSE_BILLABLE_STATUSES,
  buildRepasseLineItems,
  calculateRepasseSummary,
} from "@/lib/financeiro/repasse"

export const GET = withFeatureAuth(
  { feature: "finances", minAccess: "READ" },
  async (req: NextRequest, { user }, { params }: { params: Promise<{ professionalId: string }> }) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"
    const { professionalId } = await params
    const url = new URL(req.url)
    const year = parseInt(url.searchParams.get("year") || String(new Date().getFullYear()))
    const month = url.searchParams.get("month") ? parseInt(url.searchParams.get("month")!) : null

    if (!month) {
      return NextResponse.json({ error: "Mês é obrigatório" }, { status: 400 })
    }

    // Scope check: professionals can only view their own
    if (scope === "own" && user.professionalProfileId !== professionalId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }

    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1)

    const [clinic, professional] = await Promise.all([
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { taxPercentage: true },
      }),
      prisma.professionalProfile.findUnique({
        where: { id: professionalId },
        select: { id: true, repassePercentage: true, user: { select: { name: true } } },
      }),
    ])

    if (!professional) {
      return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 })
    }

    const taxPercent = Number(clinic?.taxPercentage ?? 0)
    const repassePercent = Number(professional.repassePercentage)

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        scheduledAt: { gte: startDate, lt: endDate },
        status: { in: REPASSE_BILLABLE_STATUSES },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: {
        id: true, scheduledAt: true, status: true, type: true,
        recurrenceId: true, groupId: true, price: true,
        professionalProfileId: true,
        patient: { select: { name: true, sessionFee: true } },
        group: { select: { name: true } },
        additionalProfessionals: { select: { professionalProfileId: true } },
      },
    })

    const groupIds = [...new Set(appointments.filter(a => a.groupId).map(a => a.groupId!))]
    const groupProfessionals = groupIds.length > 0
      ? await prisma.therapyGroupProfessional.findMany({
          where: { groupId: { in: groupIds } },
          select: { groupId: true, professionalProfileId: true },
        })
      : []

    const profApts = appointments.filter(a => {
      if (a.professionalProfileId === professionalId) return true
      if (a.groupId) {
        if (groupProfessionals.some(gp => gp.groupId === a.groupId && gp.professionalProfileId === professionalId)) return true
      }
      return a.additionalProfessionals.some(ap => ap.professionalProfileId === professionalId)
    })

    const lineItems = buildRepasseLineItems(
      profApts.map(a => ({
        id: a.id,
        scheduledAt: a.scheduledAt,
        status: a.status,
        type: a.type,
        recurrenceId: a.recurrenceId,
        groupId: a.groupId,
        price: a.price ? Number(a.price) : (a.patient?.sessionFee ? Number(a.patient.sessionFee) : null),
        patientName: a.patient?.name ?? "—",
        groupName: a.group?.name ?? null,
      })),
      0, // price already resolved per appointment
      taxPercent,
      repassePercent,
    )

    const summary = calculateRepasseSummary(lineItems)

    return NextResponse.json({
      year, month, taxPercent, repassePercent,
      professional: { id: professional.id, name: professional.user.name },
      summary,
      items: lineItems.map(i => ({
        ...i,
        date: i.date.toISOString(),
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    })
  }
)
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/api/financeiro/repasse/[professionalId]/route.ts
git commit -m "feat: add repasse detail API route"
```

---

### Task 5: Add "Repasse" tab to financeiro layout

**Files:**
- Modify: `src/app/financeiro/layout.tsx` (line 13)

**Step 1: Add the tab**

Add after the "Preços" tab entry:

```typescript
  { href: "/financeiro/repasse", label: "Repasse" },
```

**Step 2: Exclude repasse detail pages from filter bar**

Update the filter bar condition (line 41) to also exclude repasse detail:

```typescript
{!pathname.startsWith("/financeiro/precos") && !pathname.match(/^\/financeiro\/faturas\/.+/) && !pathname.match(/^\/financeiro\/repasse\/.+/) && <FinanceiroFilterBar />}
```

**Step 3: Commit**

```bash
git add src/app/financeiro/layout.tsx
git commit -m "feat: add Repasse tab to financeiro navigation"
```

---

### Task 6: Create repasse summary page (list of professionals)

**Files:**
- Create: `src/app/financeiro/repasse/page.tsx`

**Step 1: Create the page**

This page shows a table of all professionals with their repasse summary for the selected month. Uses `useFinanceiroContext()` for year/month. If no month is selected, shows a prompt to select one.

The page should:
- Fetch `GET /api/financeiro/repasse?year=X&month=Y`
- Show a table with columns: Profissional, Sessões, Bruto, Imposto, Líquido, % Repasse, Valor Repasse
- Each row links to `/financeiro/repasse/[professionalId]`
- Footer row with totals
- Show taxPercent in a header badge

Pattern to follow: `src/app/financeiro/faturas/page.tsx` for table structure and styling.

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/financeiro/repasse/page.tsx
git commit -m "feat: add repasse summary page"
```

---

### Task 7: Create repasse detail page (per professional)

**Files:**
- Create: `src/app/financeiro/repasse/[professionalId]/page.tsx`

**Step 1: Create the detail page**

This page shows the full breakdown for a single professional. It fetches from `GET /api/financeiro/repasse/[professionalId]?year=X&month=Y`.

The page should show:
- Professional name + month/year header
- Summary cards: Total Bruto, Imposto, Líquido, Repasse
- Category breakdown table (Individual, Grupo, Reunião Escola, Extra) with count + repasse per category
- Detailed line items table: Data, Paciente, Grupo, Bruto, Imposto, Líquido, Repasse
- Items sorted by date ascending
- Back link to `/financeiro/repasse`

The year/month should come from URL query params (passed from the summary page link) since the detail page won't have the filter bar.

**Step 2: Run type check + build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/financeiro/repasse/[professionalId]/page.tsx
git commit -m "feat: add repasse detail page per professional"
```

---

### Task 8: Final verification

**Step 1: Run all tests**

Run: `npm run test`
Expected: ALL PASS

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Manual smoke test**

1. Go to `/financeiro/repasse` — should see the Repasse tab active
2. Select a month — should see professional list with repasse values
3. Click a professional — should see detailed breakdown
4. Verify the math: gross × (1 - tax%) × repasse% = repasse value

**Step 4: Final commit (if any fixes needed)**
