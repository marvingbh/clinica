# Individual Invoice Regeneration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Recalcular" button to regenerate a single invoice from both the invoice list and detail pages.

**Architecture:** New `POST /api/financeiro/faturas/[id]/recalcular` endpoint that reuses the existing update-in-place logic from the bulk generation route. UI adds a refresh button in both list and detail views, visible only for editable invoices (PENDENTE/ENVIADO).

**Tech Stack:** Next.js API routes, Prisma, React, Tailwind, lucide-react (RefreshCwIcon)

---

### Task 1: Create the recalcular API endpoint

**Files:**
- Create: `src/app/api/financeiro/faturas/[id]/recalcular/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server"
import { withFeatureAuth } from "@/lib/api"
import { prisma } from "@/lib/prisma"
import { classifyAppointments, buildInvoiceItems, buildMonthlyInvoiceItems } from "@/lib/financeiro/invoice-generator"
import { recalculateInvoice } from "@/lib/financeiro/recalculate-invoice"
import { getMonthName } from "@/lib/financeiro/format"
import { separateManualItems } from "@/lib/financeiro/invoice-generation"
import { AppointmentStatus } from "@prisma/client"

export const POST = withFeatureAuth(
  { feature: "finances", minAccess: "WRITE" },
  async (req: NextRequest, { user }, params) => {
    const scope = user.role === "ADMIN" ? "clinic" : "own"

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        clinicId: user.clinicId,
        ...(scope === "own" && user.professionalProfileId
          ? { professionalProfileId: user.professionalProfileId }
          : {}),
      },
      include: { items: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 })
    }

    if (invoice.status !== "PENDENTE" && invoice.status !== "ENVIADO") {
      return NextResponse.json(
        { error: "Apenas faturas pendentes ou enviadas podem ser recalculadas" },
        { status: 400 }
      )
    }

    // Fetch patient data
    const patient = await prisma.patient.findUnique({
      where: { id: invoice.patientId },
      select: {
        id: true, name: true, motherName: true, fatherName: true,
        sessionFee: true, showAppointmentDaysOnInvoice: true,
        invoiceMessageTemplate: true,
      },
    })

    if (!patient || !patient.sessionFee) {
      return NextResponse.json(
        { error: "Paciente sem valor de sessão configurado" },
        { status: 400 }
      )
    }

    // Fetch appointments for this patient+professional in this month
    const startDate = new Date(invoice.referenceYear, invoice.referenceMonth - 1, 1)
    const endDate = new Date(invoice.referenceYear, invoice.referenceMonth, 1)

    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        patientId: invoice.patientId,
        professionalProfileId: invoice.professionalProfileId,
        scheduledAt: { gte: startDate, lt: endDate },
        type: { in: ["CONSULTA", "REUNIAO"] },
      },
      select: {
        id: true, scheduledAt: true, status: true, type: true,
        recurrenceId: true, groupId: true, price: true,
      },
    })

    const [clinic, professional] = await Promise.all([
      prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { invoiceMessageTemplate: true, billingMode: true },
      }),
      prisma.professionalProfile.findUnique({
        where: { id: invoice.professionalProfileId },
        select: { user: { select: { name: true } } },
      }),
    ])

    const sessionFee = Number(patient.sessionFee)
    const showDays = patient.showAppointmentDaysOnInvoice
    const profName = professional?.user?.name || ""

    const classified = classifyAppointments(
      appointments.map(a => ({ ...a, price: a.price ? Number(a.price) : null }))
    )

    await prisma.$transaction(async (tx) => {
      // Release consumed credits
      const consumedCredits = await tx.sessionCredit.findMany({
        where: { consumedByInvoiceId: invoice.id },
        select: { id: true, reason: true },
      })

      await tx.sessionCredit.updateMany({
        where: { consumedByInvoiceId: invoice.id },
        data: { consumedByInvoiceId: null, consumedAt: null },
      })

      // Delete auto-generated items, keep manual ones
      const { autoItems } = separateManualItems(invoice.items, consumedCredits)
      if (autoItems.length > 0) {
        await tx.invoiceItem.deleteMany({
          where: { id: { in: autoItems.map(i => i.id) } },
        })
      }

      // Fetch fresh available credits
      const availableCredits = await tx.sessionCredit.findMany({
        where: { clinicId: user.clinicId, patientId: invoice.patientId, consumedByInvoiceId: null },
        orderBy: { createdAt: "asc" },
      })

      // Build new items
      let items
      if (clinic?.billingMode === "MONTHLY_FIXED") {
        const totalSessionCount = classified.regular.length + classified.extra.length
          + classified.group.length + classified.schoolMeeting.length
        items = buildMonthlyInvoiceItems(
          sessionFee, totalSessionCount, getMonthName(invoice.referenceMonth), String(invoice.referenceYear), availableCredits, sessionFee
        )
      } else {
        items = buildInvoiceItems(classified, sessionFee, availableCredits, showDays)
      }

      // Create new auto items
      for (const item of items) {
        await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            appointmentId: item.appointmentId,
            type: item.type,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          },
        })
      }

      // Consume credits
      const creditItems = items.filter(i => i.type === "CREDITO" && i.creditId)
      for (const ci of creditItems) {
        await tx.sessionCredit.update({
          where: { id: ci.creditId! },
          data: { consumedByInvoiceId: invoice.id, consumedAt: new Date() },
        })
      }

      // Recalculate totals and message body
      await recalculateInvoice(
        tx, invoice.id, invoice, patient,
        clinic?.invoiceMessageTemplate ?? null, profName,
      )
    }, { timeout: 15000 })

    return NextResponse.json({ success: true, message: "Fatura recalculada com sucesso" })
  }
)
```

