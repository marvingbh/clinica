# Financial Control System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement pre-paid session invoicing, credit management, PDF generation, and per-professional financial dashboards.

**Architecture:** Invoice-centric model with dedicated Invoice, InvoiceItem, and SessionCredit tables. Invoice generation is manual (professional clicks "Gerar Faturas"). Credits are session-based, consumed FIFO at invoice time. PDF via @react-pdf/renderer. Cancellation flow splits into CANCELADO_ACORDADO (credit) and CANCELADO_FALTA (no credit).

**Tech Stack:** Next.js 16, Prisma, Vitest, @react-pdf/renderer, react-hook-form, zod, recharts, lucide-react

**Design doc:** `docs/plans/2026-02-21-financial-control-design.md`

---

### Task 1: Update Prisma Schema — New enums and models

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add new enums after existing enums block (~line 84)**

Add these enums after the `AppointmentType` enum:

```prisma
enum InvoiceStatus {
  PENDENTE
  PAGO
  CANCELADO
}

enum InvoiceItemType {
  SESSAO_REGULAR
  SESSAO_EXTRA
  SESSAO_GRUPO
  REUNIAO_ESCOLA
  CREDITO
}
```

**Step 2: Replace AppointmentStatus enum (lines 25-32)**

Replace:
```prisma
enum AppointmentStatus {
  AGENDADO
  CONFIRMADO
  CANCELADO_PACIENTE
  CANCELADO_PROFISSIONAL
  NAO_COMPARECEU
  FINALIZADO
}
```

With:
```prisma
enum AppointmentStatus {
  AGENDADO
  CONFIRMADO
  CANCELADO_ACORDADO
  CANCELADO_FALTA
  CANCELADO_PROFISSIONAL
  FINALIZADO
}
```

**Step 3: Add `creditGenerated` field to Appointment model (after `confirmedAt` field, ~line 365)**

```prisma
  creditGenerated   Boolean             @default(false)
```

**Step 4: Add fields to Patient model (after `sessionFee` field, ~line 291)**

```prisma
  showAppointmentDaysOnInvoice Boolean @default(false)
  invoiceMessageTemplate       String? // Overrides clinic default for invoice text
```

**Step 5: Add field to Clinic model (after `reminderHours` field, ~line 144)**

```prisma
  invoiceMessageTemplate String? // Default invoice message template with {{variables}}
```

**Step 6: Add Invoice model (after TherapyGroup models section)**

```prisma
// ============================================================================
// FINANCIAL MODELS
// ============================================================================

/// Monthly invoice for a patient
model Invoice {
  id                    String        @id @default(cuid())
  clinicId              String
  professionalProfileId String
  patientId             String
  referenceMonth        Int
  referenceYear         Int
  status                InvoiceStatus @default(PENDENTE)
  totalSessions         Int
  creditsApplied        Int
  extrasAdded           Int
  totalAmount           Decimal       @db.Decimal(10, 2)
  dueDate               DateTime      @db.Date
  paidAt                DateTime?
  notes                 String?
  showAppointmentDays   Boolean       @default(false)
  messageBody           String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic              Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  patient             Patient             @relation(fields: [patientId], references: [id], onDelete: Cascade)
  items               InvoiceItem[]
  consumedCredits     SessionCredit[]

  @@unique([professionalProfileId, patientId, referenceMonth, referenceYear])
  @@index([clinicId])
  @@index([professionalProfileId])
  @@index([patientId])
  @@index([status])
  @@index([clinicId, referenceYear, referenceMonth])
  @@index([professionalProfileId, referenceYear, referenceMonth])
}

/// Line item on an invoice
model InvoiceItem {
  id            String          @id @default(cuid())
  invoiceId     String
  appointmentId String?
  type          InvoiceItemType
  description   String
  quantity      Int             @default(1)
  unitPrice     Decimal         @db.Decimal(10, 2)
  total         Decimal         @db.Decimal(10, 2)

  createdAt DateTime @default(now())

  invoice     Invoice      @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  appointment Appointment? @relation(fields: [appointmentId], references: [id], onDelete: SetNull)

  @@index([invoiceId])
  @@index([appointmentId])
}

/// Session credit from a cancelled appointment (CANCELADO_ACORDADO)
model SessionCredit {
  id                    String    @id @default(cuid())
  clinicId              String
  professionalProfileId String
  patientId             String
  originAppointmentId   String
  reason                String
  consumedByInvoiceId   String?
  consumedAt            DateTime?

  createdAt DateTime @default(now())

  clinic              Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  patient             Patient             @relation(fields: [patientId], references: [id], onDelete: Cascade)
  originAppointment   Appointment         @relation(fields: [originAppointmentId], references: [id], onDelete: Cascade)
  consumedByInvoice   Invoice?            @relation(fields: [consumedByInvoiceId], references: [id], onDelete: SetNull)

  @@index([clinicId])
  @@index([professionalProfileId])
  @@index([patientId])
  @@index([consumedByInvoiceId])
  @@index([professionalProfileId, patientId, consumedByInvoiceId])
}
```

**Step 7: Add relation arrays to existing models**

In **Clinic** model, add to relations:
```prisma
  invoices               Invoice[]
  invoiceItems           InvoiceItem[]
  sessionCredits         SessionCredit[]
```

Wait — InvoiceItem doesn't have clinicId. Only add:
```prisma
  invoices               Invoice[]
  sessionCredits         SessionCredit[]
```

In **ProfessionalProfile** model, add to relations:
```prisma
  invoices               Invoice[]
  sessionCredits         SessionCredit[]
```

In **Patient** model, add to relations:
```prisma
  invoices               Invoice[]
  sessionCredits         SessionCredit[]
```

In **Appointment** model, add to relations:
```prisma
  invoiceItems           InvoiceItem[]
  sessionCredits         SessionCredit[]
```

**Step 8: Push schema changes**

Run: `npx prisma db push`
Expected: Schema pushed successfully (may warn about data loss for enum rename — accept since CANCELADO_PACIENTE/NAO_COMPARECEU are being replaced).

**Step 9: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add Invoice, InvoiceItem, SessionCredit models and update AppointmentStatus enum"
```

---

### Task 2: Migrate existing appointment statuses in database

**Files:**
- Create: `prisma/migrate-statuses.ts`

The enum change from CANCELADO_PACIENTE → CANCELADO_ACORDADO and NAO_COMPARECEU → CANCELADO_FALTA needs existing data migrated. `prisma db push` with enum changes may fail if rows reference old values.

**Step 1: Create migration script**

```typescript
// prisma/migrate-statuses.ts
import { PrismaClient } from "@/generated/prisma"

const prisma = new PrismaClient()

