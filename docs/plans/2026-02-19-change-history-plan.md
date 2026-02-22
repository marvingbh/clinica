# Change History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add inline change history to patient detail sheets and appointment edit sheets, visible to admins only, with human-readable field diffs in Portuguese.

**Architecture:** Leverage existing `AuditLog` model (no schema migration). Build a shared field-label mapping, a new API endpoint that transforms raw audit JSON into human-readable diffs, and a reusable `HistoryTimeline` component. Wire it into patient detail (new tab system) and appointment editor (extend existing tab system).

**Tech Stack:** Next.js App Router, Prisma, TypeScript, Tailwind CSS, shadcn/ui patterns

**Design doc:** `docs/plans/2026-02-19-change-history-design.md`

---

## Pre-Implementation Notes

### Audit Gaps Already Filled

The design doc identified 4 audit logging gaps. After reviewing the current code, **all 4 are already filled**:

- `appointments/[id]` PATCH — already logs `APPOINTMENT_UPDATED` with `oldValues`/`newValues` (line 279)
- `appointments/[id]/status` PATCH — already logs `APPOINTMENT_STATUS_CHANGED` with old status (line 221)
- `appointments/[id]/cancel` POST — already logs `PROFESSIONAL_CANCELLATION` with old/new status (line 287)
- `appointments/recurrences/[id]` PATCH — already logs `RECURRENCE_UPDATED` with old/new values (line 575)

No audit gap work needed.

### Key Existing Patterns

- **Auth:** `withFeatureAuth({ feature: "audit_logs", minAccess: "READ" })` — see `src/app/api/admin/audit-logs/route.ts`
- **Permission hook:** `usePermission("audit_logs")` returns `{ canRead, canWrite }` — see `src/shared/hooks/usePermission.ts`
- **Editor tabs:** `type EditorTab = "occurrence" | "recurrence"` with `SegmentedControl` — see `src/app/agenda/components/AppointmentEditor.tsx`
- **Patient sheet:** Portal-based bottom sheet with view/edit modes, no tabs yet — see `src/app/patients/page.tsx`
- **Audit utility:** `src/lib/rbac/audit.ts` — `createAuditLog()`, `audit.log()`, `AuditAction` enum

---

## Task 1: Field Label Mapping & Value Formatters

**Files:**
- Create: `src/lib/audit/field-labels.ts`

**Step 1: Create the field label mapping file**