**Step 2: Run lint**

Run: `npm run lint`

**Step 3: Commit**

```bash
git add src/app/api/financeiro/faturas/[id]/recalcular/route.ts
git commit -m "feat: add individual invoice recalculation endpoint"
```

---

### Task 2: Add "Recalcular" button to the invoice detail page

**Files:**
- Modify: `src/app/financeiro/faturas/[id]/page.tsx`

**Step 1: Add state and handler**

After the existing state declarations (around line 50), add:

```typescript
const [recalculating, setRecalculating] = useState(false)
```

Add handler function alongside the existing handlers (e.g., after `handleDelete`):

```typescript
  async function handleRecalcular() {
    if (!confirm("Recalcular esta fatura? Os itens automáticos serão regenerados.")) return
    setRecalculating(true)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoice.id}/recalcular`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao recalcular fatura")
        return
      }
      toast.success(data.message || "Fatura recalculada com sucesso")
      fetchInvoice()
    } catch {
      toast.error("Erro ao recalcular fatura")
    } finally {
      setRecalculating(false)
    }
  }
```

**Step 2: Add the button in the Actions section**

In the `{/* Actions */}` div (line 343), add a "Recalcular" button BEFORE the "Excluir Fatura" button, only when editable:

```tsx
        {isEditable && (
          <button
            onClick={handleRecalcular}
            disabled={recalculating}
            className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 disabled:opacity-50 transition-colors"
          >
            {recalculating ? "Recalculando..." : "Recalcular"}
          </button>
        )}
```

Note: `isEditable` is already defined at line 313 as `invoice.status === "PENDENTE" || invoice.status === "ENVIADO"`.

**Step 3: Run lint**

Run: `npm run lint`

**Step 4: Commit**

```bash
git add src/app/financeiro/faturas/[id]/page.tsx
git commit -m "feat: add recalcular button to invoice detail page"
```

---

### Task 3: Add recalculate icon button to the invoice list page

**Files:**
- Modify: `src/app/financeiro/faturas/page.tsx`

**Step 1: Add the RefreshCwIcon import**

At line 8, add `RefreshCwIcon` to the existing icon imports:

```typescript
import { EyeIcon, CheckCircleIcon, DownloadIcon, RefreshCwIcon } from "@/shared/components/ui/icons"
```

**Step 2: Add state for tracking which invoice is being recalculated**

After the existing state declarations, add:

```typescript
const [recalculatingId, setRecalculatingId] = useState<string | null>(null)
```

**Step 3: Add handler**

Add alongside existing handlers (e.g., after `handleMarkPaid`):

```typescript
  async function handleRecalcular(invoiceId: string) {
    setRecalculatingId(invoiceId)
    try {
      const res = await fetch(`/api/financeiro/faturas/${invoiceId}/recalcular`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao recalcular fatura")
        return
      }
      toast.success(data.message || "Fatura recalculada")
      fetchInvoices()
    } catch {
      toast.error("Erro ao recalcular fatura")
    } finally {
      setRecalculatingId(null)
    }
  }
```

**Step 4: Add refresh icon button in the actions column**

In the actions `<td>` (line 308), inside the `div.flex` (line 309), add a refresh button BEFORE the eye icon Link (line 310). Only show for editable invoices:

```tsx
                      {(inv.status === "PENDENTE" || inv.status === "ENVIADO") && (
                        <button
                          onClick={() => handleRecalcular(inv.id)}
                          disabled={recalculatingId === inv.id}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                          title="Recalcular fatura"
                        >
                          <RefreshCwIcon className={`w-4 h-4 ${recalculatingId === inv.id ? "animate-spin" : ""}`} />
                        </button>
                      )}
```

**Step 5: Run lint and build**

Run: `npm run lint && npm run build`

**Step 6: Commit**

```bash
git add src/app/financeiro/faturas/page.tsx
git commit -m "feat: add recalculate icon to invoice list actions"
```
