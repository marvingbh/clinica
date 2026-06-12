---
title: "feat: Dashboard Operacional (ocupação, retenção e desempenho por profissional)"
type: feat
status: planned
date: 2026-06-11
slug: dashboard-operacional
priority: 6
complexity: M
---

# feat: Dashboard Operacional — ocupação, retenção e desempenho por profissional (`/relatorios`)

## 1. Contexto de Negócio

### Problema

A Clinica já responde "quanto entrou?" — o dashboard financeiro
(`/financeiro`, `src/lib/financeiro/dashboard-insights.ts` +
`dashboard-aggregation.ts`) cobre inadimplência, ticket médio, tempo de
recebimento, concentração de receita e até uma taxa de cancelamento agregada
(`noShowRate` no dashboard inicial via `/api/dashboard`). Mas **não responde
as perguntas operacionais** que donos de clínicas multi-profissionais fazem
toda semana:

- *"Quanto da agenda de cada profissional está realmente ocupada?"* — temos
  `AvailabilityRule`/`AvailabilityException` desde o início do produto e nunca
  cruzamos disponibilidade × agendamentos.
- *"Quem cancela, quando e com qual profissional?"* — o `noShowRate` existe,
  mas sem as dimensões "onde" (dia/hora) e "com quem" (profissional).
- *"Pacientes novos voltam para a 2ª sessão? Chegam à 5ª? Quantos abandonaram
  sem ninguém perceber?"* — retenção/dropout não existe em lugar nenhum.
- *"De onde vêm os pacientes novos?"* — o modelo `Patient` não registra origem
  (indicação, Instagram, Google…), então marketing é decidido no escuro.

### Evidência de mercado

Ocupação de agenda, retenção e comparativo por profissional são itens de
checklist de compra de ERP clínico no Brasil e fora: **Feegow, Clínica nas
Nuvens, Clinicorp, Amplimed, Shosp** (BR) e **Owl Practice, Power Diary/Zanda,
Jane App** (internacional) anunciam exatamente esses relatórios. É o Roadmap
Tier 1 #4, escopado para a metade que falta: os KPIs financeiros já existem;
ocupação, retenção, rebooking, comparativos por profissional e origem de
aquisição não.

### Usuários-alvo

- **ADMIN / dono(a) de clínica**: vê todos os profissionais lado a lado
  (produtividade × capacidade × receita), decide contratações, horários e
  investimento em marketing.
- **PROFESSIONAL**: vê o próprio painel (ocupação, cancelamentos, retenção dos
  próprios pacientes) **sem** comparativos de receita com colegas — espelha a
  regra de visibilidade já estabelecida no repasse (cada profissional vê só os
  próprios números).
- **Profissional solo**: mesma página, com empty states que explicam cada
  métrica em pt-BR simples para que o valor seja óbvio desde o primeiro acesso.

### Métricas de sucesso

- % de clínicas ativas que abrem `/relatorios` ao menos 1×/semana (meta: 40%
  em 60 dias).
- % de profissionais com `AvailabilityRule` cadastrada (o relatório de
  ocupação empurra a configuração — hint "configure sua disponibilidade").
- % de pacientes novos criados com `referralSource` preenchido (meta: 70% após
  30 dias).
- Nº de exports CSV gerados/mês (proxy de uso em reuniões de gestão).

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **ADMIN**, quero ver a taxa de ocupação de cada profissional no mês,
   para identificar agendas ociosas ou saturadas.
2. Como **ADMIN**, quero um heatmap de cancelamentos por dia da semana × hora,
   para descobrir os horários-problema.
3. Como **ADMIN**, quero saber quantos pacientes novos chegam à 2ª e à 5ª
   sessão e quantos "sumiram" (sem sessão e sem agendamento futuro), para agir
   antes do abandono virar churn.
4. Como **ADMIN**, quero ver pacientes novos por mês quebrados por origem
   ("como nos conheceu?"), para saber qual canal de aquisição converte.
5. Como **ADMIN**, quero exportar qualquer tabela em CSV que abra direito no
   Excel Brasil, para levar à reunião de sócios.
6. Como **PROFESSIONAL**, quero ver meu próprio painel (ocupação,
   cancelamentos, retenção, rebooking) sem expor os números dos colegas.
7. Como **profissional/secretária**, ao cadastrar um paciente (ou aprovar uma
   ficha de intake), quero registrar como ele conheceu a clínica.

### 2.2 Tela `/relatorios` (desktop-first, responsiva)

Página única com **abas** (mesmo padrão de `/financeiro`):
`Visão Geral · Retenção · Cancelamentos · Origens · Grupos`.

**Barra de filtros (persistente acima das abas)**

- Granularidade: segmented control **Mês / Trimestre / Ano**.
- Navegação `←  Maio 2026  →` (labels pt-BR: "Maio 2026", "2º trimestre 2026",
  "2026"). Sem input de data nativo; o período é sempre escolhido por
  navegação (consistente com `FinanceiroFilterBar`).
- Select **Profissional** ("Todos os profissionais" default) — visível apenas
  quando o usuário tem escopo de clínica (ADMIN). PROFESSIONAL não vê o
  select; tudo já vem filtrado para ele.

**Aba Visão Geral**

- Linha de KPI cards (reusa `src/shared/components/ui/kpi.tsx`):
  - `Taxa de ocupação` (média ponderada da clínica ou do prof filtrado)
  - `Sessões realizadas` (FINALIZADO no período)
  - `Taxa de cancelamento` (com quebra falta/acordado/profissional no tooltip)
  - `Taxa de reagendamento (7 dias)`
  - `Pacientes novos no período`