```typescript
// src/lib/audit/field-labels.ts

/**
 * Maps database field names to Portuguese labels for audit log display.
 */
export const FIELD_LABELS: Record<string, string> = {
  // Patient fields
  name: "Nome",
  phone: "Telefone",
  email: "Email",
  birthDate: "Data de Nascimento",
  parentName: "Nome do Responsavel",
  parentName2: "Nome do Responsavel 2",
  schoolName: "Escola",
  sessionFee: "Valor da Sessao",
  feeAdjustmentReason: "Motivo do Ajuste",
  therapeuticProject: "Projeto Terapeutico",
  consentWhatsApp: "Consentimento WhatsApp",
  consentEmail: "Consentimento Email",
  isActive: "Ativo",
  referenceProfessionalId: "Profissional Referencia",

  // Appointment fields
  status: "Status",
  scheduledAt: "Data/Hora",
  endAt: "Hora Final",
  modality: "Modalidade",
  notes: "Observacoes",
  price: "Valor",
  cancellationReason: "Motivo do Cancelamento",
  title: "Titulo",
  type: "Tipo",
  confirmedAt: "Confirmado em",
  cancelledAt: "Cancelado em",

  // Recurrence fields
  recurrenceType: "Tipo de Recorrencia",
  recurrenceEndType: "Tipo de Fim",
  dayOfWeek: "Dia da Semana",
  startTime: "Hora Inicio",
  endTime: "Hora Fim",
  endDate: "Data Final",
  occurrences: "Ocorrencias",
}

const STATUS_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  FINALIZADO: "Finalizado",
  NAO_COMPARECEU: "Nao compareceu",
  CANCELADO_PROFISSIONAL: "Cancelado (Profissional)",
  CANCELADO_PACIENTE: "Cancelado (Paciente)",
}

const MODALITY_LABELS: Record<string, string> = {
  ONLINE: "Online",
  PRESENCIAL: "Presencial",
}

const TYPE_LABELS: Record<string, string> = {
  CONSULTA: "Consulta",
  TAREFA: "Tarefa",
  LEMBRETE: "Lembrete",
  NOTA: "Nota",
  REUNIAO: "Reuniao",
}

const RECURRENCE_TYPE_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
}

const DAY_OF_WEEK_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terca",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sabado",
}

/**
 * Format a raw audit log value into a human-readable Portuguese string.
 */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "—"

  // Booleans
  if (typeof value === "boolean") return value ? "Sim" : "Nao"

  const strValue = String(value)

  // Status enum
  if (field === "status" && STATUS_LABELS[strValue]) return STATUS_LABELS[strValue]

  // Modality enum
  if (field === "modality" && MODALITY_LABELS[strValue]) return MODALITY_LABELS[strValue]

  // Type enum
  if (field === "type" && TYPE_LABELS[strValue]) return TYPE_LABELS[strValue]

  // Recurrence type
  if (field === "recurrenceType" && RECURRENCE_TYPE_LABELS[strValue]) return RECURRENCE_TYPE_LABELS[strValue]

  // Day of week
  if (field === "dayOfWeek") {
    const day = DAY_OF_WEEK_LABELS[Number(value)]
    return day || strValue
  }

  // Date fields (ISO string -> DD/MM/YYYY)
  if ((field === "birthDate" || field === "endDate") && typeof value === "string") {
    const match = strValue.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return `${match[3]}/${match[2]}/${match[1]}`
  }

  // DateTime fields (ISO string -> DD/MM/YYYY HH:mm)
  if ((field === "scheduledAt" || field === "endAt" || field === "confirmedAt" || field === "cancelledAt") && typeof value === "string") {
    try {
      const d = new Date(strValue)
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    } catch {
      return strValue
    }
  }

  // Currency fields
  if (field === "price" || field === "sessionFee") {
    const num = Number(value)
    if (!isNaN(num)) return `R$ ${num.toFixed(2).replace(".", ",")}`
  }

  return strValue
}

/**
 * Fields to exclude from change display (internal/noisy fields).
 */
const EXCLUDED_FIELDS = new Set([
  "id", "clinicId", "createdAt", "updatedAt", "userId",
  "professionalProfileId", "patientId", "recurrenceId", "groupId",
  "confirmToken", "cancelToken", "tokenExpiresAt",
  "appointmentCount", "cancelledAppointmentIds", "applyTo",
  "updatedAppointmentsCount", "deletedAppointmentsCount",
  "attemptedAction", "reason", "ipAddress", "userAgent",
])

/**
 * Compute human-readable changes from oldValues/newValues JSON.
 * Returns an array of { field, label, oldValue, newValue }.
 */
export function computeChanges(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null
): Array<{ field: string; label: string; oldValue: string; newValue: string }> {
  const changes: Array<{ field: string; label: string; oldValue: string; newValue: string }> = []

  if (!oldValues && !newValues) return changes

  // Collect all fields from both old and new
  const allFields = new Set<string>([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ])

  for (const field of allFields) {
    if (EXCLUDED_FIELDS.has(field)) continue

    const oldVal = oldValues?.[field]
    const newVal = newValues?.[field]

    // Skip if values are the same
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue

    const label = FIELD_LABELS[field] || field
    changes.push({
      field,
      label,
      oldValue: formatFieldValue(field, oldVal),
      newValue: formatFieldValue(field, newVal),
    })
  }

  return changes
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/audit/field-labels.ts
git commit -m "feat: add audit field label mapping and value formatters"
```

---

## Task 2: Audit Logs API Endpoint

**Files:**
- Create: `src/app/api/audit-logs/route.ts`

**Context:** The existing admin endpoint at `src/app/api/admin/audit-logs/route.ts` is a general-purpose admin log viewer. This new endpoint is simpler — scoped to a specific entity, returns processed changes, and resolves user names.

**Step 1: Create the entity-scoped audit logs endpoint**

```typescript
// src/app/api/audit-logs/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withFeatureAuth } from "@/lib/api"
import { computeChanges } from "@/lib/audit/field-labels"

/**
 * GET /api/audit-logs
 * Get audit logs for a specific entity (admin only).
 *
 * Query params:
 * - entityType (required): "Patient" | "Appointment" | "AppointmentRecurrence"
 * - entityId (required): the entity's ID
 * - page (default 1)
 * - limit (default 20, max 50)
 */
export const GET = withFeatureAuth(
  { feature: "audit_logs", minAccess: "READ" },
  async (req, { user }) => {
    const { searchParams } = new URL(req.url)

    const entityType = searchParams.get("entityType")
    const entityId = searchParams.get("entityId")
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)))

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: "entityType and entityId are required" },
        { status: 400 }
      )
    }

    const where = {
      clinicId: user.clinicId,
      entityType,
      entityId,
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])

    const entries = logs.map((log) => ({
      id: log.id,
      action: log.action,
      userName: log.user?.name || "Sistema",
      createdAt: log.createdAt.toISOString(),
      changes: computeChanges(
        log.oldValues as Record<string, unknown> | null,
        log.newValues as Record<string, unknown> | null
      ),
      // For CREATE actions with no oldValues, show newValues as initial values
      isCreate: !log.oldValues || Object.keys(log.oldValues as object).length === 0,
    }))

    return NextResponse.json({
      entries,
      pagination: { page, limit, total },
    })
  }
)
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/app/api/audit-logs/route.ts
git commit -m "feat: add entity-scoped audit logs API endpoint"
```

