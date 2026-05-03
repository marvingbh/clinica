---
title: "feat: Show attending professional and group name on invoice"
type: feat
status: completed
date: 2026-05-03
origin: docs/brainstorms/2026-05-03-invoice-professional-attribution-brainstorm.md
pr: https://github.com/marvingbh/clinica/pull/18
---

# Show Attending Professional and Group Name on Invoice

## Overview

Make the unified per-patient invoice (PDF + HTML detail page + email body)
surface (a) the patient's reference professional in the header and
(b) who actually delivered each session. Group sessions also gain the
therapy group's name on the line item.

Approach C from the brainstorm: today's flat layout stays for invoices
with a single attending professional; a sections-by-professional layout
kicks in when the invoice has 2+ attending professionals
(see brainstorm: `docs/brainstorms/2026-05-03-invoice-professional-attribution-brainstorm.md`).

NFSe `descricaoServico` is explicitly **out of scope** — only the
guardian-facing invoice rendering changes.

## Problem Statement / Motivation

Since the patient-consolidation rollout, a guardian can receive one
invoice covering work performed by multiple professionals (e.g.
individual sessions with the reference professional plus group sessions
delivered by another). The current rendering hides this entirely — every
line just reads "Sessão" / "Sessão grupo - DD/MM" with no professional
name and no group name. Guardians cannot tell who saw their child for
which item, and which therapy group the child attended.

Additionally, there is no header indicator of the patient's reference
professional in the clinic, even though that information is captured in
`Patient.referenceProfessionalId`.

## Proposed Solution

### Data layer

Extend every invoice-fetch query that feeds a render path to include:

- `items[].attendingProfessional.user.name` (FK already exists on
  `InvoiceItem.attendingProfessionalId`)
- `items[].appointment.group.name` (chain through `Appointment.groupId`
  → `TherapyGroup.name`)
- `patient.referenceProfessional.user.name` (chain through
  `Patient.referenceProfessionalId`)

No schema changes required.

### Pure helper

Add `src/lib/financeiro/professional-attribution.ts` with two pure
functions:

1. `getAttributionLayout(items, referenceProfessional, invoiceProfessional)`
   returns `{ mode: "single" | "multi", headerLine: string | null, sections: Array<{ header: string | null, items: Item[] }> }`.
   - **single mode** when `distinct(items.attendingProfessionalId)` is
     0 or 1: one section with no header.
   - **multi mode** when 2+: one section per attending professional,
     plus a final "Outros" / "Créditos" section for items without an
     attending professional (manual lines, system-generated credits).
   - **Header rules** (from brainstorm):
     - Reference professional present → `"Técnico de referência: <name>"`
     - No reference professional, single attending → `"Profissional: <attending name>"`
     - No reference professional, multi-attending → `null` (omit line)

2. `enrichItemDescription(item, { includeGroupName, includeAttendingName })`
   - For SESSAO_GRUPO items with a group name, output
     `"Sessão em grupo — <group name>"` (replaces today's `"Sessão grupo"`
     prefix). Date is appended separately by the renderer, so the helper
     only owns the description body.
   - Optionally appends `" · <attending name>"` (used by the email
     template's flat detail block, **not** by PDF/HTML where the section
     header carries that info).

### Sort order inside each section

By **`appointment.scheduledAt` ascending**. Already today's PDF behaviour
(`src/lib/financeiro/build-invoice-pdf-data.ts:53-56`); we keep it for
consistency. Items without an appointment date (manual extras, credits)
sort to the bottom of their section.

### PDF (`src/lib/financeiro/invoice-pdf.tsx` + builder)

- `InvoicePDFData` gains:
  - `referenceProfessionalLine: string | null`
  - `itemSections: Array<{ header: string | null; items: ItemRow[] }>`
    (replaces `items: ItemRow[]`).
- The header info grid (lines 166-193) gains a "Técnico de referência"
  row when `referenceProfessionalLine` is non-null. Existing
  "Profissional" row is removed in multi-mode (the section headers carry
  it) and falls back to today's behaviour in single-mode.
- The items table (lines 197-213) iterates sections; renders each
  `header` (when non-null) as a styled section row spanning full width
  before its items.
- `colDesc: { flex: 3 }` widened to `flex: 4`; `colPrice: width: 70` →
  `60` to keep the totals column safe and give long descriptions
  ("Sessão em grupo — <group name> · DD/MM") room. See **PDF width
  constraint** below.