- **Tabela comparativa por profissional** (coração da feature):
  colunas `Profissional · Horas disponíveis · Horas agendadas · Ocupação ·
  Sessões · Cancelamentos (Ac./Falta/Prof.) · % Cancel. · Rebooking ·
  Receita · Ticket médio`. Receita/ticket reusam a atribuição por profissional
  já computada no financeiro. Para PROFESSIONAL a tabela tem 1 linha (a dele).
  Profissional sem `AvailabilityRule` ativa: ocupação mostra **"n/d"** com
  tooltip *"Cadastre a disponibilidade em Configurações → Disponibilidade para
  calcular a ocupação."* (link).
- **Tendência mensal**: linha de sessões realizadas + linha de canceladas por
  mês (quando granularidade = trimestre/ano; no mês mostra por semana).
- Botão **"Exportar CSV"** na tabela.

**Aba Retenção**

- Cards: `Chegam à 2ª sessão`, `Chegam à 5ª sessão`, `Sessões por paciente
  (média)`, `Vida mediana (sessões)`.
- Bloco "Atividade da base": `Ativos (sessão nos últimos 30 dias)`,
  `Ativos (60 dias)`, `Sem retorno` (sem sessão nos últimos 60 dias **e** sem
  agendamento futuro) — com contagem e lista exportável dos "sem retorno"
  (nome do paciente + última sessão + profissional de referência) para a
  equipe reativar.
- Coorte: a base de "pacientes novos" da retenção são pacientes cuja
  **primeira sessão FINALIZADO da história** caiu dentro do período filtrado.

**Aba Cancelamentos**

- Cards por status: `Cancelado (acordado)`, `Falta`, `Cancelado pelo
  profissional` + taxa total.
- **Heatmap dia da semana × hora** (Dom–Sáb × 06h–22h): intensidade = nº de
  cancelamentos no slot; tooltip com quebra por status. Células clicáveis não
  fazem drill-down nesta versão.
- Tabela por profissional (mesma quebra) com export CSV.

**Aba Origens**

- Gráfico de barras: pacientes novos por mês, empilhado por origem.
- Tabela por origem: `Origem · Pacientes novos · Converteram (≥1 sessão
  realizada) · % conversão`. Pacientes legados sem origem aparecem como
  **"Não informado"**.
- Export CSV.

**Aba Grupos**

- Tabela por `TherapyGroup` ativo: `Grupo · Profissional · Sessões no período ·
  Média de presentes · Capacidade · Ocupação % · Faltas`. Capacidade =
  `TherapyGroup.capacity` quando definida; senão, nº de membros ativos do
  grupo (com tooltip explicando o fallback).
- Export CSV.

### 2.3 Captura da origem do paciente ("Como nos conheceu?")

1. **Cadastro/edição de paciente** (`src/app/patients/components/PatientForm.tsx`):
   novo select "Como conheceu a clínica?" com as opções da enum + campo texto
   "Detalhe (opcional)" exibido quando `INDICACAO` ou `OUTRO` (ex.: nome de
   quem indicou). Ambos opcionais.
2. **Ficha pública de intake** (`src/app/intake/[slug]/intake-form.tsx` +
   `POST /api/public/intake/[slug]`): mesmo select/detalhe; persiste em
   `IntakeSubmission.referralSource/referralSourceDetail`; a aprovação
   (`src/lib/intake/mapping.ts`) transfere para o `Patient`.
3. **Agendamento online** (plano `2026-06-11-002`, ainda não implementado):
   quando for construído, a etapa de identificação deve incluir o mesmo campo.
   Este plano só registra o ponto de integração — nada a fazer agora.

### 2.4 Regras de negócio