---

## Task 3: HistoryTimeline Component

**Files:**
- Create: `src/shared/components/HistoryTimeline.tsx`

**Context:** Reusable component that fetches audit logs for an entity and renders a vertical timeline. Used in both patient detail and appointment editor.

**Step 1: Create the HistoryTimeline component**

```tsx
// src/shared/components/HistoryTimeline.tsx
"use client"

import { useState, useEffect, useCallback } from "react"

interface AuditChange {
  field: string
  label: string
  oldValue: string
  newValue: string
}

interface AuditEntry {
  id: string
  action: string
  userName: string
  createdAt: string
  changes: AuditChange[]
  isCreate: boolean
}

interface Pagination {
  page: number
  limit: number
  total: number
}

const ACTION_LABELS: Record<string, string> = {
  APPOINTMENT_CREATED: "criou o agendamento",
  APPOINTMENT_UPDATED: "editou o agendamento",
  APPOINTMENT_DELETED: "excluiu o agendamento",
  APPOINTMENT_STATUS_CHANGED: "alterou o status",
  APPOINTMENT_CANCELLED: "cancelou o agendamento",
  PROFESSIONAL_CANCELLATION: "cancelou o agendamento",
  CONFIRMATION_RESENT: "reenviou confirmacao",
  PATIENT_CREATED: "cadastrou o paciente",
  PATIENT_UPDATED: "editou o paciente",
  PATIENT_DELETED: "excluiu o paciente",
  RECURRENCE_UPDATED: "editou a recorrencia",
  SERIES_CANCELLATION: "cancelou a serie",
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action.toLowerCase().replace(/_/g, " ")
}

interface HistoryTimelineProps {
  entityType: string
  entityId: string
}

export function HistoryTimeline({ entityType, entityId }: HistoryTimelineProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEntries = useCallback(
    async (page: number, append: boolean) => {
      try {
        if (append) setIsLoadingMore(true)
        else setIsLoading(true)

        const res = await fetch(
          `/api/audit-logs?entityType=${entityType}&entityId=${entityId}&page=${page}&limit=20`
        )
        if (!res.ok) throw new Error("Erro ao carregar historico")

        const data = await res.json()
        setEntries((prev) => (append ? [...prev, ...data.entries] : data.entries))
        setPagination(data.pagination)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido")
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [entityType, entityId]
  )

  useEffect(() => {
    fetchEntries(1, false)
  }, [fetchEntries])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
        Nenhum historico encontrado.
      </div>
    )
  }

  const hasMore = pagination ? pagination.page * pagination.limit < pagination.total : false

  return (
    <div className="space-y-0">
      {entries.map((entry, idx) => (
        <div key={entry.id} className="relative pl-6 pb-6">
          {/* Timeline line */}
          {idx < entries.length - 1 && (
            <div className="absolute left-[9px] top-5 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
          )}
          {/* Timeline dot */}
          <div className="absolute left-0 top-1.5 w-[18px] h-[18px] rounded-full border-2 border-blue-500 bg-white dark:bg-gray-900 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
          </div>

          {/* Entry content */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatTimestamp(entry.createdAt)}
            </p>
            <p className="text-sm mt-0.5">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {entry.userName}
              </span>{" "}
              <span className="text-gray-600 dark:text-gray-300">
                {getActionLabel(entry.action)}
              </span>
            </p>

            {/* Changes */}
            {entry.changes.length > 0 && (
              <div className="mt-2 space-y-1">
                {entry.changes.map((change, cIdx) => (
                  <div
                    key={cIdx}
                    className="text-xs bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5"
                  >
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {change.label}:
                    </span>{" "}
                    {entry.isCreate ? (
                      <span className="text-gray-600 dark:text-gray-400">
                        {change.newValue}
                      </span>
                    ) : (
                      <>
                        <span className="text-red-600 dark:text-red-400 line-through">
                          {change.oldValue}
                        </span>
                        <span className="mx-1 text-gray-400">&rarr;</span>
                        <span className="text-green-700 dark:text-green-400">
                          {change.newValue}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Load more */}
      {hasMore && (
        <button
          onClick={() => fetchEntries((pagination?.page || 1) + 1, true)}
          disabled={isLoadingMore}
          className="w-full py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
        >
          {isLoadingMore ? "Carregando..." : "Carregar mais"}
        </button>
      )}
    </div>
  )
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/shared/components/HistoryTimeline.tsx
git commit -m "feat: add reusable HistoryTimeline component"
```