### HTML detail page

- `src/app/financeiro/faturas/[id]/types.ts`: extend `InvoiceItem` with
  `attendingProfessional?: { name: string }` and `appointment.group?: { name: string }`.
- `src/app/financeiro/faturas/[id]/page.tsx`: add the
  "Técnico de referência" line near the patient name (line 149).
- `src/app/financeiro/faturas/[id]/InvoiceItemsTable.tsx`: keep edit/add
  controls intact; render an extra full-width row `<tr>` styled as a
  section divider before each non-null section header. In single-mode no
  divider is rendered (zero behavioural change for invoices without
  multiple professionals).

### Email body

- `src/lib/financeiro/invoice-template.ts`:
  - `TemplateVariables` gains `tecnico_referencia: string` (empty string
    when none — template authors render conditionally with their own
    string).
  - `buildDetailBlock` accepts a new option:
    `{ groupBy: "type" | "professional" }`. When `"professional"`, items
    are grouped by attending professional name (with "Sem profissional"
    bucket as the last section), still ordering items by date inside.
    Type-based grouping remains the default.
  - `DetailItem` interface gains `professionalName?: string` and
    `groupName?: string`. `buildDetailBlock` uses these to format
    `"Sessão em grupo — <group> · <professional>"` when in flat mode.
- `src/lib/financeiro/recalculate-invoice.ts`,
  `generate-monthly-invoice.ts`, `generate-per-session-invoices.ts`:
  - Extend the `allItems` Prisma query to include the new relations.
  - Decide layout mode via `getAttributionLayout` and pass
    `groupBy: "professional"` to `buildDetailBlock` only when multi.
  - Pass `tecnico_referencia` to `renderInvoiceTemplate`.

### Treatment of credits in multi-mode

CREDITO items always live in a final dedicated "Créditos" section
regardless of multi/single mode. *Why:* manual credits and
system-generated credits don't always pin to a specific attending
professional, and visually separating them avoids confusion with billed
sessions in the prof-sections. This matches the existing email template
behaviour where credits are their own section.

### Manual items (SESSAO_EXTRA / REUNIAO_ESCOLA without appointment)

These have no `attendingProfessional` and no date. In multi-mode they
fall into an "Outros" section after the last per-professional section
and before the credits section. In single-mode they continue to flow
inline (no behaviour change).

### PDF width constraint for long group names

The PDF uses `@react-pdf/renderer` whose `Text` element soft-wraps
automatically inside flex columns. With the proposed `colDesc: flex: 4`
and a 70-char description like `"Sessão em grupo — Adolescentes da Tarde · 10/03"`,
the description wraps onto a second line cleanly. The plan requires a
**visual snapshot test** at implementation time using a fixture with
the longest group name in the seed dataset; if wrapping looks ugly we
will (a) increase line-height on the description column or (b)
truncate group names to 36 chars with an ellipsis. Decision deferred to
implementation, captured here as a risk.

## Technical Considerations

### Architecture impacts

The plan introduces one new module
(`src/lib/financeiro/professional-attribution.ts`) and reshapes the
`InvoicePDFData.items` field from a flat array to a sections array.
Three call sites (PDF data builder, HTML invoice page, email body
rebuild) consume the helper. No DB migration. No API contract change.

### Backward compatibility

Existing invoices already have `messageBody` cached from the last time
they were generated/recalculated. They will continue to display with
the *old* format until the next recalculate. New format is materialized
on the next `gerar` / `recalcular` action, which is the explicit user
intent when they want fresh data. **Action item**: do not bulk-rebuild
all messageBody rows in a migration; let lazy regeneration take its
course.

### Performance implications

Two new include paths in 4-5 Prisma queries (PDF route, ZIP download,
HTML invoice page, recalculate-invoice, generate-monthly-invoice,
generate-per-session-invoices). Each is a 1-hop relation join; impact
is negligible. The HTML invoice page already fetches items with
`appointment` joined.

### Security considerations

None. Read paths only; no auth surface change.

## System-Wide Impact

- **Interaction graph:** invoice fetch → builder → renderer for each of
  the three surfaces. No callbacks/middleware fire from this change.
  `recalculate-invoice` is invoked from the recalcular endpoint and
  from grouping-mode transitions; both call sites get the new template
  variable for free.