| # | Regra |
|---|-------|
| R1 | **Só `CONSULTA` conta** para KPIs clínicos (ocupação-numerador, sessões, cancelamentos, retenção, rebooking). `TAREFA`/`REUNIAO` são excluídas; `LEMBRETE`/`NOTA` ignoradas por completo. |
| R2 | **Ocupação** = minutos agendados de CONSULTA não cancelada (AGENDADO/CONFIRMADO/FINALIZADO) ÷ minutos disponíveis derivados de `AvailabilityRule` ativas − `AvailabilityException` (data específica, recorrente, clinic-wide; `isAvailable=true` ADICIONA janela), por profissional, no período. Sem regra ativa → `null` ("n/d" + hint). Pode passar de 100% (atendimento fora da grade) — exibir o valor real com badge "acima da grade". |
| R3 | **Sessão de grupo ocupa um único bloco** de agenda (dedupe por `groupId+scheduledAt`, ou `sessionGroupId` para grupos avulsos), mas **conta uma sessão por membro presente** na retenção/sessões-por-paciente (cada membro já tem sua própria row de `Appointment`). |
| R4 | **Atribuição por profissional** usa `attendingProfessionalId ?? professionalProfileId` (paciente transferido/coberto conta para quem realmente atendeu — mesma regra do repasse). |
| R5 | **Cancelamentos** quebram pelos 3 status `CANCELADO_ACORDADO`, `CANCELADO_FALTA`, `CANCELADO_PROFISSIONAL`; taxa = canceladas ÷ total de CONSULTA do período. Heatmap usa `scheduledAt` (dia da semana × hora) no fuso local. |
| R6 | **Retenção**: coorte = pacientes com a primeira CONSULTA FINALIZADO da história dentro do período. % 2ª sessão e % 5ª sessão contam sessões FINALIZADO em qualquer data ≥ a primeira (não limitadas ao período). Ativo 30/60d = última FINALIZADO a ≤30/≤60 dias de hoje; "Sem retorno" = última FINALIZADO há >60 dias **e** nenhuma CONSULTA futura não cancelada. |
| R7 | **Rebooking (7 dias)**: % de sessões FINALIZADO do período para as quais existe outra CONSULTA do mesmo paciente, não cancelada, com `scheduledAt` em `(t, t + 7 dias]`. Janela secundária de 30 dias exibida ao lado (cobre quinzenais/mensais). |
| R8 | **Origens**: pacientes novos = `Patient.createdAt` dentro do período; `referralSource = null` agrupa em "Não informado"; conversão = % com ≥1 CONSULTA FINALIZADO. Sem backfill de dados legados. |
| R9 | **Receita por profissional** reusa `applyDerivedGroupStatus` + `groupByProfessional` de `src/lib/financeiro/dashboard-aggregation.ts` (mesmos números do dashboard financeiro — nenhuma nova fonte da verdade). |
| R10 | **Permissões**: nova feature RBAC `reports`. ADMIN → escopo clínica (todos os profissionais + select de filtro). PROFESSIONAL → escopo próprio: API força `professionalProfileId` do usuário, ignora o query param, e a resposta nunca inclui linhas de outros profissionais nem receita de colegas. |
| R11 | **Tenant isolation**: toda query Prisma com `clinicId` no `where`; `professionalId` vindo da query string é validado contra a clínica (helper de ownership) antes de usar. |
| R12 | **CSV**: delimitador `;`, BOM `﻿`, quebras CRLF, cabeçalhos pt-BR, números com vírgula decimal (`formatNumberBr`), datas `DD/MM/YYYY` — abre direto no Excel Brasil. Export gera entrada de `AuditLog` (`REPORT_EXPORTED`). |
| R13 | Agregações são computadas **server-side por request**, sempre com query date-bounded (exceto histórico de retenção, ver R6/Riscos). Sem cron, sem tabela de snapshot nesta versão. |

### 2.5 Edge cases

- **Profissional sem `AvailabilityRule`**: ocupação `null` → "n/d" + hint;
  demais colunas calculam normalmente.
- **Exceção clinic-wide (feriado)**: `AvailabilityException` com `clinicId`
  preenchido e `professionalProfileId` nulo remove horas de todos no dia.
- **Exceção parcial** (12:00–14:00): subtrai só a interseção da janela.
- **`isAvailable=true`** (atendimento extra num sábado): soma minutos mesmo
  sem regra semanal para o dia.
- **Sessão atravessando meia-noite ou fora de 06–22h**: heatmap agrega em
  buckets de borda (06h e 22h); ocupação usa minutos reais.
- **Paciente nulo** (`patientId == null` em CONSULTA legada/inconsistente):
  filtrado nas métricas por paciente (`patientId: { not: null }`); sempre usar
  `patient?.name` ao montar exports (gotcha de patient nullable).
- **Grupo sem membros no período**: linha com "—" e ocupação 0%.
- **Grupo sem `capacity`**: fallback = membros ativos
  (`GroupMembership.leaveDate == null`) na data da consulta do relatório.
- **Período futuro** (navegou para frente): disponibilidade só conta até
  `min(fim do período, hoje)` para não diluir ocupação com dias que ainda não
  aconteceram; sessões futuras AGENDADO/CONFIRMADO contam como "agendadas".
- **Clínica recém-criada / período sem dados**: cada aba mostra empty state
  educativo (copy em 2.6) em vez de tabela vazia.
- **PROFESSIONAL pedindo `professionalId` de colega**: parâmetro ignorado
  (resposta sempre own-scope), sem erro — mesma postura do
  `/api/financeiro/dashboard`.
- **Coorte de retenção minúscula** (<5 pacientes novos): percentuais exibidos
  com aviso "amostra pequena" para não induzir decisão com n=2.

### 2.6 Copy pt-BR (chaves principais)

| Contexto | Texto |
|---|---|
| Nav / título | `Relatórios` |
| Abas | `Visão Geral` · `Retenção` · `Cancelamentos` · `Origens` · `Grupos` |
| KPI ocupação | `Taxa de ocupação` |
| Ocupação n/d (tooltip) | `Cadastre a disponibilidade em Configurações → Disponibilidade para calcular a ocupação.` |
| Ocupação >100% (badge) | `acima da grade` |
| KPI rebooking | `Reagendamento em 7 dias` |
| Retenção cards | `Chegam à 2ª sessão` · `Chegam à 5ª sessão` · `Sessões por paciente (média)` · `Vida mediana (sessões)` |
| Atividade | `Ativos (30 dias)` · `Ativos (60 dias)` · `Sem retorno` |
| Aviso amostra | `Amostra pequena — interprete com cautela.` |
| Heatmap título | `Cancelamentos por dia e horário` |
| Origem (select) | `Como conheceu a clínica?` |
| Opções de origem | `Indicação` · `Instagram` · `Google` · `Site` · `Convênio` · `Outro` · (relatório) `Não informado` |
| Detalhe da origem | `Detalhe (opcional)` |
| Export | `Exportar CSV` |
| Empty Visão Geral | `Sem atendimentos neste período. A taxa de ocupação compara as horas agendadas com a disponibilidade cadastrada de cada profissional.` |
| Empty Retenção | `Ainda não há pacientes novos neste período. A retenção mostra quantos pacientes voltam para a 2ª e a 5ª sessão — o melhor indicador de qualidade clínica.` |
| Empty Cancelamentos | `Nenhum cancelamento neste período. Quando houver, você verá aqui os dias e horários em que eles mais acontecem.` |
| Empty Origens | `Cadastre a origem dos novos pacientes ("Como conheceu a clínica?") para descobrir qual canal traz mais pacientes.` |
| Empty Grupos | `Nenhuma sessão de grupo neste período.` |
| Erro genérico | `Não foi possível carregar o relatório. Tente novamente.` |

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