async function main() {
  // Update CANCELADO_PACIENTE → CANCELADO_ACORDADO
  const updated1 = await prisma.$executeRaw`
    UPDATE "Appointment"
    SET status = 'CANCELADO_ACORDADO'
    WHERE status = 'CANCELADO_PACIENTE'
  `
  console.log(`Updated ${updated1} CANCELADO_PACIENTE → CANCELADO_ACORDADO`)

  // Update NAO_COMPARECEU → CANCELADO_FALTA
  const updated2 = await prisma.$executeRaw`
    UPDATE "Appointment"
    SET status = 'CANCELADO_FALTA'
    WHERE status = 'NAO_COMPARECEU'
  `
  console.log(`Updated ${updated2} NAO_COMPARECEU → CANCELADO_FALTA`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

**Step 2: Run the migration BEFORE pushing schema**

Actually, the correct order is:
1. First add the new enum values (CANCELADO_ACORDADO, CANCELADO_FALTA) to the existing enum WITHOUT removing old ones
2. Run migration script to update data
3. Then remove old enum values

Since we use `prisma db push`, we need to do this carefully:

**Alternative approach:** Use raw SQL to alter the enum:

```typescript
// prisma/migrate-statuses.ts
import { PrismaClient } from "@/generated/prisma"

const prisma = new PrismaClient()

async function main() {
  // Add new enum values
  await prisma.$executeRaw`ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'CANCELADO_ACORDADO'`
  await prisma.$executeRaw`ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'CANCELADO_FALTA'`

  // Migrate data
  const updated1 = await prisma.$executeRaw`
    UPDATE "Appointment" SET status = 'CANCELADO_ACORDADO' WHERE status = 'CANCELADO_PACIENTE'
  `
  console.log(`Updated ${updated1} CANCELADO_PACIENTE → CANCELADO_ACORDADO`)

  const updated2 = await prisma.$executeRaw`
    UPDATE "Appointment" SET status = 'CANCELADO_FALTA' WHERE status = 'NAO_COMPARECEU'
  `
  console.log(`Updated ${updated2} NAO_COMPARECEU → CANCELADO_FALTA`)

  console.log("Done! Now run: npx prisma db push")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

**Step 3: Add script to package.json**

```json
"prisma:migrate:statuses": "npx tsx prisma/migrate-statuses.ts"
```

**Step 4: Run migration then push**

Run: `npm run prisma:migrate:statuses`
Expected: Enum values added, data migrated.

Then run: `npx prisma db push`
Expected: Schema synced with new enum values and removed old ones.

**Step 5: Commit**

```bash
git add prisma/migrate-statuses.ts package.json
git commit -m "feat: add status migration script CANCELADO_PACIENTE→ACORDADO, NAO_COMPARECEU→FALTA"
```

---

### Task 3: Update all references to old AppointmentStatus values

**Files:**
- Modify: Multiple files across the codebase that reference `CANCELADO_PACIENTE` or `NAO_COMPARECEU`

**Step 1: Search for all references**

Run: `grep -r "CANCELADO_PACIENTE\|NAO_COMPARECEU" src/ --include="*.ts" --include="*.tsx" -l`

**Step 2: Replace in each file**

For every file found:
- Replace `CANCELADO_PACIENTE` with `CANCELADO_ACORDADO`
- Replace `NAO_COMPARECEU` with `CANCELADO_FALTA`
- Replace display labels: "Cancelado Paciente" → "Acordado", "Não Compareceu" → "Falta"

Key files to check:
- `src/app/api/appointments/[id]/status/route.ts` — VALID_TRANSITIONS map
- `src/app/api/appointments/cancel/route.ts` — token-based cancel
- `src/app/api/appointments/confirm/route.ts` — may reference statuses
- `src/app/agenda/components/` — status badges, colors
- `src/lib/` — any status helpers, field labels
- `src/app/patients/` — appointment history with status filters

**Step 3: Update VALID_TRANSITIONS in status route**

The transitions map needs updating. The new valid transitions:
```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  AGENDADO: ["CONFIRMADO", "FINALIZADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL", "CANCELADO_ACORDADO"],
  CONFIRMADO: ["FINALIZADO", "CANCELADO_FALTA", "CANCELADO_PROFISSIONAL", "CANCELADO_ACORDADO"],
  CANCELADO_ACORDADO: ["CANCELADO_FALTA"], // Can switch to FALTA (removes credit)
  CANCELADO_FALTA: ["CANCELADO_ACORDADO"], // Can switch to ACORDADO (creates credit)
  CANCELADO_PROFISSIONAL: [],
  FINALIZADO: [],
}
```

**Step 4: Run build to verify no broken references**

Run: `npm run build`
Expected: Build succeeds with no type errors.

**Step 5: Run tests**

Run: `npm run test`
Expected: All tests pass (some may need updating for new status values).

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: replace CANCELADO_PACIENTE/NAO_COMPARECEU with CANCELADO_ACORDADO/CANCELADO_FALTA"
```

---

### Task 4: Invoice template renderer (TDD)

**Files:**
- Create: `src/lib/financeiro/invoice-template.ts`
- Create: `src/lib/financeiro/invoice-template.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/financeiro/invoice-template.test.ts
import { describe, it, expect } from "vitest"
import { renderInvoiceTemplate, DEFAULT_INVOICE_TEMPLATE, type TemplateVariables } from "./invoice-template"

const baseVars: TemplateVariables = {
  paciente: "João Silva",
  mae: "Maria Silva",
  pai: "Carlos Silva",
  valor: "R$ 600,00",
  mes: "Março",
  ano: "2026",
  vencimento: "15/03/2026",
  sessoes: "4",
  profissional: "Dra. Ana Costa",
}

describe("renderInvoiceTemplate", () => {
  it("replaces all variables in template", () => {
    const template = "Paciente: {{paciente}}, Mãe: {{mae}}, Valor: {{valor}}"
    const result = renderInvoiceTemplate(template, baseVars)
    expect(result).toBe("Paciente: João Silva, Mãe: Maria Silva, Valor: R$ 600,00")
  })

  it("handles missing variables by leaving placeholder", () => {
    const template = "{{paciente}} - {{unknown}}"
    const result = renderInvoiceTemplate(template, baseVars)
    expect(result).toBe("João Silva - {{unknown}}")
  })

  it("handles null/undefined father name", () => {
    const vars = { ...baseVars, pai: "" }
    const template = "Pai: {{pai}}"
    const result = renderInvoiceTemplate(template, vars)
    expect(result).toBe("Pai: ")
  })

  it("renders the default template with all variables", () => {
    const result = renderInvoiceTemplate(DEFAULT_INVOICE_TEMPLATE, baseVars)
    expect(result).toContain("João Silva")
    expect(result).toContain("Maria Silva")
    expect(result).toContain("R$ 600,00")
    expect(result).toContain("15/03/2026")
    expect(result).toContain("Março")
    expect(result).toContain("2026")
    expect(result).toContain("4")
    expect(result).toContain("Dra. Ana Costa")
  })

  it("resolves template with patient override over clinic default", () => {
    const patientTemplate = "Olá {{mae}}, valor: {{valor}}"
    const clinicTemplate = "Prezado(a), segue fatura de {{paciente}}"
    const result = renderInvoiceTemplate(patientTemplate || clinicTemplate, baseVars)
    expect(result).toBe("Olá Maria Silva, valor: R$ 600,00")
  })

  it("falls back to clinic template when patient template is null", () => {
    const patientTemplate: string | null = null
    const clinicTemplate = "Clínica default: {{paciente}}"
    const result = renderInvoiceTemplate(patientTemplate || clinicTemplate || DEFAULT_INVOICE_TEMPLATE, baseVars)
    expect(result).toBe("Clínica default: João Silva")
  })
})

describe("DEFAULT_INVOICE_TEMPLATE", () => {
  it("contains all expected variable placeholders", () => {
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{paciente}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{mae}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{valor}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{vencimento}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{sessoes}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{profissional}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{mes}}")
    expect(DEFAULT_INVOICE_TEMPLATE).toContain("{{ano}}")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/financeiro/invoice-template.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/financeiro/invoice-template.ts

export interface TemplateVariables {
  paciente: string
  mae: string
  pai: string
  valor: string
  mes: string
  ano: string
  vencimento: string
  sessoes: string
  profissional: string
}

export const DEFAULT_INVOICE_TEMPLATE = `Prezado(a) {{mae}},

Segue a fatura de {{paciente}} referente ao mês de {{mes}}/{{ano}}.

Valor: {{valor}}
Vencimento: {{vencimento}}
Total de sessões: {{sessoes}}

Atenciosamente,
{{profissional}}`

export function renderInvoiceTemplate(
  template: string,
  variables: TemplateVariables
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key as keyof TemplateVariables]
    return value !== undefined ? value : match
  })
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/financeiro/invoice-template.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/financeiro/invoice-template.ts src/lib/financeiro/invoice-template.test.ts
git commit -m "feat: add invoice message template renderer with TDD"
```

---

### Task 5: Invoice generation helpers (TDD)

**Files:**
- Create: `src/lib/financeiro/invoice-generator.ts`
- Create: `src/lib/financeiro/invoice-generator.test.ts`

These are pure functions that calculate invoice data from appointment data. No Prisma calls — just logic.

**Step 1: Write the failing tests**

```typescript
// src/lib/financeiro/invoice-generator.test.ts
import { describe, it, expect } from "vitest"
import {
  classifyAppointments,
  buildInvoiceItems,
  calculateInvoiceTotals,
  type AppointmentForInvoice,
  type CreditForInvoice,
} from "./invoice-generator"

const makeAppointment = (overrides: Partial<AppointmentForInvoice> = {}): AppointmentForInvoice => ({
  id: "apt-1",
  scheduledAt: new Date("2026-03-05T10:00:00"),
  status: "FINALIZADO",
  type: "CONSULTA",
  recurrenceId: "rec-1",
  groupId: null,
  price: null,
  ...overrides,
})

describe("classifyAppointments", () => {
  it("classifies recurrence appointment as SESSAO_REGULAR", () => {
    const result = classifyAppointments([makeAppointment({ recurrenceId: "rec-1", groupId: null })])
    expect(result.regular).toHaveLength(1)
    expect(result.extra).toHaveLength(0)
    expect(result.group).toHaveLength(0)
    expect(result.schoolMeeting).toHaveLength(0)
  })

  it("classifies non-recurrence CONSULTA as SESSAO_EXTRA", () => {
    const result = classifyAppointments([makeAppointment({ recurrenceId: null, groupId: null, type: "CONSULTA" })])
    expect(result.regular).toHaveLength(0)
    expect(result.extra).toHaveLength(1)
  })

  it("classifies group appointment as SESSAO_GRUPO", () => {
    const result = classifyAppointments([makeAppointment({ groupId: "grp-1", recurrenceId: null })])
    expect(result.group).toHaveLength(1)
  })

  it("classifies REUNIAO as REUNIAO_ESCOLA", () => {
    const result = classifyAppointments([makeAppointment({ type: "REUNIAO", recurrenceId: null, groupId: null })])
    expect(result.schoolMeeting).toHaveLength(1)
  })

  it("excludes cancelled appointments (CANCELADO_FALTA)", () => {
    const result = classifyAppointments([makeAppointment({ status: "CANCELADO_FALTA" })])
    expect(result.regular).toHaveLength(0)
  })

  it("excludes CANCELADO_ACORDADO appointments", () => {
    const result = classifyAppointments([makeAppointment({ status: "CANCELADO_ACORDADO" })])
    expect(result.regular).toHaveLength(0)
  })

  it("excludes CANCELADO_PROFISSIONAL appointments", () => {
    const result = classifyAppointments([makeAppointment({ status: "CANCELADO_PROFISSIONAL" })])
    expect(result.regular).toHaveLength(0)
  })

  it("includes AGENDADO, CONFIRMADO, FINALIZADO", () => {
    const apts = [
      makeAppointment({ id: "a1", status: "AGENDADO" }),
      makeAppointment({ id: "a2", status: "CONFIRMADO" }),
      makeAppointment({ id: "a3", status: "FINALIZADO" }),
    ]
    const result = classifyAppointments(apts)
    expect(result.regular).toHaveLength(3)
  })
})

describe("buildInvoiceItems", () => {
  const sessionFee = 150

  it("creates one item per regular session", () => {
    const classified = {
      regular: [makeAppointment()],
      extra: [],
      group: [],
      schoolMeeting: [],
    }
    const items = buildInvoiceItems(classified, sessionFee, [], true)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("SESSAO_REGULAR")
    expect(items[0].unitPrice).toBe(150)
    expect(items[0].total).toBe(150)
  })

  it("uses appointment price when available instead of sessionFee", () => {
    const classified = {
      regular: [makeAppointment({ price: 200 })],
      extra: [],
      group: [],
      schoolMeeting: [],
    }
    const items = buildInvoiceItems(classified, sessionFee, [], false)
    expect(items[0].unitPrice).toBe(200)
  })

  it("includes appointment date in description when showDays is true", () => {
    const classified = {
      regular: [makeAppointment({ scheduledAt: new Date("2026-03-05T10:00:00") })],
      extra: [],
      group: [],
      schoolMeeting: [],
    }
    const items = buildInvoiceItems(classified, sessionFee, [], true)
    expect(items[0].description).toContain("05/03")
  })

  it("does not include date in description when showDays is false", () => {
    const classified = {
      regular: [makeAppointment({ scheduledAt: new Date("2026-03-05T10:00:00") })],
      extra: [],
      group: [],
      schoolMeeting: [],
    }
    const items = buildInvoiceItems(classified, sessionFee, [], false)
    expect(items[0].description).not.toContain("05/03")
  })

  it("adds credit items as negative values", () => {
    const credits: CreditForInvoice[] = [
      { id: "cred-1", reason: "Cancelamento acordado - 28/02/2026", createdAt: new Date("2026-02-28") },
    ]
    const classified = { regular: [makeAppointment()], extra: [], group: [], schoolMeeting: [] }
    const items = buildInvoiceItems(classified, sessionFee, credits, false)
    const creditItem = items.find(i => i.type === "CREDITO")
    expect(creditItem).toBeDefined()
    expect(creditItem!.total).toBe(-150)
    expect(creditItem!.unitPrice).toBe(150)
    expect(creditItem!.quantity).toBe(-1)
  })

  it("creates correct types for extras, groups, and school meetings", () => {
    const classified = {
      regular: [],
      extra: [makeAppointment({ id: "e1", recurrenceId: null, type: "CONSULTA" })],
      group: [makeAppointment({ id: "g1", groupId: "grp-1" })],
      schoolMeeting: [makeAppointment({ id: "s1", type: "REUNIAO" })],
    }
    const items = buildInvoiceItems(classified, sessionFee, [], false)
    expect(items.map(i => i.type)).toEqual(["SESSAO_EXTRA", "SESSAO_GRUPO", "REUNIAO_ESCOLA"])
  })
})

describe("calculateInvoiceTotals", () => {
  it("calculates totals from items", () => {
    const items = [
      { type: "SESSAO_REGULAR" as const, total: 150, quantity: 1 },
      { type: "SESSAO_REGULAR" as const, total: 150, quantity: 1 },
      { type: "SESSAO_EXTRA" as const, total: 150, quantity: 1 },
      { type: "CREDITO" as const, total: -150, quantity: -1 },
    ]
    const totals = calculateInvoiceTotals(items)
    expect(totals.totalSessions).toBe(3) // 2 regular + 1 extra (credit doesn't count as session)
    expect(totals.creditsApplied).toBe(1)
    expect(totals.extrasAdded).toBe(1)
    expect(totals.totalAmount).toBe(300) // 450 - 150
  })

  it("handles zero items", () => {
    const totals = calculateInvoiceTotals([])
    expect(totals.totalSessions).toBe(0)
    expect(totals.creditsApplied).toBe(0)
    expect(totals.extrasAdded).toBe(0)
    expect(totals.totalAmount).toBe(0)
  })

  it("counts group sessions and school meetings in totalSessions", () => {
    const items = [
      { type: "SESSAO_GRUPO" as const, total: 150, quantity: 1 },
      { type: "REUNIAO_ESCOLA" as const, total: 150, quantity: 1 },
    ]
    const totals = calculateInvoiceTotals(items)
    expect(totals.totalSessions).toBe(2)
    expect(totals.totalAmount).toBe(300)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/financeiro/invoice-generator.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/lib/financeiro/invoice-generator.ts

export interface AppointmentForInvoice {
  id: string
  scheduledAt: Date
  status: string
  type: string
  recurrenceId: string | null
  groupId: string | null
  price: number | null
}

export interface CreditForInvoice {
  id: string
  reason: string
  createdAt: Date
}

export interface ClassifiedAppointments {
  regular: AppointmentForInvoice[]
  extra: AppointmentForInvoice[]
  group: AppointmentForInvoice[]
  schoolMeeting: AppointmentForInvoice[]
}

export interface InvoiceItemData {
  appointmentId: string | null
  type: "SESSAO_REGULAR" | "SESSAO_EXTRA" | "SESSAO_GRUPO" | "REUNIAO_ESCOLA" | "CREDITO"
  description: string
  quantity: number
  unitPrice: number
  total: number
  creditId?: string
}

export interface InvoiceTotals {
  totalSessions: number
  creditsApplied: number
  extrasAdded: number
  totalAmount: number
}

const BILLABLE_STATUSES = ["AGENDADO", "CONFIRMADO", "FINALIZADO"]

export function classifyAppointments(
  appointments: AppointmentForInvoice[]
): ClassifiedAppointments {
  const billable = appointments.filter(a => BILLABLE_STATUSES.includes(a.status))

  const regular: AppointmentForInvoice[] = []
  const extra: AppointmentForInvoice[] = []
  const group: AppointmentForInvoice[] = []
  const schoolMeeting: AppointmentForInvoice[] = []

  for (const apt of billable) {
    if (apt.groupId) {
      group.push(apt)
    } else if (apt.type === "REUNIAO") {
      schoolMeeting.push(apt)
    } else if (apt.recurrenceId) {
      regular.push(apt)
    } else {
      extra.push(apt)
    }
  }

  return { regular, extra, group, schoolMeeting }
}

function formatDateBR(date: Date): string {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}/${month}`
}