---

## Task 4: Patient Detail "Historico" Tab

**Files:**
- Modify: `src/app/patients/page.tsx`

**Context:** The patient detail view sheet currently renders content directly (no tabs). Add a tab system: "Dados" (current content) and "Historico" (admin only). Non-admins see no tabs — just the existing content.

**Step 1: Add tab state and imports**

At the top of the component (around other imports), add:
```typescript
import { HistoryTimeline } from "@/shared/components/HistoryTimeline"
import { usePermission } from "@/shared/hooks/usePermission"
```

Inside the component, add state and permission check:
```typescript
const { canRead: canReadAudit } = usePermission("audit_logs")
const [patientTab, setPatientTab] = useState<"dados" | "historico">("dados")
```

Reset tab when `viewingPatient` changes:
```typescript
// In the useEffect that reacts to viewingPatient changes, or inline:
// When viewingPatient changes, reset to "dados" tab
useEffect(() => {
  setPatientTab("dados")
}, [viewingPatient?.id])
```

**Step 2: Add tab switcher in the view mode header**

In the view mode section (after the header with patient name + edit button), add a tab row:

```tsx
{/* Tab switcher - only show if admin can read audit logs */}
{canReadAudit && (
  <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4">
    <button
      onClick={() => setPatientTab("dados")}
      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        patientTab === "dados"
          ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
          : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      }`}
    >
      Dados
    </button>
    <button
      onClick={() => setPatientTab("historico")}
      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        patientTab === "historico"
          ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
          : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      }`}
    >
      Historico
    </button>
  </div>
)}
```

**Step 3: Wrap existing content and add Historico tab**

Wrap the existing view mode content sections in a conditional:

```tsx
{patientTab === "dados" ? (
  // ... all existing view mode content (reference professional, contact info, etc.)
) : (
  <HistoryTimeline entityType="Patient" entityId={viewingPatient.id} />
)}
```

**Step 4: Verify build**

Run: `npm run build`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/app/patients/page.tsx
git commit -m "feat: add Historico tab to patient detail sheet (admin only)"
```

---

## Task 5: Appointment Editor "Historico" Tab

**Files:**
- Modify: `src/app/agenda/components/AppointmentEditor.tsx`

**Context:** The editor already has tabs (`occurrence` | `recurrence`). Extend `EditorTab` to include `"historico"`. Only show the historico segment for admins with audit_logs permission. The HistoryTimeline loads from `/api/audit-logs?entityType=Appointment&entityId=X`.

**Step 1: Add imports and permission check**

```typescript
import { HistoryTimeline } from "@/shared/components/HistoryTimeline"
import { usePermission } from "@/shared/hooks/usePermission"
```

Inside the component:
```typescript
const { canRead: canReadAudit } = usePermission("audit_logs")
```

**Step 2: Extend EditorTab type**

Change:
```typescript
type EditorTab = "occurrence" | "recurrence"
```
To:
```typescript
type EditorTab = "occurrence" | "recurrence" | "historico"
```

**Step 3: Add "Historico" segment to the SegmentedControl**

Where the segments array is built (around line 280-289), add the historico segment conditionally:

```typescript
// After existing segments, add:
if (canReadAudit) {
  segments.push({ value: "historico", label: "Historico" })
}
```

If the `SegmentedControl` is only shown for recurring appointments, also show it when `canReadAudit` is true (even for non-recurring appointments). Adjust the condition that gates whether the segmented control renders.

**Step 4: Add Historico tab content**

In the tab content rendering section (around line 302-336), add:

```tsx
{activeTab === "historico" && (
  <div className="px-4 py-4">
    <HistoryTimeline entityType="Appointment" entityId={appointment.id} />
  </div>
)}
```

**Step 5: Verify build**

Run: `npm run build`
Expected: No type errors

**Step 6: Commit**

```bash
git add src/app/agenda/components/AppointmentEditor.tsx
git commit -m "feat: add Historico tab to appointment editor (admin only)"
```

---

## Task 6: Final Verification

**Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Manual testing checklist**

1. Log in as admin
2. Open a patient detail sheet — verify "Dados" and "Historico" tabs appear
3. Click "Historico" — verify timeline loads with past changes
4. Edit the patient, save — switch to Historico, verify the edit appears
5. Open an appointment editor — verify "Historico" tab appears in segments
6. Click "Historico" — verify timeline loads with appointment changes
7. Change appointment status — verify it appears in history
8. Log in as professional — verify NO "Historico" tab on patient detail
9. Log in as professional — verify NO "Historico" segment on appointment editor
10. Test "Carregar mais" pagination if enough entries exist

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues from manual testing"
```