```prisma
// ENUMS
enum ReferralSource {
  INDICACAO
  INSTAGRAM
  GOOGLE
  SITE
  CONVENIO
  OUTRO
}

// model Patient — novos campos + índices
model Patient {
  // ... campos existentes ...
  referralSource       ReferralSource?
  referralSourceDetail String?          // texto livre (quem indicou / qual "outro")

  // novos índices
  @@index([clinicId, createdAt])        // pacientes novos por mês
  @@index([clinicId, referralSource])   // agrupamento por origem
}

// model IntakeSubmission — captura na ficha pública, transferida na aprovação
model IntakeSubmission {
  // ... campos existentes ...
  referralSource       ReferralSource?
  referralSourceDetail String?
}

// model TherapyGroup — capacidade para ocupação de grupos
model TherapyGroup {
  // ... campos existentes ...
  capacity Int?   // null = derivar de membros ativos
}
```

Nenhum modelo novo. Todas as agregações leem `Appointment`,
`AvailabilityRule`, `AvailabilityException`, `Invoice`, `TherapyGroup`,
`GroupMembership` existentes (histórico pré-feature funciona sem backfill;
só `referralSource` reporta "Não informado" para legados).

**Migração (SQL autorado offline — NUNCA `prisma db push`/`migrate dev`):**

`prisma/migrations/20260611150000_add_referral_source_group_capacity/migration.sql`

```sql
CREATE TYPE "ReferralSource" AS ENUM
  ('INDICACAO','INSTAGRAM','GOOGLE','SITE','CONVENIO','OUTRO');

ALTER TABLE "Patient"
  ADD COLUMN "referralSource" "ReferralSource",
  ADD COLUMN "referralSourceDetail" TEXT;

ALTER TABLE "IntakeSubmission"
  ADD COLUMN "referralSource" "ReferralSource",
  ADD COLUMN "referralSourceDetail" TEXT;

ALTER TABLE "TherapyGroup"
  ADD COLUMN "capacity" INTEGER;

CREATE INDEX "Patient_clinicId_createdAt_idx"
  ON "Patient"("clinicId", "createdAt");

CREATE INDEX "Patient_clinicId_referralSource_idx"
  ON "Patient"("clinicId", "referralSource");
```

Colunas todas nullable/aditivas → deploy seguro com `prisma migrate deploy`
(pipeline `vercel-build` existente).

### 3.2 RBAC — nova feature `reports` (`src/lib/rbac/`)

- `types.ts`: adicionar `"reports"` a `FEATURES`;
  `FEATURE_LABELS.reports = "Relatórios"` (a página
  `/admin/permissions` itera `FEATURES`, então a nova feature aparece
  automaticamente para overrides por usuário).
- `permissions.ts` → `ROLE_DEFAULTS`:
  - `ADMIN: { ..., reports: "READ" }`
  - `PROFESSIONAL: { ..., reports: "READ" }`
- Escopo **dentro** dos handlers (withFeatureAuth NÃO escopa):
  `const scope = user.role === "ADMIN" ? "clinic" : "own"` — espelho exato de
  `src/app/api/financeiro/dashboard/route.ts`.

### 3.3 Ownership helper (`src/lib/clinic/ownership.ts` — criar; convenção do projeto)

O arquivo ainda não existe em `main` (só `src/lib/clinic/colors/`). Criar:

```ts
// src/lib/clinic/ownership.ts
import { prisma } from "@/lib/prisma"

/** Resolve um professionalProfileId vindo de request SOMENTE se pertencer à clínica. */
export async function professionalInClinic(
  clinicId: string,
  professionalProfileId: string
): Promise<boolean> {
  const found = await prisma.professionalProfile.findFirst({
    where: { id: professionalProfileId, user: { clinicId } },
    select: { id: true },
  })
  return found !== null
}
```

(Se outro plano da série 2026-06-11 já tiver criado o arquivo quando este for
implementado, apenas acrescentar a função.)

### 3.4 Novo domain module `src/lib/analytics/` (funções puras + testes colocados)

Cada arquivo <200 linhas, com `*.test.ts` colocado. Barrel `index.ts`.

```
src/lib/analytics/
├── index.ts                 # barrel
├── types.ts                 # DTOs compartilhados
├── period.ts                # resolução de período mês/trimestre/ano
├── query.ts                 # zod parse dos query params do relatório
├── occupancy.ts             # expansão de disponibilidade + ocupação
├── cancellations.ts         # breakdown por status + heatmap
├── retention.ts             # coorte 2ª/5ª sessão, atividade, mediana
├── rebooking.ts             # taxa de reagendamento por janela
├── acquisition.ts           # pacientes novos por origem + conversão
├── group-occupancy.ts       # ocupação de grupos
├── comparison.ts            # merge das linhas por profissional
├── csv.ts                   # CSV pt-BR (BOM, ';', CRLF)
├── fetch-overview.ts        # fetchers Prisma (thin, clinicId-scoped)
├── fetch-retention.ts
├── fetch-cancellations.ts
├── fetch-origins.ts
└── fetch-groups.ts
```

Assinaturas das funções puras (testáveis sem Prisma):