function getItemDescription(
  type: InvoiceItemData["type"],
  apt: AppointmentForInvoice,
  showDays: boolean
): string {
  const dateStr = showDays ? ` - ${formatDateBR(apt.scheduledAt)}` : ""
  switch (type) {
    case "SESSAO_REGULAR": return `Sessão${dateStr}`
    case "SESSAO_EXTRA": return `Sessão extra${dateStr}`
    case "SESSAO_GRUPO": return `Sessão grupo${dateStr}`
    case "REUNIAO_ESCOLA": return `Reunião escola${dateStr}`
    default: return `Item${dateStr}`
  }
}

function getPrice(apt: AppointmentForInvoice, sessionFee: number): number {
  return apt.price ?? sessionFee
}

export function buildInvoiceItems(
  classified: ClassifiedAppointments,
  sessionFee: number,
  credits: CreditForInvoice[],
  showDays: boolean
): InvoiceItemData[] {
  const items: InvoiceItemData[] = []

  const addItems = (
    apts: AppointmentForInvoice[],
    type: InvoiceItemData["type"]
  ) => {
    for (const apt of apts) {
      const price = getPrice(apt, sessionFee)
      items.push({
        appointmentId: apt.id,
        type,
        description: getItemDescription(type, apt, showDays),
        quantity: 1,
        unitPrice: price,
        total: price,
      })
    }
  }

  addItems(classified.regular, "SESSAO_REGULAR")
  addItems(classified.extra, "SESSAO_EXTRA")
  addItems(classified.group, "SESSAO_GRUPO")
  addItems(classified.schoolMeeting, "REUNIAO_ESCOLA")

  // Add credit items (negative)
  for (const credit of credits) {
    items.push({
      appointmentId: null,
      type: "CREDITO",
      description: `Crédito: ${credit.reason}`,
      quantity: -1,
      unitPrice: sessionFee,
      total: -sessionFee,
      creditId: credit.id,
    })
  }

  return items
}