- **Error propagation:** if a relation fetch returns null (e.g. a group
  was deleted but the appointment still references it), the helper
  treats missing data as "no group name" rather than crashing.
- **State lifecycle risks:** none — pure read-side change.
- **API surface parity:** all three render surfaces (PDF, HTML, email)
  must ship together. Otherwise a guardian sees inconsistent professional
  attribution depending on whether they open the PDF or the email.
- **Integration test scenarios** (see Test Plan section).

## Acceptance Criteria

### Functional

- [ ] Single-attending invoice's PDF, HTML, and email render with **no
  visible change** beyond a "Técnico de referência: X" line in the
  header (when the patient has one).
- [ ] Multi-attending invoice's PDF, HTML, and email render
  professional-grouped sections with `"Atendido por <name>"` as section
  header, items sorted by date asc within each section.
- [ ] Group sessions show `"Sessão em grupo — <TherapyGroup.name>"` in
  every render path.
- [ ] When the patient has no `referenceProfessionalId`:
  - single-attending → header line shows `"Profissional: <attending>"`.
  - multi-attending → header line is absent.
- [ ] CREDITO items always live in a final "Créditos" section in the
  email body, regardless of mode.
- [ ] Manual items (no `attendingProfessionalId`, no `appointment`) in
  multi-mode appear in an "Outros" section after the per-professional
  sections.

### Non-functional

- [ ] No new N+1 queries (verify with logging on a fixture invoice).
- [ ] PDF render time stays within 5% of current baseline.
- [ ] Long group names ("Adolescentes da Tarde - Quintas") wrap cleanly
  in the PDF description column.

### Quality gates

- [ ] `getAttributionLayout` and `enrichItemDescription` covered by unit
  tests including: 0 / 1 / 2+ attending profs, missing reference,
  missing group, manual credits, items with null appointment.
- [ ] `buildDetailBlock({ groupBy: "professional" })` covered by unit
  tests.
- [ ] Build (`npm run build`) and tests (`npm run test`) pass.
- [ ] Manual visual check on a multi-prof and a single-prof fixture
  invoice in the dev environment.

## Implementation Phases

### Phase 1 — Pure helpers + tests (foundation) [x]

Files:
- [x] `src/lib/financeiro/professional-attribution.ts` (new)
- [x] `src/lib/financeiro/professional-attribution.test.ts` (new — 15 tests)

Deliverable: `getAttributionLayout` and `enrichItemDescription` pass
their unit tests. No call sites wired yet.

### Phase 2 — Email body (lowest-risk surface) [x]

Files:
- [x] `src/lib/financeiro/invoice-template.ts` (extend `TemplateVariables`,
  `DetailItem`, `buildDetailBlock` with `groupBy: "professional" | "type"`)
- [x] `src/lib/financeiro/invoice-generator.ts` (add optional `groupName` on `AppointmentForInvoice`)
- [x] `src/lib/financeiro/recalculate-invoice.ts` (group + attending include, layout helper)
- [x] `src/lib/financeiro/generate-monthly-invoice.ts` (layout helper, attending map)
- [x] `src/lib/financeiro/generate-per-session-invoices.ts` (layout helper, group name pass-through)
- [x] `src/lib/financeiro/recalculate-dispatch.ts` (extend types, thread `referenceProfessional`)
- [x] `src/lib/financeiro/generate-patient-invoices.ts` (forward referenceProfessional + groupName)
- [x] `src/lib/financeiro/uninvoiced-appointments.ts` (group name + attendingProfessionalId in select)
- [x] `src/app/api/financeiro/faturas/[id]/recalcular/route.ts` (referenceProfessional in select)
- [x] `src/app/api/financeiro/faturas/[id]/items/route.ts` (referenceProfessional in select)
- [x] `src/app/api/financeiro/faturas/[id]/items/[itemId]/route.ts` (referenceProfessional in select)
- [x] `src/app/api/financeiro/faturas/gerar/route.ts` (group + referenceProfessional in selects)
- [x] `src/app/api/financeiro/faturas/recalcular-grupo/route.ts` (group + referenceProfessional)
- [x] `src/app/api/financeiro/faturas/manual/route.ts` (template variable backfill)
- [x] `src/lib/financeiro/recalculate-invoice.test.ts` (updated expectation)

Deliverable: build is clean, 1431/1431 tests pass.

### Phase 3 — PDF [x]