```ts
// types.ts
export type PeriodGranularity = "month" | "quarter" | "year"
export interface PeriodInput { year: number; month?: number | null; quarter?: number | null }
export interface DateRange { start: Date; end: Date } // meio-aberto [start, end)

// period.ts
export function resolvePeriod(input: PeriodInput): DateRange
export function prevPeriod(input: PeriodInput): PeriodInput
export function periodLabel(input: PeriodInput): string          // "Maio 2026" | "2º trimestre 2026" | "2026"
export function monthsInRange(range: DateRange): Array<{ year: number; month: number }>

// query.ts (zod) — usado pelos 5 routes
export function parseReportQuery(searchParams: URLSearchParams):
  | { ok: true; period: PeriodInput; professionalId: string | null; format: "json" | "csv" }
  | { ok: false; error: string }

// occupancy.ts
export interface AvailabilityRuleSlim { dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }
export interface AvailabilityExceptionSlim {
  date: Date | null; dayOfWeek: number | null; isRecurring: boolean
  isAvailable: boolean; startTime: string | null; endTime: string | null
}
/** Minutos disponíveis de UM profissional no range (regras − exceções; isAvailable=true soma). */
export function availableMinutes(
  rules: AvailabilityRuleSlim[],
  exceptions: AvailabilityExceptionSlim[],   // já inclui as clinic-wide do tenant
  range: DateRange,
  todayCap?: Date                            // não contar dias futuros
): number
export interface BookedSlot { scheduledAt: Date; endAt: Date; groupKey: string | null }
/** Minutos agendados com dedupe de blocos de grupo (groupKey = groupId|sessionGroupId + scheduledAt). */
export function bookedMinutes(slots: BookedSlot[]): number
export function occupancyRate(booked: number, available: number): number | null  // null = "n/d"

// cancellations.ts
export type CancelStatus = "CANCELADO_ACORDADO" | "CANCELADO_FALTA" | "CANCELADO_PROFISSIONAL"
export interface ApptStatusSlim { status: string; scheduledAt: Date }
export function cancellationBreakdown(appts: ApptStatusSlim[]): {
  total: number; cancelled: number; rate: number
  byStatus: Record<CancelStatus, number>
}
export interface HeatmapCell { dayOfWeek: number; hour: number; total: number; byStatus: Record<CancelStatus, number> }
export function cancellationHeatmap(appts: ApptStatusSlim[]): HeatmapCell[]  // só status cancelados; hour clampado 6–22

// retention.ts
export interface PatientSession { patientId: string; scheduledAt: Date }
export function computeRetention(args: {
  allFinalizadoSessions: PatientSession[]   // história completa (clinic/prof scoped)
  futureBookedPatientIds: Set<string>       // CONSULTA futura não cancelada
  range: DateRange
  now: Date
}): {
  cohortSize: number
  reached2ndPct: number | null; reached5thPct: number | null   // null se coorte vazia
  avgSessionsPerPatient: number | null
  medianLifetimeSessions: number | null
  active30: number; active60: number; dropped: number
  droppedPatientIds: string[]
  smallSample: boolean                       // cohortSize < 5
}

// rebooking.ts
export function computeRebooking(args: {
  finalizedInRange: PatientSession[]
  candidateNextSessions: PatientSession[]    // CONSULTA não cancelada, qualquer status, scheduledAt > range.start
  windowDays: number                         // 7 e 30
}): { total: number; rebooked: number; rate: number | null }

// acquisition.ts
export const REFERRAL_SOURCE_LABELS: Record<string, string> // + "NAO_INFORMADO" → "Não informado"
export interface NewPatientSlim { createdAt: Date; referralSource: string | null; converted: boolean }
export function acquisitionReport(patients: NewPatientSlim[], range: DateRange): {
  bySource: Array<{ source: string; label: string; count: number; converted: number; conversionPct: number | null }>
  byMonth: Array<{ year: number; month: number; bySource: Record<string, number> }>
  total: number
}

// group-occupancy.ts
export interface GroupSessionSlim { groupKey: string; groupId: string; scheduledAt: Date; status: string }
export function groupOccupancy(args: {
  memberAppointments: GroupSessionSlim[]     // 1 row por membro por sessão
  capacityByGroup: Map<string, number | null>
  activeMembersByGroup: Map<string, number>
}): Array<{
  groupId: string; sessions: number; avgPresent: number
  capacity: number; occupancyPct: number | null; faltas: number
}>

// comparison.ts
export interface ComparisonRow {
  professionalProfileId: string; name: string
  availableMinutes: number; bookedMinutes: number; occupancy: number | null
  sessions: number; cancellations: Record<CancelStatus, number>; cancellationRate: number
  rebooking7: number | null; revenue: number | null; avgTicket: number | null
}
export function buildComparisonRows(parts: {
  profs: Array<{ id: string; name: string }>
  occupancyByProf: Map<string, { available: number; booked: number }>
  cancelByProf: Map<string, ReturnType<typeof cancellationBreakdown>>
  rebookingByProf: Map<string, number | null>
  revenueByProf: Map<string, { revenue: number; sessions: number }> | null  // null = own scope sem comparativo
}): ComparisonRow[]

// csv.ts
export function toCsvBr(headers: string[], rows: Array<Array<string | number | null>>): string
export function formatNumberBr(n: number, decimals?: number): string  // 1234.5 → "1.234,5"
export function csvFilename(prefix: string, period: PeriodInput): string // "ocupacao-2026-05.csv"
```

Os **fetchers** (`fetch-*.ts`) são as únicas funções do módulo que tocam
Prisma — seguem o padrão de `dashboard-insights.ts` (fetch + composição das
puras, `_internal` export para testes quando útil). Todos recebem
`{ clinicId, professionalProfileId, range }` e **todo `where` inclui
`clinicId`**. Selects mínimos (`select:`) e date-bounded:

- `fetch-overview.ts`: appointments CONSULTA do range
  (`select: { status, scheduledAt, endAt, professionalProfileId,
  attendingProfessionalId, groupId, sessionGroupId, patientId }`),
  `availabilityRule`/`availabilityException` por prof (+ clinic-wide),
  invoices do período via a mesma query/funções do
  `/api/financeiro/dashboard` (R9), e próximas sessões para rebooking
  (`scheduledAt: { gt: range.start, lte: addDays(range.end, 30) }`).
- `fetch-retention.ts`: história de FINALIZADO CONSULTA da clínica
  (`select: { patientId, scheduledAt }`, `patientId: { not: null }`) +
  `patientId`s com CONSULTA futura não cancelada. Para a lista de "sem
  retorno", um segundo lookup `patient.findMany({ where: { clinicId, id: { in: dropped } }, select: { id, name, referenceProfessional… } })`.
- `fetch-origins.ts`: `patient.findMany({ where: { clinicId, createdAt: { gte, lt } }, select: { createdAt, referralSource, appointments: { where: { type: "CONSULTA", status: "FINALIZADO" }, take: 1, select: { id: true } } } })`.
- `fetch-groups.ts`: appointments com `groupId != null` (ou `sessionGroupId`)
  no range + `therapyGroup.findMany({ where: { clinicId } })` +
  memberships ativas.

### 3.5 Rotas de API (`src/app/api/relatorios/…`)

Todas com `withFeatureAuth({ feature: "reports", minAccess: "READ" })`,
handlers <50 linhas (parse → ownership/scope → fetcher → JSON ou CSV):

| Rota | Método | Resposta (JSON) |
|---|---|---|
| `/api/relatorios/overview` | GET | `{ period, totals: { occupancy, sessions, cancellationRate, rebooking7, newPatients }, professionals: ComparisonRow[], trend: Array<{ label, sessions, cancelled }> }` |
| `/api/relatorios/retencao` | GET | retorno de `computeRetention` + `dropped: Array<{ patientId, name, lastSessionAt, referenceProfessionalName }>` |
| `/api/relatorios/cancelamentos` | GET | `{ totals: breakdown, byProfessional: [...], heatmap: HeatmapCell[] }` |
| `/api/relatorios/origens` | GET | retorno de `acquisitionReport` |
| `/api/relatorios/grupos` | GET | rows de `groupOccupancy` + nomes de grupo/profissional |

Query params comuns (validados por `parseReportQuery`):
`?year=2026&month=5` ou `&quarter=2` (mutuamente exclusivos; ausentes = ano
inteiro), `&professionalId=...` (opcional), `&format=csv` (opcional).

Regras de tenant/escopo em cada handler:

```ts
const parsed = parseReportQuery(new URL(req.url).searchParams)
if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

const scope = user.role === "ADMIN" ? "clinic" : "own"
let professionalId: string | null
if (scope === "own") {
  professionalId = user.professionalProfileId          // param da request é IGNORADO
} else if (parsed.professionalId) {
  if (!(await professionalInClinic(user.clinicId, parsed.professionalId)))
    return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 })
  professionalId = parsed.professionalId
} else professionalId = null
```

`format=csv` → handler chama o mesmo fetcher, mapeia para
`toCsvBr(...)` e responde:

```ts
return new NextResponse(csv, {
  headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${csvFilename("ocupacao", period)}"`,
  },
})
```

No own-scope, `ComparisonRow.revenue/avgTicket` vêm preenchidos **apenas** na
linha do próprio profissional (demais linhas nem existem na resposta).

### 3.6 Auditoria (`src/lib/rbac/audit.ts`)

- Adicionar `REPORT_EXPORTED: "REPORT_EXPORTED"` a `AuditAction`.
- Em cada rota, quando `format=csv`: `createAuditLog({ action: AuditAction.REPORT_EXPORTED, … metadata: { report, period } })`.
- `src/lib/audit/field-labels.ts`: adicionar labels
  `referralSource → "Origem do paciente"`,
  `referralSourceDetail → "Detalhe da origem"`,
  `capacity → "Capacidade do grupo"` (histórico de alterações do
  paciente/grupo continua legível).

### 3.7 Páginas e componentes de UI

**Novos** (feature-specific em `src/app/relatorios/`):

```
src/app/relatorios/
├── layout.tsx                       # RelatoriosProvider + título + RelatoriosFilterBar
├── page.tsx                         # tabs (espelho de /financeiro/page.tsx) — <200 linhas
├── context/RelatoriosContext.tsx    # { granularity, year, month, quarter, professionalId } (espelho de FinanceiroContext)
└── components/
    ├── RelatoriosFilterBar.tsx      # segmented Mês/Trimestre/Ano + ← label → + select profissional (só clinic-scope)
    ├── useReport.ts                 # hook genérico: fetch keyed nos filtros (ver nota useEffect)
    ├── OverviewTab.tsx              # KPI cards + ComparisonTable + TrendChart
    ├── ComparisonTable.tsx
    ├── TrendChart.tsx               # reusa padrão de shared/components/ui/revenue-chart.tsx
    ├── RetencaoTab.tsx
    ├── CancelamentosTab.tsx
    ├── HeatmapGrid.tsx              # grid CSS 7×17 (Dom–Sáb × 06–22h)
    ├── OrigensTab.tsx
    ├── GruposTab.tsx
    ├── ExportCsvButton.tsx          # <a href={apiUrl + "&format=csv"}> com ícone Download (lucide)
    └── MetricEmptyState.tsx         # ícone + texto explicativo pt-BR por métrica