export function calculateInvoiceTotals(
  items: Pick<InvoiceItemData, "type" | "total" | "quantity">[]
): InvoiceTotals {
  let totalSessions = 0
  let creditsApplied = 0
  let extrasAdded = 0
  let totalAmount = 0

  for (const item of items) {
    totalAmount += item.total
    if (item.type === "CREDITO") {
      creditsApplied += Math.abs(item.quantity)
    } else {
      totalSessions += item.quantity
      if (item.type === "SESSAO_EXTRA") {
        extrasAdded += item.quantity
      }
    }
  }

  return { totalSessions, creditsApplied, extrasAdded, totalAmount }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/financeiro/invoice-generator.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/financeiro/invoice-generator.ts src/lib/financeiro/invoice-generator.test.ts
git commit -m "feat: add invoice generation helpers with TDD (classify, build items, calculate totals)"
```

---

### Task 6: Month name helper (TDD)

**Files:**
- Create: `src/lib/financeiro/format.ts`
- Create: `src/lib/financeiro/format.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/lib/financeiro/format.test.ts
import { describe, it, expect } from "vitest"
import { getMonthName, formatCurrencyBRL, formatInvoiceReference } from "./format"

describe("getMonthName", () => {
  it("returns Janeiro for month 1", () => {
    expect(getMonthName(1)).toBe("Janeiro")
  })
  it("returns Dezembro for month 12", () => {
    expect(getMonthName(12)).toBe("Dezembro")
  })
  it("returns Março for month 3", () => {
    expect(getMonthName(3)).toBe("Março")
  })
})

describe("formatCurrencyBRL", () => {
  it("formats 150 as R$ 150,00", () => {
    expect(formatCurrencyBRL(150)).toBe("R$ 150,00")
  })
  it("formats 1500.50 correctly", () => {
    expect(formatCurrencyBRL(1500.50)).toBe("R$ 1.500,50")
  })
  it("formats 0 as R$ 0,00", () => {
    expect(formatCurrencyBRL(0)).toBe("R$ 0,00")
  })
  it("formats negative values", () => {
    const result = formatCurrencyBRL(-150)
    expect(result).toContain("150,00")
  })
})

describe("formatInvoiceReference", () => {
  it("formats month/year as 'Março/2026'", () => {
    expect(formatInvoiceReference(3, 2026)).toBe("Março/2026")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/financeiro/format.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

```typescript
// src/lib/financeiro/format.ts

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] || ""
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export function formatInvoiceReference(month: number, year: number): string {
  return `${getMonthName(month)}/${year}`
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/financeiro/format.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/lib/financeiro/format.ts src/lib/financeiro/format.test.ts
git commit -m "feat: add financial formatting helpers with TDD (month names, currency, references)"
```

---

### Task 7: Add RBAC permissions for finances

**Files:**
- Modify: `src/lib/rbac/types.ts`
- Modify: `src/lib/rbac/permissions.ts`

**Step 1: Add "finances" feature to the features list**

In `src/lib/rbac/types.ts`, add `"finances"` to the `Feature` type and `FEATURES` array.

**Step 2: Add default permissions for both roles**

In `src/lib/rbac/permissions.ts`, add to `ROLE_DEFAULTS`:
- ADMIN: `finances: "WRITE"`
- PROFESSIONAL: `finances: "WRITE"`

Both roles can manage their own finances. The ownership scoping is handled in the API routes (professionals see only their own patients).

**Step 3: Also add legacy resource permission for "invoice"**

In `rolePermissions`, add:
```typescript
// ADMIN
{ resource: "invoice", action: "create", scope: "clinic" },
{ resource: "invoice", action: "read", scope: "clinic" },
{ resource: "invoice", action: "update", scope: "clinic" },
{ resource: "invoice", action: "delete", scope: "clinic" },

// PROFESSIONAL
{ resource: "invoice", action: "create", scope: "own" },
{ resource: "invoice", action: "read", scope: "own" },
{ resource: "invoice", action: "update", scope: "own" },
{ resource: "invoice", action: "delete", scope: "own" },
```

**Step 4: Run tests to verify RBAC still works**

Run: `npx vitest run src/lib/rbac/`
Expected: All RBAC tests pass

**Step 5: Commit**

```bash
git add src/lib/rbac/types.ts src/lib/rbac/permissions.ts
git commit -m "feat: add finances RBAC permissions for ADMIN and PROFESSIONAL roles"
```

---

### Task 8: Add navigation item for Financeiro

**Files:**
- Modify: `src/shared/components/ui/desktop-header.tsx`
- Modify: `src/shared/components/ui/bottom-navigation.tsx`

**Step 1: Add Financeiro nav item to desktop header**

Add after the existing nav items (probably after "Pacientes" or "Grupos"):
```typescript
{
  href: "/financeiro",
  label: "Financeiro",
  icon: <DollarSignIcon className="w-5 h-5" strokeWidth={1.5} />,
  activeIcon: <DollarSignIcon className="w-5 h-5" strokeWidth={2} />,
  matchPaths: ["/financeiro"],
  feature: "finances" as Feature,
}
```

Import `DollarSignIcon` from lucide-react (or use an existing icon from the icons file).

**Step 2: Add to mobile bottom navigation**

Same nav item pattern for the bottom nav. May need to handle the icon size for mobile (w-6 h-6).

**Step 3: Verify navigation renders**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/shared/components/ui/desktop-header.tsx src/shared/components/ui/bottom-navigation.tsx
git commit -m "feat: add Financeiro navigation item with finances permission gating"
```

---

### Task 9: Credit management in appointment status route

**Files:**
- Modify: `src/app/api/appointments/[id]/status/route.ts`

**Step 1: Add credit creation logic for CANCELADO_ACORDADO**

When status changes to `CANCELADO_ACORDADO`, auto-create a `SessionCredit`:

```typescript
// After updating appointment status...
if (targetStatus === "CANCELADO_ACORDADO" && appointment.patientId) {
  await prisma.sessionCredit.create({
    data: {
      clinicId: user.clinicId,
      professionalProfileId: appointment.professionalProfileId,
      patientId: appointment.patientId,
      originAppointmentId: appointment.id,
      reason: `Cancelamento acordado - ${new Date(appointment.scheduledAt).toLocaleDateString("pt-BR")}`,
    },
  })
  // Mark appointment as credit-generating
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { creditGenerated: true },
  })
}
```

**Step 2: Add credit deletion when switching from ACORDADO → FALTA**

```typescript
if (currentStatus === "CANCELADO_ACORDADO" && targetStatus === "CANCELADO_FALTA") {
  // Delete the credit if it hasn't been consumed
  const credit = await prisma.sessionCredit.findFirst({
    where: {
      originAppointmentId: appointment.id,
      consumedByInvoiceId: null,
    },
  })
  if (credit) {
    await prisma.sessionCredit.delete({ where: { id: credit.id } })
  } else {
    return NextResponse.json(
      { error: "Crédito já foi utilizado em uma fatura. Não é possível alterar para Falta." },
      { status: 400 }
    )
  }
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { creditGenerated: false },
  })
}
```

**Step 3: Add credit creation when switching from FALTA → ACORDADO**

```typescript
if (currentStatus === "CANCELADO_FALTA" && targetStatus === "CANCELADO_ACORDADO" && appointment.patientId) {
  await prisma.sessionCredit.create({
    data: {
      clinicId: user.clinicId,
      professionalProfileId: appointment.professionalProfileId,
      patientId: appointment.patientId,
      originAppointmentId: appointment.id,
      reason: `Cancelamento acordado - ${new Date(appointment.scheduledAt).toLocaleDateString("pt-BR")}`,
    },
  })
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { creditGenerated: true },
  })
}
```

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/app/api/appointments/[id]/status/route.ts
git commit -m "feat: auto-create/delete session credits on ACORDADO/FALTA status transitions"
```

