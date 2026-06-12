# Plano de Features — Análise de Mercado (2026-06-11)

Gerado por um time de análise de negócio + arquitetura. Base: inventário do sistema atual + 108 achados de mercado (PsicoManager, PsicoPlanner, Vittude, iClinic, Amplimed, Feegow, Ninsaúde, SimplePractice, TherapyNotes, Jane App, Doctoralia, e regras CFP/LGPD/Receita Federal).

Cada plano é autocontido: contexto de negócio, especificação funcional (pt-BR), design técnico (schema Prisma, módulo de domínio, rotas, UI), plano de testes, etapas de implementação e riscos. Todos respeitam as convenções do `CLAUDE.md` (tenant scoping, `withFeatureAuth`, DDD em `src/lib/`, sem `useEffect` cru, migração offline via `prisma migrate diff`).

**Status:** planos prontos para revisão. A implementação (time de devs Opus 4.8 em worktrees isolados) acontece sob demanda, conforme sua escolha.

## Prioridade × Esforço

| # | Feature | Prioridade | Esforço | Schema? | Plano |
|---|---------|:----------:|:-------:|:-------:|-------|
| 001 | **Prontuário Eletrônico** (evoluções clínicas CFP) | 10 | XL | sim | [plano](./2026-06-11-001-feat-prontuario-eletronico-plan.md) |
| 002 | **Agendamento Online** (autoagendamento público) | 10 | XL | sim | [plano](./2026-06-11-002-feat-agendamento-online-plan.md) |
| 003 | **Área do Paciente** (portal/PWA) | 9 | XL | sim | [plano](./2026-06-11-003-feat-portal-do-paciente-plan.md) |
| 004 | **Receita Saúde + DMED** (pacote fiscal) | 9 | L | sim | [plano](./2026-06-11-004-feat-receita-saude-dmed-plan.md) |
| 005 | **IA para evoluções** (rascunho assistido) | 8 | L | sim | [plano](./2026-06-11-005-feat-ai-evolucao-plan.md) |
| 006 | **Cobrança integrada** (Pix/cartão, Stripe Connect, régua) | 8 | XL | sim | [plano](./2026-06-11-006-feat-cobranca-automatica-plan.md) |
| 007 | **Teleconsulta** (sala de vídeo integrada) | 8 | L | sim | [plano](./2026-06-11-007-feat-teleconsulta-plan.md) |
| 008 | **Construtor de Anamnese** (formulários do paciente) | 8 | XL | sim | [plano](./2026-06-11-008-feat-anamnese-form-builder-plan.md) |
| 009 | **Gerador de documentos CFP** (declarações, atestados, recibos) | 7 | L | sim | [plano](./2026-06-11-009-feat-gerador-documentos-cfp-plan.md) |
| 010 | **Assinatura eletrônica** (TCLE e contratos) | 7 | L | sim | [plano](./2026-06-11-010-feat-assinatura-digital-tcle-plan.md) |
| 011 | **Lista de espera** (oferta automática de horários) | 7 | L | sim | [plano](./2026-06-11-011-feat-lista-de-espera-plan.md) |
| 012 | **Escalas clínicas** (PHQ-9/GAD-7, monitoramento de resultados) | 7 | L | sim | [plano](./2026-06-11-012-feat-escalas-clinicas-plan.md) |
| 013 | **Anexos do paciente** (armazenamento de arquivos) | 6 | M | sim | [plano](./2026-06-11-013-feat-anexos-paciente-plan.md) |
| 014 | **Sincronização Google Agenda / iCal** | 6 | XL | sim | [plano](./2026-06-11-014-feat-google-calendar-sync-plan.md) |
| 015 | **Dashboard operacional** (ocupação, retenção, desempenho) | 6 | M | sim | [plano](./2026-06-11-015-feat-dashboard-operacional-plan.md) |

Esforço: **S** ≈ meio dia · **M** ≈ 1 dia · **L** ≈ 2-3 dias · **XL** ≈ semana+ / fasear.

## Notas de dependência e sequenciamento

- **001 Prontuário** é a fundação clínica. **005 IA** e **009 Documentos** consomem as seções estruturadas do prontuário — implementar 001 primeiro.
- **002 Agendamento online** cria o módulo `src/lib/booking/` reutilizado por **003 Portal**, **011 Lista de espera** e **014 Google sync**.
- **009 Documentos CFP** entrega a base (`GeneratedDocument`, enum `DocumentType`) que **010 Assinatura** estende. Implementar 009 antes de 010.
- **004 Receita Saúde**, **009 Documentos** e **010 Assinatura** compartilham o campo `ProfessionalProfile.cpf` (migração idempotente `ADD COLUMN IF NOT EXISTS`).
- Vários planos criam `src/lib/clinic/ownership.ts` (helper de validação de FK por clínica que ainda não existe). O primeiro a ser implementado cria; os demais reutilizam.
- Todos alteram schema → migrações devem ser mescladas em sequência (cada branch sai do mesmo `main`).

## Ganhos rápidos sugeridos (alto valor / menor esforço)

Se quiser começar pequeno: **004 Receita Saúde** (obrigação fiscal 2026), **007 Teleconsulta** (apenas 2 campos de schema), **013 Anexos** e **015 Dashboard** (esforço M) entregam valor sem o peso dos XL.