Files:
- [x] `src/lib/financeiro/build-invoice-pdf-data.ts` (reshape to
  `itemSections`, helper-driven layout, group-name enrichment, label/value
  split for header)
- [x] `src/lib/financeiro/invoice-pdf.tsx` (new InvoicePDFItem +
  InvoicePDFItemSection types, section divider rows, header label/value
  pair, columns widened: colDesc 3→4, colPrice 70→60)
- [x] `src/app/api/financeiro/faturas/download-zip/query.ts`
  (shared INVOICE_INCLUDE: group + attendingProfessional + reference)

Deliverable: build green, tests green. Visual snapshot pending in Phase 5
when we exercise a multi-prof fixture.

### Phase 4 — HTML detail page [x]

Files:
- [x] `src/app/financeiro/faturas/[id]/types.ts` (extend `InvoiceItem`
  with `attendingProfessional` + `appointment.group`; extend `patient`
  with `referenceProfessional`)
- [x] `src/app/financeiro/faturas/[id]/page.tsx` ("Técnico de
  referência" line under patient name when present)
- [x] `src/app/financeiro/faturas/[id]/InvoiceItemsTable.tsx`
  (extracted `renderItemsBody` helper; section dividers in multi-prof
  mode; group name on description; edit/delete UX preserved)
- [x] `src/app/api/financeiro/faturas/[id]/route.ts` GET (extend Prisma
  include with referenceProfessional, group.name, attendingProfessional)

Deliverable: build green, 1431 tests pass.

## Alternatives Considered (and rejected)

- **Approach A — sections always:** rejected because it adds visual
  machinery to the common single-prof case
  (see brainstorm: `docs/brainstorms/2026-05-03-invoice-professional-attribution-brainstorm.md`).
- **Approach B — flat with `· <name>` per line:** rejected as too noisy
  on narrow PDFs and redundant for single-prof invoices (same reference).

## Dependencies & Risks

- **Risk:** PDF wrapping looks ugly with very long group names. *Mitigation:*
  visual snapshot test in Phase 3; truncate to 36 chars with ellipsis if needed.
- **Risk:** in-flight `messageBody` strings on existing invoices remain
  in the old format until next recalcular. *Mitigation:* this is the
  intended behaviour; no migration. Document in PR description.
- **Risk:** `attendingProfessional` may be null on items created before
  the consolidation rollout (legacy data). *Mitigation:* helper treats
  null as falling into the "Outros" bucket in multi-mode and contributes
  zero distinct professionals to the mode decision in single-mode.
- **Dependency:** none external. All required Prisma relations exist.

## Open Questions

- **Resolved at planning time:**
  - Sort order inside professional section: by `appointment.scheduledAt`
    ascending. Items without a date sort to the bottom of their section.
  - NFSe `descricaoServico`: **no change** (confirmed by user during
    planning).
  - PDF width: addressed by widening `colDesc` from `flex: 3` to
    `flex: 4` and trimming `colPrice` from `width: 70` to `60`. Visual
    snapshot test in Phase 3 will confirm; truncation to 36 chars is
    the fallback.
- **Deferred to implementation:** none.

## Sources & References

### Origin

- **Brainstorm:** [`docs/brainstorms/2026-05-03-invoice-professional-attribution-brainstorm.md`](../brainstorms/2026-05-03-invoice-professional-attribution-brainstorm.md)
  — carried forward: chosen approach (C), header rules, group name
  source, scope (3 surfaces), open question on NFSe (resolved here).

### Internal references

- Patient consolidation plan that introduced
  `InvoiceItem.attendingProfessionalId`:
  `docs/plans/2026-04-01-001-feat-consolidate-invoices-per-patient-plan.md`.
- PDF data builder: `src/lib/financeiro/build-invoice-pdf-data.ts`.
- PDF template: `src/lib/financeiro/invoice-pdf.tsx`.
- Email template + helpers: `src/lib/financeiro/invoice-template.ts`.
- HTML invoice items component:
  `src/app/financeiro/faturas/[id]/InvoiceItemsTable.tsx`.
- Recalculate / generate paths:
  `src/lib/financeiro/recalculate-invoice.ts`,
  `src/lib/financeiro/generate-monthly-invoice.ts`,
  `src/lib/financeiro/generate-per-session-invoices.ts`.

### External references

- `@react-pdf/renderer` `Text` wrapping behaviour:
  https://react-pdf.org/components#text — confirms automatic
  soft-wrapping inside flex columns.