---

### Task 10: Credits API route

**Files:**
- Create: `src/app/api/financeiro/creditos/route.ts`

**Step 1: Implement GET endpoint**

```typescript
// src/app/api/financeiro/creditos/route.ts
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const GET = withAuth(
  { resource: "invoice", action: "read" },
  async (req: NextRequest, { user, scope }) => {
    const url = new URL(req.url)
    const patientId = url.searchParams.get("patientId")
    const status = url.searchParams.get("status") // "available" | "consumed" | null (all)

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    // Scope: professionals see only their own patients
    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    }

    if (patientId) where.patientId = patientId

    if (status === "available") {
      where.consumedByInvoiceId = null
    } else if (status === "consumed") {
      where.consumedByInvoiceId = { not: null }
    }

    const credits = await prisma.sessionCredit.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true } },
        originAppointment: { select: { id: true, scheduledAt: true } },
        consumedByInvoice: { select: { id: true, referenceMonth: true, referenceYear: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(credits)
  }
)
```

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/financeiro/creditos/route.ts
git commit -m "feat: add credits listing API with scope-based filtering"
```

---

### Task 11: Invoice generation API route

**Files:**
- Create: `src/app/api/financeiro/faturas/gerar/route.ts`

**Step 1: Implement POST endpoint**

This is the core route that generates invoices for a given month/year. It:
1. Finds all patients with appointments in the target month for the professional
2. For each patient, classifies appointments, collects credits, builds items
3. Renders the message template
4. Creates Invoice + InvoiceItems in a transaction

```typescript
// src/app/api/financeiro/faturas/gerar/route.ts
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { classifyAppointments, buildInvoiceItems, calculateInvoiceTotals } from "@/lib/financeiro/invoice-generator"
import { renderInvoiceTemplate, DEFAULT_INVOICE_TEMPLATE } from "@/lib/financeiro/invoice-template"
import { getMonthName, formatCurrencyBRL } from "@/lib/financeiro/format"

const schema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  professionalProfileId: z.string().optional(), // Admin can specify; professional uses own
})

export const POST = withAuth(
  { resource: "invoice", action: "create" },
  async (req: NextRequest, { user, scope }) => {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const { month, year } = parsed.data
    let professionalProfileId = parsed.data.professionalProfileId

    // Professionals can only generate for themselves
    if (scope === "own" || !professionalProfileId) {
      professionalProfileId = user.professionalProfileId!
    }

    // Date range for the target month
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 1) // First day of next month

    // Due date: 15th of the month
    const dueDate = new Date(year, month - 1, 15)

    // Find all appointments for this professional in the target month with a patient
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        professionalProfileId,
        patientId: { not: null },
        scheduledAt: { gte: startDate, lt: endDate },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        type: true,
        recurrenceId: true,
        groupId: true,
        price: true,
        patientId: true,
      },
    })

    // Group by patient
    const byPatient = new Map<string, typeof appointments>()
    for (const apt of appointments) {
      if (!apt.patientId) continue
      const list = byPatient.get(apt.patientId) || []
      list.push(apt)
      byPatient.set(apt.patientId, list)
    }

    if (byPatient.size === 0) {
      return NextResponse.json({ error: "Nenhum paciente com agendamentos neste mês" }, { status: 404 })
    }

    // Get patient data and clinic data for template
    const patientIds = Array.from(byPatient.keys())
    const [patients, clinic, professional] = await Promise.all([
      prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: {
          id: true,
          name: true,
          motherName: true,
          fatherName: true,
          sessionFee: true,
          showAppointmentDaysOnInvoice: true,
          invoiceMessageTemplate: true,
        },
      }),
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceMessageTemplate: true },
      }),
      prisma.professionalProfile.findUnique({
        where: { id: professionalProfileId },
        select: { user: { select: { name: true } } },
      }),
    ])

    const patientMap = new Map(patients.map(p => [p.id, p]))
    const profName = professional?.user?.name || ""

    // Generate invoices in transaction
    const results = await prisma.$transaction(async (tx) => {
      const invoices = []

      for (const [patientId, patientApts] of byPatient) {
        const patient = patientMap.get(patientId)
        if (!patient || !patient.sessionFee) continue

        const sessionFee = Number(patient.sessionFee)
        const showDays = patient.showAppointmentDaysOnInvoice

        // Delete existing invoice for this patient/month if regenerating
        await tx.invoice.deleteMany({
          where: {
            professionalProfileId,
            patientId,
            referenceMonth: month,
            referenceYear: year,
          },
        })

        // Free any credits consumed by the deleted invoice
        await tx.sessionCredit.updateMany({
          where: {
            professionalProfileId,
            patientId,
            consumedByInvoice: {
              referenceMonth: month,
              referenceYear: year,
            },
          },
          data: {
            consumedByInvoiceId: null,
            consumedAt: null,
          },
        })

        // Classify appointments
        const classified = classifyAppointments(
          patientApts.map(a => ({
            ...a,
            price: a.price ? Number(a.price) : null,
          }))
        )

        // Get available credits for this patient (FIFO - oldest first)
        const availableCredits = await tx.sessionCredit.findMany({
          where: {
            professionalProfileId,
            patientId,
            consumedByInvoiceId: null,
          },
          orderBy: { createdAt: "asc" },
        })

        // Build items
        const items = buildInvoiceItems(classified, sessionFee, availableCredits, showDays)
        const totals = calculateInvoiceTotals(items)

        // Render message template
        const template = patient.invoiceMessageTemplate
          || clinic?.invoiceMessageTemplate
          || DEFAULT_INVOICE_TEMPLATE
        const messageBody = renderInvoiceTemplate(template, {
          paciente: patient.name,
          mae: patient.motherName || "",
          pai: patient.fatherName || "",
          valor: formatCurrencyBRL(totals.totalAmount),
          mes: getMonthName(month),
          ano: String(year),
          vencimento: dueDate.toLocaleDateString("pt-BR"),
          sessoes: String(totals.totalSessions),
          profissional: profName,
        })

        // Create invoice
        const invoice = await tx.invoice.create({
          data: {
            clinicId: user.clinicId,
            professionalProfileId,
            patientId,
            referenceMonth: month,
            referenceYear: year,
            totalSessions: totals.totalSessions,
            creditsApplied: totals.creditsApplied,
            extrasAdded: totals.extrasAdded,
            totalAmount: totals.totalAmount,
            dueDate,
            showAppointmentDays: showDays,
            messageBody,
            items: {
              create: items.map(item => ({
                appointmentId: item.appointmentId,
                type: item.type,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.total,
              })),
            },
          },
        })

        // Mark credits as consumed
        const creditItems = items.filter(i => i.type === "CREDITO" && i.creditId)
        for (const ci of creditItems) {
          await tx.sessionCredit.update({
            where: { id: ci.creditId! },
            data: { consumedByInvoiceId: invoice.id, consumedAt: new Date() },
          })
        }

        invoices.push(invoice)
      }

      return invoices
    })

    return NextResponse.json({
      generated: results.length,
      invoices: results.map(inv => ({
        id: inv.id,
        patientId: inv.patientId,
        totalAmount: inv.totalAmount,
        status: inv.status,
      })),
    }, { status: 201 })
  }
)
```

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/financeiro/faturas/gerar/route.ts
git commit -m "feat: add invoice generation API route with credit consumption and template rendering"
```

