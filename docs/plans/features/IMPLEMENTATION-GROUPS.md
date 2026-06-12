# Implementation Groups — Market-Gap Features

Branch: `market-features` · Worktree: `../clinica-market-features`

The 15 planned features are split into **6 dependency-ordered groups**. Groups are
implemented one at a time, in order: every hard dependency of a group is satisfied by
an earlier group, and the ★ "foundation" feature inside a group is built first because
later features (in the same or later groups) build on the module/field it introduces.

All 15 features modify `prisma/schema.prisma` and shared files (RBAC `FEATURES` map,
`NotificationType` enum, `vercel.json`), so within a single branch they are built
**sequentially** — each feature builds on the committed state of the previous one,
which is exactly why merge conflicts are avoided.

Legend — Effort: **S** ½ day · **M** 1 day · **L** 2–3 days · **XL** week+ · ★ = foundation built first.

---

## Group 1 — Núcleo Clínico (Clinical Core)

| # | Feature | Effort | Prio | Depends on |
|---|---------|:------:|:----:|------------|
| 001 ★ | Prontuário Eletrônico (evoluções clínicas CFP) | XL | 10 | — |
| 005 | IA para Evoluções (rascunho assistido) | L | 8 | **001** (editor + note sections) |

**Establishes:** `src/lib/clinic/ownership.ts` (tenant FK-validation helper reused by every later group).
**Why first:** highest-impact clinical feature; creates the shared ownership helper that 12 other plans expect.

## Group 2 — Agendamento & Autoatendimento (Booking & Self-service)

| # | Feature | Effort | Prio | Depends on |
|---|---------|:------:|:----:|------------|
| 002 ★ | Agendamento Online (autoagendamento público) | XL | 10 | — |
| 003 | Área do Paciente (portal/PWA) | XL | 9 | **002** (booking module) |
| 011 | Lista de Espera (oferta automática de horários) | L | 7 | **002** |
| 014 | Sincronização Google Agenda / iCal | XL | 6 | **002** |

**Establishes:** `src/lib/booking/` (slot engine, timezone, matching) reused by 003, 011, 014 and read by 015.
**Why second:** the booking cluster delivers the other priority-10 feature and a module three siblings reuse.

## Group 3 — Fiscal & Cobrança (Fiscal & Billing)

| # | Feature | Effort | Prio | Depends on |
|---|---------|:------:|:----:|------------|
| 004 ★ | Receita Saúde + DMED (pacote fiscal) | L | 9 | — |
| 006 | Cobrança Integrada (Pix/cartão, Stripe Connect, régua) | XL | 8 | — |

**Establishes:** `ProfessionalProfile.cpf` + `fiscalRegime` (added idempotently; Group 4 reuses via `ADD COLUMN IF NOT EXISTS`).

## Group 4 — Documentos & Assinatura (Documents & Signature)

| # | Feature | Effort | Prio | Depends on |
|---|---------|:------:|:----:|------------|
| 009 ★ | Gerador de Documentos CFP (declarações, atestados, recibos) | L | 7 | — |
| 010 | Assinatura Eletrônica de TCLE e contratos | L | 7 | **009** (`GeneratedDocument`, `DocumentType` enum) |

**Establishes:** `GeneratedDocument` model + `DocumentType` enum that 010 extends with consent types.

## Group 5 — Sessões & Formulários (Sessions & Forms)

| # | Feature | Effort | Prio | Depends on |
|---|---------|:------:|:----:|------------|
| 007 | Teleconsulta (sala de vídeo integrada) | L | 8 | soft: telepsych guard uses **010** (G4) |
| 008 | Construtor de Anamnese (formulários do paciente) | XL | 8 | — |
| 012 | Escalas Clínicas e Monitoramento (PHQ-9/GAD-7) | L | 7 | — |

**Note:** 007's CFP-09/2024 telepsych-contract chip is deferred until 010 exists (Group 4) — already accounted for.

## Group 6 — Anexos & Insights (Attachments & Insights)

| # | Feature | Effort | Prio | Depends on |
|---|---------|:------:|:----:|------------|
| 013 | Anexos do Paciente (armazenamento de arquivos) | M | 6 | soft: archiving hook deferred from **008** (G5) |
| 015 | Dashboard Operacional (ocupação, retenção, desempenho) | M | 6 | reads data across all modules → built last |

---

## Dependency graph (hard deps only)

```
001 ──▶ 005
002 ──▶ 003, 011, 014
009 ──▶ 010
```

Soft / shared-resource couplings (no build-blocking, handled by ordering):
- `ProfessionalProfile.cpf`: 004 (G3) and 009 (G4) both add it — idempotent, first wins.
- `src/lib/clinic/ownership.ts`: created by 001 (G1); all later features reuse it.
- `src/lib/booking/`: created by 002 (G2); used by 003/011/014 and read by 015.
- 007 (G5) telepsych guard references 010 (G4) — 010 lands first.
- 008 (G5) leaves attachment archiving to 013 (G6) — 013 lands after.

## Group order rationale

`G1 → G2` lead with the two priority-10 clusters and lay down the two shared foundations
(`ownership.ts`, `booking/`). `G3` brings the high-value fiscal/billing pair and adds the
shared `cpf`/`fiscalRegime` fields. `G4` builds the document base, then the signature layer
on top. `G5` adds the independent session/form features (after the signature layer they
softly reference). `G6` closes with the two lightest features, including the read-only
dashboard that aggregates everything built before it.

**Status:** grouping only — no implementation started. Implement on request, group by group.
