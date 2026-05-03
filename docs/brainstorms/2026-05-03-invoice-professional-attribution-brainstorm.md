---
date: 2026-05-03
topic: invoice-professional-attribution
---

# Invoice Professional Attribution

## What We're Building

Surface professional information on the unified per-patient invoice so the
guardian can see (a) who is the patient's reference professional in the
clinic and (b) who delivered each billed session. Group sessions also gain
the therapy group's name on the line item.

The change is presentation-only — `InvoiceItem.attendingProfessionalId`
and `Patient.referenceProfessionalId` already exist (added by the
patient-consolidation rollout). Affects PDF render, HTML invoice page,
and email body.

## Why This Approach

Three layouts were considered:

- **A — Sections per professional (always).** Cleanest grouping but adds
  visual machinery to the common single-professional invoice and forces
  group name onto a per-line attribute.
- **B — Keep type-based sections (Sessões / Sessões grupo / Créditos)
  and tag every line with `· Nome`.** Uniform structure, but noisy when
  one professional dominates and clutters narrow PDFs.
- **C — Hybrid (chosen).** Single-attending-professional invoices keep
  today's template untouched. When 2+ attending professionals appear on
  the same invoice, switch to sections grouped by professional. Group
  name always rendered next to the type label (`Sessão em grupo — Keep Lua`).

C wins because it changes nothing for the common case, makes the
multi-professional case visually unambiguous, and matches the stated
preference of "sections only when there are multiple professionals".

## Key Decisions

- **Header line.** Display "Técnico de referência: <name>" near the
  patient name. *Why:* anchors the invoice to one accountable
  professional, matching how the clinic refers to the relationship
  internally.
- **Layout switch.** `attendingProfessionalIds.distinct().count` ≥ 2
  triggers professional-grouped sections; otherwise current type-based
  layout. *Why:* avoids restructuring the typical invoice.
- **Group name visible.** Group sessions render as
  `Sessão em grupo — <TherapyGroup.name>` on the line description.
  *Why:* guardians and tax review need to identify which group the child
  attended.
- **Fallback when patient has no reference professional.**
  - Single-attending invoice → header shows
    "Profissional: <attending name>" instead.
  - Multi-attending invoice → header line is omitted entirely.
  *Why:* missing reference shouldn't render a confusing/empty label.
- **No "outros profissionais atenderam" note.** Multi-prof section
  headers communicate this implicitly. *Why:* avoid redundancy.
- **Scope.** Apply changes to all three rendering paths in one plan:
  PDF (`invoice-template.ts`), HTML invoice detail page, email body
  builder. *Why:* keep the three surfaces in sync and avoid drift.

## Open Questions

- Sort order *within* a professional section in the multi-prof case:
  by date asc (default expectation), or preserve type sub-grouping
  inside each section? Resolve at planning time.
- Per-item NFSe descriptions — does the attending professional's name
  need to appear in the NFSe `descricaoServico` too, or only in the
  guardian-facing invoice? Resolve at planning time.
- Are there visual constraints on the PDF width that could break the
  "Sessão em grupo — <name>" line for long group names? Resolve at
  planning time.

## Next Steps

→ `/ce:plan` for implementation details