---

### Task 12: Invoice CRUD API routes

**Files:**
- Create: `src/app/api/financeiro/faturas/route.ts` (GET - list)
- Create: `src/app/api/financeiro/faturas/[id]/route.ts` (GET detail, PATCH update, DELETE cancel)

**Step 1: Implement list endpoint (GET /api/financeiro/faturas)**

```typescript
// src/app/api/financeiro/faturas/route.ts
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const GET = withAuth(
  { resource: "invoice", action: "read" },
  async (req: NextRequest, { user, scope }) => {
    const url = new URL(req.url)
    const month = url.searchParams.get("month") ? parseInt(url.searchParams.get("month")!) : undefined
    const year = url.searchParams.get("year") ? parseInt(url.searchParams.get("year")!) : undefined
    const status = url.searchParams.get("status") || undefined
    const professionalId = url.searchParams.get("professionalId") || undefined
    const patientId = url.searchParams.get("patientId") || undefined

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
    }

    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    } else if (professionalId) {
      where.professionalProfileId = professionalId
    }

    if (month) where.referenceMonth = month
    if (year) where.referenceYear = year
    if (status) where.status = status
    if (patientId) where.patientId = patientId

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true } },
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        _count: { select: { items: true } },
      },
      orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }, { createdAt: "desc" }],
    })

    return NextResponse.json(invoices)
  }
)
```

**Step 2: Implement detail, update, delete (GET/PATCH/DELETE /api/financeiro/faturas/[id])**

```typescript
// src/app/api/financeiro/faturas/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// GET - Invoice detail with items
export const GET = withAuth(
  { resource: "invoice", action: "read" },
  async (req: NextRequest, { user, scope }, params: { id: string }) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      include: {
        patient: { select: { id: true, name: true, phone: true, motherName: true } },
        professionalProfile: { select: { id: true, user: { select: { name: true } } } },
        items: {
          include: {
            appointment: { select: { id: true, scheduledAt: true, status: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        consumedCredits: {
          select: { id: true, reason: true, createdAt: true },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    return NextResponse.json(invoice)
  }
)

const updateSchema = z.object({
  status: z.enum(["PENDENTE", "PAGO", "CANCELADO"]).optional(),
  notes: z.string().optional(),
  paidAt: z.string().datetime().optional().nullable(),
})

// PATCH - Update invoice status or notes
export const PATCH = withAuth(
  { resource: "invoice", action: "update" },
  async (req: NextRequest, { user, scope }, params: { id: string }) => {
    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.status) updateData.status = parsed.data.status
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes
    if (parsed.data.status === "PAGO") {
      updateData.paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date()
    }

    const updated = await prisma.invoice.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json(updated)
  }
)

// DELETE - Cancel/void an invoice (releases consumed credits)
export const DELETE = withAuth(
  { resource: "invoice", action: "delete" },
  async (req: NextRequest, { user, scope }, params: { id: string }) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    // Release consumed credits and delete invoice in transaction
    await prisma.$transaction(async (tx) => {
      await tx.sessionCredit.updateMany({
        where: { consumedByInvoiceId: params.id },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })
      await tx.invoice.delete({ where: { id: params.id } })
    })

    return NextResponse.json({ success: true })
  }
)
```

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/financeiro/faturas/route.ts src/app/api/financeiro/faturas/[id]/route.ts
git commit -m "feat: add invoice CRUD API routes (list, detail, update status, delete/void)"
```

---

### Task 13: Financial dashboard API route

**Files:**
- Create: `src/app/api/financeiro/dashboard/route.ts`

**Step 1: Implement GET endpoint**

```typescript
// src/app/api/financeiro/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const GET = withAuth(
  { resource: "invoice", action: "read" },
  async (req: NextRequest, { user, scope }) => {
    const url = new URL(req.url)
    const year = parseInt(url.searchParams.get("year") || String(new Date().getFullYear()))

    const where: Record<string, unknown> = {
      clinicId: user.clinicId,
      referenceYear: year,
    }

    if (scope === "own" && user.professionalProfileId) {
      where.professionalProfileId = user.professionalProfileId
    }

    const invoices = await prisma.invoice.findMany({
      where,
      select: {
        referenceMonth: true,
        status: true,
        totalAmount: true,
      },
    })

    // Aggregate by status
    let totalFaturado = 0
    let totalPendente = 0
    let totalPago = 0
    const byMonth: Record<number, { faturado: number; pendente: number; pago: number }> = {}

    for (const inv of invoices) {
      const amount = Number(inv.totalAmount)
      totalFaturado += amount
      if (inv.status === "PENDENTE") totalPendente += amount
      if (inv.status === "PAGO") totalPago += amount

      if (!byMonth[inv.referenceMonth]) {
        byMonth[inv.referenceMonth] = { faturado: 0, pendente: 0, pago: 0 }
      }
      byMonth[inv.referenceMonth].faturado += amount
      if (inv.status === "PENDENTE") byMonth[inv.referenceMonth].pendente += amount
      if (inv.status === "PAGO") byMonth[inv.referenceMonth].pago += amount
    }

    // Count available credits
    const creditWhere: Record<string, unknown> = {
      clinicId: user.clinicId,
      consumedByInvoiceId: null,
    }
    if (scope === "own" && user.professionalProfileId) {
      creditWhere.professionalProfileId = user.professionalProfileId
    }
    const availableCredits = await prisma.sessionCredit.count({ where: creditWhere })

    return NextResponse.json({
      year,
      totalFaturado,
      totalPendente,
      totalPago,
      availableCredits,
      byMonth,
    })
  }
)
```

**Step 2: Run build and commit**

Run: `npm run build`

```bash
git add src/app/api/financeiro/dashboard/route.ts
git commit -m "feat: add financial dashboard API with aggregated stats by month"
```

---

### Task 14: Install @react-pdf/renderer

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `npm install @react-pdf/renderer`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @react-pdf/renderer for invoice PDF generation"
```

---

### Task 15: Invoice PDF generation

**Files:**
- Create: `src/lib/financeiro/invoice-pdf.tsx`
- Create: `src/app/api/financeiro/faturas/[id]/pdf/route.ts`

**Step 1: Create the PDF document component**