```

**Nota useEffect (regra do projeto):** nada de `useEffect` cru. O fetch por
filtro usa o padrão **key-reset + `useMountEffect`**: `page.tsx` renderiza
`<ActiveTab key={`${tab}-${year}-${month}-${quarter}-${professionalId}`} />`
e cada tab usa `useReport(url)` que internamente faz `useMountEffect(fetch…)`
(uma montagem por combinação de filtros — sem dependency choreography). Não
copiar o `useEffect` legado de `/financeiro/page.tsx`.

**Arquivos existentes alterados:**

| Arquivo | Mudança |
|---|---|
| `src/shared/components/ui/sidebar-nav.tsx` | item `Relatórios` (ícone `BarChart3`) na seção Principal, gated por `permissions.reports !== "NONE"` (mesmo gating dos itens existentes) |
| `src/shared/components/ui/desktop-header.tsx` | item de navegação `Relatórios` (`href: "/relatorios"`, `matchPaths: ["/relatorios"]`) |
| `src/app/patients/components/PatientForm.tsx` | select "Como conheceu a clínica?" + detalhe condicional (react-hook-form + zod; enum como string literals) |
| `src/app/api/patients/route.ts` (+ rota de update `[id]`) | aceitar/persistir `referralSource`/`referralSourceDetail` (zod `z.enum([...]).nullish()`) |
| `src/app/intake/[slug]/intake-form.tsx` | mesmo select na ficha pública |
| `src/app/api/public/intake/[slug]/route.ts` | persistir os 2 campos na `IntakeSubmission` |
| `src/lib/intake/mapping.ts` | `mapSubmissionToPatient` transfere `referralSource`/`referralSourceDetail` |
| Form de grupo (`src/app/groups/…`) + rota de grupos | campo `Capacidade (opcional)` em `TherapyGroup` |
| `src/lib/rbac/types.ts`, `permissions.ts` | feature `reports` (3.2) |
| `src/lib/rbac/audit.ts`, `src/lib/audit/field-labels.ts` | 3.6 |

**Integrações que NÃO mudam:** notificações (nenhuma), cron jobs em
`vercel.json` (nenhum — tudo é computado por request), Stripe/planos
(nenhum gating por plano nesta versão).

---

## 4. Plano de Testes

Vitest, colocados, `import { describe, it, expect } from "vitest"`; enums
Prisma como string literals; `vi.useFakeTimers()` onde "hoje" importa.

| Arquivo | Comportamentos cobertos |
|---|---|
| `src/lib/analytics/period.test.ts` | range de mês/trimestre/ano (meio-aberto), fevereiro bissexto, `prevPeriod` atravessando ano, `periodLabel` pt-BR, `monthsInRange` |
| `src/lib/analytics/query.test.ts` | parse válido (mês, trimestre, ano), month+quarter juntos → erro, valores fora de faixa, `format=csv`, defaults |
| `src/lib/analytics/occupancy.test.ts` | expansão de regra semanal no range; exceção de data cheia, parcial, recorrente e clinic-wide; `isAvailable=true` somando janela extra; `todayCap` (período futuro); regra inativa ignorada; `bookedMinutes` com dedupe de bloco de grupo; `occupancyRate` null sem disponibilidade; >100% |
| `src/lib/analytics/cancellations.test.ts` | breakdown pelos 3 status; taxa com arredondamento; heatmap bucket dia×hora; clamp 06–22h; lista vazia |
| `src/lib/analytics/retention.test.ts` | coorte = 1ª sessão da história no range; % 2ª/5ª sessão contando além do período; média e mediana (n par/ímpar); active30/active60; dropped exige >60d **e** sem futuro; `smallSample`; coorte vazia → nulls |
| `src/lib/analytics/rebooking.test.ts` | janela `(t, t+7d]` inclusiva no limite; próxima cancelada não conta; janela 30d; múltiplas sessões do mesmo paciente; sem sessões → rate null |
| `src/lib/analytics/acquisition.test.ts` | bucket por origem incl. `NAO_INFORMADO`; série por mês; conversão %; range vazio |
| `src/lib/analytics/group-occupancy.test.ts` | média de presentes; capacidade explícita vs fallback membros ativos; faltas (`CANCELADO_FALTA`); sessões canceladas pelo profissional excluídas do denominador |
| `src/lib/analytics/comparison.test.ts` | merge das fontes por prof; prof sem disponibilidade → occupancy null; `revenueByProf = null` (own scope) → revenue/avgTicket null |
| `src/lib/analytics/csv.test.ts` | BOM no início; `;` delimitador; CRLF; escaping de `;`/aspas/quebra de linha; `formatNumberBr` (vírgula decimal, milhar); `csvFilename` |
| `src/lib/intake/mapping.test.ts` (estender) | `referralSource`/`referralSourceDetail` transferidos para o Patient |
| `src/app/api/relatorios/overview/route.test.ts` | (padrão do `dashboard/insights/route.test.ts`, prisma mockado) PROFESSIONAL forçado a own-scope ignorando `professionalId`; ADMIN com `professionalId` de outra clínica → 404; query inválida → 400; `format=csv` → headers `text/csv` + BOM |

Gates antes de cada commit: `npx prisma generate && npm run test && npm run build`.

---

## 5. Etapas de Implementação

Cada etapa compila, passa nos testes e é commitável isoladamente
(conventional commits, terminando com
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; **nunca** `git push`).

1. **Worktree + DB isolado** — `bash scripts/new-feature.sh dashboard-operacional`;
   trabalhar em `../clinica-dashboard-operacional`.
2. **Schema + migração** — editar `prisma/schema.prisma` (3.1), criar o SQL
   offline em `prisma/migrations/20260611150000_add_referral_source_group_capacity/`,
   aplicar localmente com `npx prisma migrate deploy` no DB do worktree,
   `npx prisma generate`. Verificável: build verde.
3. **RBAC + ownership** — feature `reports` em `types.ts`/`permissions.ts`;
   criar `src/lib/clinic/ownership.ts`. Atualizar testes de
   `rbac/permissions.test.ts` se cobrem o shape de `ROLE_DEFAULTS`.
   Verificável: `/admin/permissions` lista "Relatórios".
4. **Núcleo puro do módulo analytics** — `types.ts`, `period.ts`, `query.ts`,
   `csv.ts` + testes. Verificável: `npx vitest run src/lib/analytics`.
5. **Métricas puras** — `occupancy.ts`, `cancellations.ts`, `retention.ts`,
   `rebooking.ts`, `acquisition.ts`, `group-occupancy.ts`, `comparison.ts`
   + testes (a maior etapa; commitar por métrica se conveniente).
6. **Fetchers + rotas** — `fetch-*.ts`, 5 rotas em `src/app/api/relatorios/`,
   audit de export, route test do overview. Verificável: `curl` autenticado
   retorna JSON coerente com o seed local; CSV abre no Excel/Numbers.
7. **Captura de origem** — `PatientForm`, rotas de patient create/update,
   intake form + rota pública + `mapSubmissionToPatient`, labels de auditoria.
   Verificável: criar paciente com origem, aprovar intake, conferir
   `/api/relatorios/origens`.
8. **Capacidade de grupo** — campo no form/rota de grupos. Verificável: aba
   Grupos usa capacity e fallback.
9. **UI `/relatorios`** — context, filter bar, page com tabs, componentes das
   5 abas, empty states, `ExportCsvButton`. Verificável: navegação por
   período/profissional re-busca (key-reset), PROFESSIONAL não vê select nem
   receita de colegas.
10. **Navegação** — sidebar + desktop header gated por permissão.
11. **Gates finais + commit** — `npx prisma generate && npm run test &&
    npm run build`; revisão manual com dados de produção sincronizados
    (`scripts/sync-prod-to-local.sh` já roda no setup do worktree); commits
    locais; aguardar instrução explícita para push/merge; depois
    `bash scripts/cleanup-feature.sh dashboard-operacional`.

---

## 6. Riscos e Questões em Aberto

1. **Peso da query de retenção** — ela lê a história completa de CONSULTA
   FINALIZADO da clínica (necessário para "1ª sessão da história" e vida em
   sessões). Mitigação: `select` de 2 colunas, índice existente
   `(clinicId, status)` / `(professionalProfileId, status, scheduledAt)`,
   instrumentação do plano de performance
   (`docs/plans/2026-04-14-performance-instrumentation-quickwins-plan.md`).
   Se medições apontarem problema: cache em memória por
   `clinicId+período` com TTL curto, ou tabela de snapshot mensal (fora desta
   versão).
2. **Duplicação da expansão de disponibilidade** — o plano
   `2026-06-11-002` (agendamento online) prevê um motor de slots em
   `src/lib/booking` com a mesma semântica regra−exceção. Quem implementar
   por último deve extrair a expansão comum para um módulo compartilhado
   (ex.: `src/lib/availability/`) em vez de manter duas cópias.
3. **Semântica do rebooking** — o spec diz "future booking within 7 days";
   interpretamos como *próxima sessão marcada para até 7 dias depois*
   (pacientes semanais ≈ 100%). Quinzenais/mensais derrubam o número — por
   isso a janela de 30 dias aparece ao lado. Validar com usuários se a
   leitura correta não seria "booking **criado** em até 7 dias"; a função
   pura recebe a janela como parâmetro, então a troca é barata.
4. **Ocupação >100% e atendimentos fora da grade** — profissionais que
   atendem fora da disponibilidade cadastrada inflam a taxa. Exibimos o valor
   real com badge; alternativa (cap a 100%) esconderia o problema de
   cadastro. Reavaliar com feedback.
5. **Fuso horário** — heatmap e dias da semana usam `scheduledAt` no fuso do
   servidor (UTC na Vercel) vs. clínica (America/Sao_Paulo, UTC−3 fixo).
   Decisão: converter com offset fixo −3h nas funções puras (parâmetro
   `tzOffsetMinutes` default −180), igual à premissa adotada nos demais
   planos. Sem DST no Brasil desde 2019.
6. **`referralSource` retroativo** — relatório de origens só fica útil com o
   tempo; "Não informado" dominará no início. Possível follow-up: ação em
   massa "definir origem" na lista de pacientes.
7. **Privacidade entre profissionais** — own-scope esconde receita de
   colegas, mas a lista "sem retorno" da Retenção expõe pacientes de outros
   profissionais se não for filtrada; o fetcher de retenção **deve** aplicar o
   mesmo escopo (sessões atribuídas via `attendingProfessionalId ??
   professionalProfileId`) também na lista de dropped.
8. **PDF export** — fora desta versão (spec: "PDF summary export later").
   O CSV cobre o caso de reunião; PDF entra num follow-up junto com
   agendamento de envio por e-mail.
9. **Gating por plano SaaS** — não há limite por plano nesta versão; se o
   produto quiser usar relatórios como diferenciador de plano (comum nos
   concorrentes), adicionar checagem em `src/lib/subscription/limits` depois.