```tsx
// src/lib/financeiro/invoice-pdf.tsx
import React from "react"
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica" },
  header: { marginBottom: 20 },
  clinicName: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  title: { fontSize: 14, fontWeight: "bold", marginBottom: 12, textAlign: "center" },
  infoRow: { flexDirection: "row", marginBottom: 4 },
  infoLabel: { width: 120, fontWeight: "bold" },
  infoValue: { flex: 1 },
  table: { marginTop: 16, marginBottom: 16 },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    paddingBottom: 4,
    marginBottom: 4,
    fontWeight: "bold",
  },
  tableRow: { flexDirection: "row", paddingVertical: 2 },
  colDesc: { flex: 3 },
  colQty: { width: 40, textAlign: "center" },
  colPrice: { width: 80, textAlign: "right" },
  colTotal: { width: 80, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#000",
    paddingTop: 4,
    marginTop: 4,
    fontWeight: "bold",
  },
  message: { marginTop: 20, lineHeight: 1.5 },
  footer: { marginTop: 30, fontSize: 8, color: "#666", textAlign: "center" },
  statusBadge: { marginTop: 8, padding: 4, borderRadius: 4 },
})

export interface InvoicePDFData {
  clinicName: string
  clinicPhone?: string
  patientName: string
  professionalName: string
  referenceMonth: number
  referenceYear: number
  status: string
  dueDate: string
  totalAmount: string
  messageBody: string | null
  items: Array<{
    description: string
    quantity: number
    unitPrice: string
    total: string
    type: string
  }>
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export function InvoicePDF({ data }: { data: InvoicePDFData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.clinicName}>{data.clinicName}</Text>
          {data.clinicPhone && <Text>{data.clinicPhone}</Text>}
        </View>

        {/* Title */}
        <Text style={styles.title}>
          Fatura - {MONTH_NAMES[data.referenceMonth - 1]}/{data.referenceYear}
        </Text>

        {/* Info */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Paciente:</Text>
          <Text style={styles.infoValue}>{data.patientName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Profissional:</Text>
          <Text style={styles.infoValue}>{data.professionalName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Vencimento:</Text>
          <Text style={styles.infoValue}>{data.dueDate}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status:</Text>
          <Text style={styles.infoValue}>
            {data.status === "PAGO" ? "Pago" : data.status === "PENDENTE" ? "Pendente" : "Cancelado"}
          </Text>
        </View>

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Descrição</Text>
            <Text style={styles.colQty}>Qtd</Text>
            <Text style={styles.colPrice}>Valor Unit.</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {data.items.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colPrice}>{item.unitPrice}</Text>
              <Text style={styles.colTotal}>{item.total}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.colDesc}>Total</Text>
            <Text style={styles.colQty}></Text>
            <Text style={styles.colPrice}></Text>
            <Text style={styles.colTotal}>{data.totalAmount}</Text>
          </View>
        </View>

        {/* Message */}
        {data.messageBody && (
          <View style={styles.message}>
            <Text>{data.messageBody}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Documento gerado automaticamente pelo sistema.</Text>
        </View>
      </Page>
    </Document>
  )
}
```

**Step 2: Create PDF API endpoint**

```typescript
// src/app/api/financeiro/faturas/[id]/pdf/route.ts
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { renderToBuffer } from "@react-pdf/renderer"
import { InvoicePDF } from "@/lib/financeiro/invoice-pdf"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import React from "react"

export const GET = withAuth(
  { resource: "invoice", action: "read" },
  async (req: NextRequest, { user, scope }, params: { id: string }) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      include: {
        clinic: { select: { name: true, phone: true } },
        patient: { select: { name: true } },
        professionalProfile: { select: { user: { select: { name: true } } } },
        items: { orderBy: { createdAt: "asc" } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    const pdfData = {
      clinicName: invoice.clinic.name,
      clinicPhone: invoice.clinic.phone || undefined,
      patientName: invoice.patient.name,
      professionalName: invoice.professionalProfile.user.name,
      referenceMonth: invoice.referenceMonth,
      referenceYear: invoice.referenceYear,
      status: invoice.status,
      dueDate: new Date(invoice.dueDate).toLocaleDateString("pt-BR"),
      totalAmount: formatCurrencyBRL(Number(invoice.totalAmount)),
      messageBody: invoice.messageBody,
      items: invoice.items.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: formatCurrencyBRL(Number(item.unitPrice)),
        total: formatCurrencyBRL(Number(item.total)),
        type: item.type,
      })),
    }

    const buffer = await renderToBuffer(
      React.createElement(InvoicePDF, { data: pdfData })
    )

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="fatura-${invoice.patient.name.replace(/\s+/g, "-")}-${invoice.referenceMonth}-${invoice.referenceYear}.pdf"`,
      },
    })
  }
)
```

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/financeiro/invoice-pdf.tsx src/app/api/financeiro/faturas/[id]/pdf/route.ts
git commit -m "feat: add invoice PDF generation with @react-pdf/renderer"
```

---

### Task 16: WhatsApp invoice sending API

**Files:**
- Create: `src/app/api/financeiro/faturas/[id]/enviar/route.ts`

**Step 1: Implement POST endpoint**

This route sends the invoice message via WhatsApp using the existing notification system.

```typescript
// src/app/api/financeiro/faturas/[id]/enviar/route.ts
import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"

export const POST = withAuth(
  { resource: "invoice", action: "update" },
  async (req: NextRequest, { user, scope }, params: { id: string }) => {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      include: {
        patient: { select: { id: true, name: true, phone: true, consentWhatsApp: true } },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    if (!invoice.patient.consentWhatsApp) {
      return NextResponse.json(
        { error: "Paciente não autorizou comunicação via WhatsApp" },
        { status: 400 }
      )
    }

    if (!invoice.messageBody) {
      return NextResponse.json(
        { error: "Fatura sem mensagem. Regenere a fatura." },
        { status: 400 }
      )
    }

    // Create notification record for the WhatsApp message
    await prisma.notification.create({
      data: {
        clinicId: user.clinicId,
        patientId: invoice.patientId,
        type: "APPOINTMENT_REMINDER", // Reuse existing type for now
        channel: "WHATSAPP",
        recipient: invoice.patient.phone,
        content: invoice.messageBody,
      },
    })

    return NextResponse.json({ success: true, message: "Fatura enviada via WhatsApp" })
  }
)
```

**Step 2: Run build and commit**

Run: `npm run build`

```bash
git add src/app/api/financeiro/faturas/[id]/enviar/route.ts
git commit -m "feat: add WhatsApp invoice sending via notification system"
```

---

### Task 17: Patient fields API update

**Files:**
- Modify: `src/app/api/patients/[id]/route.ts`

**Step 1: Add new fields to PATCH handler**

In the patient update route, add support for the new fields:
- `showAppointmentDaysOnInvoice` (boolean)
- `invoiceMessageTemplate` (string | null)

Find the zod schema for the PATCH body and add:
```typescript
showAppointmentDaysOnInvoice: z.boolean().optional(),
invoiceMessageTemplate: z.string().nullable().optional(),
```

Also add these fields to the `select` in GET response if not already included.

**Step 2: Run build and commit**

Run: `npm run build`

```bash
git add src/app/api/patients/[id]/route.ts
git commit -m "feat: add showAppointmentDaysOnInvoice and invoiceMessageTemplate to patient API"
```

---

### Task 18: Clinic invoice template API

**Files:**
- Modify: `src/app/api/admin/clinic/route.ts` (or wherever clinic settings are managed)

**Step 1: Add invoiceMessageTemplate to clinic settings**

Add support for reading/updating `invoiceMessageTemplate` in the clinic settings API.

**Step 2: Run build and commit**

Run: `npm run build`

```bash
git add src/app/api/admin/clinic/route.ts
git commit -m "feat: add invoiceMessageTemplate to clinic settings API"
```

---

### Task 19: Financial dashboard page

**Files:**
- Create: `src/app/financeiro/page.tsx`
- Create: `src/app/financeiro/layout.tsx`

**Step 1: Create layout with sub-navigation**

```tsx
// src/app/financeiro/layout.tsx
"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/financeiro", label: "Dashboard" },
  { href: "/financeiro/faturas", label: "Faturas" },
  { href: "/financeiro/creditos", label: "Créditos" },
]

export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Financeiro</h1>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
        {tabs.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              (tab.href === "/financeiro" ? pathname === "/financeiro" : pathname.startsWith(tab.href))
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  )
}
```

**Step 2: Create dashboard page**

```tsx
// src/app/financeiro/page.tsx
"use client"

import React, { useEffect, useState } from "react"
import { formatCurrencyBRL } from "@/lib/financeiro/format"

interface DashboardData {
  year: number
  totalFaturado: number
  totalPendente: number
  totalPago: number
  availableCredits: number
  byMonth: Record<number, { faturado: number; pendente: number; pago: number }>
}

export default function FinanceiroDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/financeiro/dashboard?year=${year}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [year])

  if (loading) return <div className="animate-pulse">Carregando...</div>
  if (!data) return <div>Erro ao carregar dados</div>

  return (
    <div>
      {/* Year selector */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => setYear(y => y - 1)} className="px-3 py-1 rounded border">←</button>
        <span className="text-lg font-semibold">{year}</span>
        <button onClick={() => setYear(y => y + 1)} className="px-3 py-1 rounded border">→</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Total Faturado" value={formatCurrencyBRL(data.totalFaturado)} />
        <SummaryCard label="Pendente" value={formatCurrencyBRL(data.totalPendente)} color="yellow" />
        <SummaryCard label="Recebido" value={formatCurrencyBRL(data.totalPago)} color="green" />
        <SummaryCard label="Créditos Disponíveis" value={String(data.availableCredits)} color="blue" />
      </div>

      {/* Monthly breakdown table */}
      <h2 className="text-lg font-semibold mb-3">Por Mês</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b dark:border-gray-700">
              <th className="text-left py-2">Mês</th>
              <th className="text-right py-2">Faturado</th>
              <th className="text-right py-2">Pendente</th>
              <th className="text-right py-2">Recebido</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
              const monthData = data.byMonth[m]
              if (!monthData) return null
              return (
                <tr key={m} className="border-b dark:border-gray-800">
                  <td className="py-2">{MONTH_NAMES[m - 1]}</td>
                  <td className="text-right">{formatCurrencyBRL(monthData.faturado)}</td>
                  <td className="text-right text-yellow-600">{formatCurrencyBRL(monthData.pendente)}</td>
                  <td className="text-right text-green-600">{formatCurrencyBRL(monthData.pago)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClasses = {
    yellow: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
    green: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  }
  const cls = color ? colorClasses[color as keyof typeof colorClasses] : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"

  return (
    <div className={`p-4 rounded-lg border ${cls}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  )
}
```

**Step 3: Run build and commit**

Run: `npm run build`

```bash
git add src/app/financeiro/page.tsx src/app/financeiro/layout.tsx
git commit -m "feat: add financial dashboard page with summary cards and monthly breakdown"
```

---

### Task 20: Invoice list page

**Files:**
- Create: `src/app/financeiro/faturas/page.tsx`

**Step 1: Create invoice list page**

Features:
- Month/year selector
- Status filter (Todos, Pendente, Pago, Cancelado)
- "Gerar Faturas do Mês" button with month/year picker
- Table with: patient name, sessions, total, status, due date, actions
- Actions per row: view details, mark paid, download PDF

Use `fetch` to call the APIs created in Tasks 11-12. Follow the existing table patterns from the codebase (check clinic management tables).

**Step 2: Run build and commit**

```bash
git add src/app/financeiro/faturas/page.tsx
git commit -m "feat: add invoice list page with generation, filters, and row actions"
```

---

### Task 21: Invoice detail page

**Files:**
- Create: `src/app/financeiro/faturas/[id]/page.tsx`

**Step 1: Create invoice detail page**

Features:
- Header: patient name, reference month, status badge, due date
- Items table with description, qty, unit price, total
- Negative items (credits) shown in red
- Message body preview (rendered template text)
- Action buttons: "Marcar como Pago", "Baixar PDF", "Enviar WhatsApp", "Cancelar Fatura"
- Notes section (editable)

Use the `GET /api/financeiro/faturas/[id]` API.

**Step 2: Run build and commit**

```bash
git add src/app/financeiro/faturas/[id]/page.tsx
git commit -m "feat: add invoice detail page with items, actions, and message preview"
```

---

### Task 22: Credits list page

**Files:**
- Create: `src/app/financeiro/creditos/page.tsx`

**Step 1: Create credits page**

Features:
- Table: patient name, reason, created date, status (Disponível/Utilizado)
- Status filter: all, available, consumed
- If consumed: show which invoice consumed it
- Link to related appointment and invoice

**Step 2: Run build and commit**

```bash
git add src/app/financeiro/creditos/page.tsx
git commit -m "feat: add credits overview page with status filters"
```

---

### Task 23: Update appointment cancellation UI

**Files:**
- Check and modify the appointment status change component (likely in `src/app/agenda/components/` or a modal/dialog component)

**Step 1: Find the cancellation UI**

Search for the UI where appointment status is changed. It's likely in a component that shows the appointment detail or a status change dropdown/dialog.

**Step 2: Replace single "Cancelar" with two buttons**

Replace any single cancellation button with two:
- "Acordado" — calls PATCH with `status: "CANCELADO_ACORDADO"`, styled neutral/green
- "Falta" — calls PATCH with `status: "CANCELADO_FALTA"`, styled red

Also add the ability to switch between ACORDADO ↔ FALTA for already-cancelled appointments (with a warning if credit was already consumed).

**Step 3: Update status badge labels and colors**

Wherever appointment statuses are displayed as badges:
- `CANCELADO_ACORDADO` → "Acordado" (yellow/amber badge)
- `CANCELADO_FALTA` → "Falta" (red badge)

**Step 4: Run build and commit**

```bash
git add -A
git commit -m "feat: split cancellation into Acordado/Falta buttons with credit generation"
```

---

### Task 24: Patient financial tab

**Files:**
- Modify: `src/app/patients/components/PatientDetailsView.tsx` (or equivalent)

**Step 1: Add "Financeiro" tab**

Add a new tab alongside "Dados" and "Histórico":
- "Financeiro" tab shows: recent invoices, available credits, session fee, and settings toggles
- Settings: `showAppointmentDaysOnInvoice` toggle, `invoiceMessageTemplate` textarea

**Step 2: Implement the financial content**

Fetch invoices and credits for this patient from:
- `GET /api/financeiro/faturas?patientId=...`
- `GET /api/financeiro/creditos?patientId=...`

Display:
- Current session fee
- Invoice history table (compact: month, total, status)
- Credits list
- Toggle: "Incluir dias na fatura"
- Template editor: "Texto personalizado da fatura" with variable help text

**Step 3: Run build and commit**

```bash
git add -A
git commit -m "feat: add Financeiro tab to patient detail with invoices, credits, and settings"
```

---

### Task 25: Clinic invoice template settings

**Files:**
- Modify: clinic settings page (find in `src/app/admin/` or `src/app/configuracoes/`)

**Step 1: Add invoice template editor to clinic settings**

Add a section to the clinic settings page:
- Label: "Modelo de Mensagem da Fatura"
- Textarea with the template
- Help text listing available variables: `{{paciente}}`, `{{mae}}`, `{{pai}}`, `{{valor}}`, `{{mes}}`, `{{ano}}`, `{{vencimento}}`, `{{sessoes}}`, `{{profissional}}`
- "Restaurar padrão" button that fills in `DEFAULT_INVOICE_TEMPLATE`
- Save button that calls PATCH on the clinic settings API

**Step 2: Run build and commit**

```bash
git add -A
git commit -m "feat: add invoice message template editor to clinic settings"
```

---

### Task 26: Full test suite and build verification

**Step 1: Run all existing tests**

Run: `npm run test`
Expected: All tests pass

**Step 2: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Fix any issues found**

If tests fail or build breaks, fix the issues.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test failures and build issues from financial control implementation"
```
