---
title: Escalas clínicas e monitoramento de resultados (PHQ-9/GAD-7)
type: feat
status: planned
date: 2026-06-11
slug: escalas-clinicas
priority: 7
complexity: L
---

# feat: Escalas clínicas e monitoramento de resultados (PHQ-9/GAD-7)

> **Dependências de outros planos**: `prontuario-eletronico` (001) define a postura de RBAC
> para dados clínicos (ADMIN = NONE por default) e introduz `src/lib/clinic/ownership.ts` e
> `Patient.recordClosedAt`. Esta feature segue a mesma postura e **reusa** o helper de ownership
> (se 001 ainda não tiver sido implementado, o passo 2 deste plano cria o helper com o mesmo
> contrato). `anamnese-form-builder` (008) define o padrão de token armazenado
> (`tokenHash` = sha256 de token aleatório) para links públicos revogáveis — este plano usa o
> mesmo padrão, sem dependência de código.

## 1. Contexto de Negócio

### Problema

O acompanhamento psicoterapêutico no Brasil é quase sempre **qualitativo**: o paciente não vê
evidência objetiva do próprio progresso, e a clínica não tem dado quantitativo para reter
pacientes ("estou melhorando?"), embasar laudos/relatórios para convênio ou conversar com
empresas (saúde corporativa). O resultado é o principal driver de churn das clínicas:
**abandono silencioso** — o paciente "some" porque não percebe progresso.

*Measurement-based care* (cuidado baseado em medidas) resolve isso aplicando escalas validadas
em cadência regular, pontuando automaticamente e mostrando a trajetória de sintomas ao longo
do tempo. É o diferencial de marketing nº 1 do SimplePractice e está presente em Owl Practice,
TherapyNotes e Healthie — e **praticamente ausente** dos ERPs brasileiros de psicologia
(só a Corpora oferece "instrumentos clínicos"; PsicoPlanner tangencia). É uma aposta
"para onde o mercado vai", com barreira regulatória baixa quando se usa apenas instrumentos de
domínio público com versão validada em português brasileiro (PHQ-9 e GAD-7).

Benefício adicional crítico: **detecção de risco**. O item 9 do PHQ-9 (ideação de morte/
autoagressão) endossado dispara alerta imediato ao profissional responsável — algo que nenhuma
planilha ou formulário Google faz.

### Evidência de mercado / concorrentes

| Concorrente | O que oferece |
|---|---|
| SimplePractice | Measurement-based care como headline (PHQ-9, GAD-7 com envio automático e gráficos) |
| TherapyNotes | Outcome measures integrados às notas clínicas |
| Owl Practice / Healthie | Escalas agendadas + trajetórias no prontuário |
| Corpora (BR) | "Instrumentos clínicos" (aplicação, sem trajetória rica) |
| PsicoPlanner (BR) | Testes/escalas básicos |

### Usuários-alvo

| Persona | Uso |
|---|---|
| **PROFESSIONAL (psicólogo)** | Envia escalas ad hoc, agenda cadência, aplica em sessão, acompanha trajetória, recebe alertas de risco |
| **ADMIN (secretaria/gestor)** | **Não vê pontuações/respostas** (default NONE — dado clínico). Vê apenas metadados de envio (enviada/concluída) para apoio operacional; pode receber READ via override |
| **Paciente** | Responde a escala por link público mobile-first, sem login; vê mensagem de acolhimento ao final |

### Métricas de sucesso

- ≥ 30% dos pacientes ativos com ao menos 1 administração concluída em 90 dias após o launch.
- Taxa de conclusão de links enviados ≥ 60% (ENVIADA → CONCLUIDA antes de expirar).
- 100% das respostas de risco geram Todo + alerta por e-mail em < 1 minuto após a submissão.
- 0 acessos de conteúdo clínico (respostas/pontuações) por usuários sem permissão (auditado).
- Redução mensurável de churn de pacientes nas clínicas que adotam cadência (análise posterior).

---

## 2. Especificação Funcional

### 2.1 User stories

1. Como **psicólogo**, quero enviar o PHQ-9 ao meu paciente por link, para medir sintomas
   depressivos sem gastar tempo de sessão.
2. Como **psicólogo**, quero agendar o GAD-7 "a cada 4 semanas" ou "antes de cada sessão",
   para ter medição contínua sem ação manual.
3. Como **psicólogo**, quero ver um gráfico da pontuação ao longo do tempo com as faixas de
   severidade sombreadas, para mostrar progresso ao paciente e embasar decisões clínicas.
4. Como **psicólogo**, quero ser alertado imediatamente (Todo + e-mail) quando o paciente
   endossar o item de ideação do PHQ-9, para agir rápido.
5. Como **psicólogo**, quero aplicar a escala em sessão (eu preencho com o paciente), para
   pacientes sem canal digital consentido.
6. Como **paciente**, quero responder no celular, uma pergunta por tela, com barra de
   progresso, podendo continuar depois de onde parei.
7. Como **paciente** que endossou item de risco, quero ver uma mensagem de acolhimento com
   contatos de emergência (CVV 188).
8. Como **ADMIN**, quero ver se a escala foi enviada/respondida (sem ver pontuação), para
   apoiar a operação (reenvio, cobrança de resposta) — e configurar a mensagem de acolhimento
   da clínica.
9. Como **psicólogo**, quero exportar a trajetória em PDF para anexar a laudos e pedidos de
   reembolso.

### 2.2 Fluxos por papel

#### PROFESSIONAL — envio ad hoc
1. Página do paciente → aba **"Escalas"** → botão **"Enviar escala"**.
2. Dialog: escolhe a escala (PHQ-9 / GAD-7), canal (WhatsApp/E-mail — apenas canais com
   consentimento LGPD do paciente aparecem habilitados) → **"Enviar"**.
3. Sistema: cria `ScaleAdministration` (status `ENVIADA`, token válido por 7 dias), expira
   qualquer envio ativo anterior **da mesma escala** para o paciente (supersede), envia a
   mensagem com o link via serviço de notificações, registra auditoria.
4. Se o paciente não tem **nenhum** canal consentido, o botão de envio fica desabilitado com
   aviso "Paciente sem canal de contato consentido — aplique em sessão".

#### PROFESSIONAL — aplicação em sessão
1. Aba "Escalas" → **"Aplicar em sessão"** → dialog com a escala completa (todas as perguntas
   numa tela, otimizado para o profissional ditar/registrar).
2. Ao salvar: pontuação automática, administração criada já `CONCLUIDA` com
   `source = EM_SESSAO`. Item de risco endossado segue o mesmo pipeline de alerta (Todo +
   e-mail), exceto a tela de acolhimento (o profissional está presente).

#### PROFESSIONAL — agendamento (cadência)
1. Aba "Escalas" → seção **"Envios automáticos"** → **"Agendar"**.
2. Escolhe escala + cadência: **"A cada N semanas"** (N de 1 a 26) ou **"Antes de cada
   sessão"** (envia ~24h antes da próxima CONSULTA do paciente).
3. O cron diário processa os agendamentos ativos. Regras de pausa automática na seção 2.4.

#### Paciente — preenchimento público (mobile-first)
1. Recebe mensagem: "Olá {{patientName}}! {{professionalName}} pediu que você responda um
   breve questionário ({{scaleName}}). Leva menos de 3 minutos: {{link}}".
2. Abre `/escala/{token}`: tela de boas-vindas com nome da clínica, nome da escala,
   nº de perguntas e o enunciado-base ("Nas últimas 2 semanas...").
3. **Uma pergunta por tela**, opções como botões grandes, barra de progresso ("3 de 9"),
   botão "Voltar". Cada resposta é **autosalva** (retomável enquanto o token for válido).
4. Última resposta → submissão → pontuação no servidor → tela de conclusão:
   - Sem risco: "Obrigado! Suas respostas foram enviadas para {{professionalName}}."
   - Com risco: mensagem de acolhimento configurável da clínica (default com CVV 188 —
     seção 2.5). **Nunca** mostra pontuação/severidade ao paciente (interpretação é ato do
     profissional).
5. Link expirado: "Este link expirou. Peça um novo link para a clínica." Link já concluído:
   "Este questionário já foi respondido. Obrigado!".

#### ADMIN
- Aba "Escalas" do paciente mostra **somente metadados**: escala, status (Enviada/Concluída/
  Expirada), datas de envio/conclusão — sem pontuação, severidade, risco ou respostas — e um
  aviso: "Pontuações e respostas são dados clínicos visíveis apenas para profissionais
  autorizados."
- Pode **reenviar** link expirado? **Não** no v1 — reenvio é ação clínica (WRITE em
  `escalas`). ADMIN pode receber override `escalas = READ/WRITE` em `/admin/permissions`.
- Em **Configurações da clínica**: edita a "Mensagem de apoio em resposta de risco"
  (textarea, default pré-preenchido).

### 2.3 Telas

1. **Aba "Escalas" na página do paciente** (`PatientDetailsView` ganha 4ª aba):
   - Topo: botões "Enviar escala", "Aplicar em sessão", "Agendar envios" (visíveis com WRITE).
   - **Gráfico de trajetória** (recharts `LineChart`): uma linha por escala (seletor de escala
     quando houver mais de uma), eixo X datas `DD/MM`, eixo Y pontuação; `ReferenceArea`
     sombreadas por faixa de severidade com rótulo (ex.: "Moderado"); tooltip com data
     `DD/MM/YYYY`, pontuação e severidade.
   - **Tabela de administrações**: Data (`DD/MM/YYYY HH:mm`), Escala, Origem (Link/Em sessão),
     Status (chip), Pontuação, Severidade (chip colorido), ícone ⚠ quando `riskFlag`; ação
     "Reenviar link" para ENVIADA/EXPIRADA; clique abre detalhe item a item das respostas.
   - **Envios automáticos**: lista de agendamentos (escala, cadência em texto, status
     Ativo/Pausado + motivo), ações editar/pausar/excluir.
   - Estado vazio: "Nenhuma escala aplicada ainda. Envie a primeira para começar a acompanhar
     a evolução." Visão ADMIN (NONE): apenas a tabela de metadados + aviso.
2. **Página pública `/escala/[token]`**: mobile-first, sem header da aplicação, logo/nome da
   clínica, uma pergunta por tela (padrões visuais do fluxo público de intake
   `src/app/intake/[slug]`), barra de progresso, tela final.
3. **Dialogs** (na aba): `SendScaleDialog`, `InSessionFillDialog`, `ScheduleDialog`.
4. **Configurações da clínica**: novo campo "Mensagem de apoio (resposta de risco)".

### 2.4 Regras de negócio

1. **Instrumentos**: somente escalas de domínio público com versão pt-BR validada — **PHQ-9**
   e **GAD-7** no v1. BDI/BAI (licenciados pela Pearson) **fora de escopo** — não adicionar.
2. **Pontuação**: soma simples dos valores 0–3 (suporte a itens reversos existe no motor para
   escalas futuras; PHQ-9/GAD-7 não têm). Pontuação só é calculada com **todas** as respostas
   presentes; parciais ficam em `answers` sem `totalScore`.
3. **Severidade**: PHQ-9: 0–4 Mínimo, 5–9 Leve, 10–14 Moderado, 15–19 Moderadamente grave,
   20–27 Grave. GAD-7: 0–4 Mínima, 5–9 Leve, 10–14 Moderada, 15–21 Grave.
4. **Risco**: resposta > 0 no item 9 do PHQ-9 ⇒ `riskFlag = true` na administração; cria
   **Todo** para o profissional da administração (dia = hoje) com título
   "⚠ Resposta de risco — {{patientName}}"; envia **e-mail** `SCALE_RISK_ALERT` ao
   profissional (sem pontuação/conteúdo no corpo — sigilo; apenas "acesse o sistema");
   auditoria `scale.risk_flagged`. GAD-7 não tem item de risco.
5. **Supersede**: novo envio da mesma escala para o mesmo paciente expira o envio ativo
   anterior (`status = EXPIRADA`, `supersededById` apontando para o novo) — token antigo deixa
   de funcionar imediatamente (revogação real via `tokenHash`).
6. **Validade do token**: 7 dias (`expiresAt`). Respostas parciais são retomáveis enquanto
   válido. Cron marca ENVIADA vencidas como EXPIRADA. Reenvio gera token novo e reativa
   (volta a ENVIADA, novo `expiresAt`, respostas parciais preservadas).
7. **Cadência "a cada N semanas"**: cron envia quando `lastSentAt` é nulo ou
   `now - lastSentAt ≥ N semanas`. **"Antes de cada sessão"**: cron (diário) envia quando a
   próxima CONSULTA do paciente (status AGENDADO/CONFIRMADO, do profissional do agendamento
   **ou de qualquer profissional** — v1: qualquer CONSULTA do paciente) está na janela
   `(now, now + 36h]` e ainda não houve envio para aquele appointment (`appointmentId` na
   administração deduplica).
8. **Pausa automática de agendamentos**: sem nenhuma CONSULTA futura **e** (quando o campo
   existir, pós-prontuário) `recordClosedAt` definido ⇒ `active = false`,
   `pausedReason = "SEM_AGENDAMENTOS_FUTUROS"`. Paciente sem canal consentido ⇒ pausa com
   `pausedReason = "SEM_CANAL_CONSENTIDO"` (profissional reativa após obter consentimento ou
   aplica em sessão).
9. **Consentimento (LGPD)**: envio por WhatsApp exige `consentWhatsApp && phone`; por e-mail,
   `consentEmail && email` (mesma regra de `hasPatientConsent` dos lembretes).
10. **Sigilo (postura prontuário)**: respostas, pontuações, severidade e `riskFlag` são dados
    clínicos. Feature RBAC `escalas`: PROFESSIONAL default WRITE, ADMIN default **NONE**
    (override por usuário possível). PROFESSIONAL só acessa escalas de pacientes que trata
    (é `referenceProfessionalId` do paciente **ou** tem appointment com ele). Metadados
    (status/datas, sem pontuação) são visíveis a quem tem `patients ≥ READ`.
11. **Auditoria**: toda leitura de pontuações/respostas (`scale.viewed`), envio
    (`scale.sent`), reenvio (`scale.resent`), conclusão (`scale.completed`, userId nulo quando
    via link público), risco (`scale.risk_flagged`), agendamentos
    (`scale.schedule_created/updated/deleted`), PDF (`scale.pdf_exported`).
12. **Paciente nunca vê pontuação** — só agradecimento/acolhimento.
13. **Menores**: v1 mantém apenas escalas de autorrelato adulto; nenhum bloqueio por idade no
    v1, mas a UI exibe nota "Instrumento validado para adultos" no dialog de envio quando
    `birthDate` indica < 18 anos. Escalas infantis ficam para v2.
14. **WhatsApp**: o provider atual é mock (`whatsapp-mock`) — registra como SENT sem entrega
    real. A UI do dialog deixa o link visível/copiável ("Copiar link") para o profissional
    mandar manualmente, e o canal e-mail é o único com entrega real hoje.

### 2.5 Textos pt-BR (copy)

| Chave | Texto |
|---|---|
| Aba | `Escalas` |
| Botões | `Enviar escala` · `Aplicar em sessão` · `Agendar envios` · `Reenviar link` · `Copiar link` |
| Status | `Enviada` · `Concluída` · `Expirada` |
| Origem | `Link do paciente` · `Em sessão` |
| Cadência | `A cada {{n}} semanas` · `Antes de cada sessão` |
| Pausa | `Pausado — sem agendamentos futuros` · `Pausado — sem canal de contato consentido` |
| Convite (template `SCALE_INVITE`) | Assunto: `Questionário {{scaleName}} — {{clinicName}}` · Corpo: `Olá {{patientName}}! {{professionalName}} pediu que você responda um breve questionário ({{scaleName}}). Leva menos de 3 minutos e ajuda no acompanhamento do seu cuidado: {{scaleLink}}\n\nSe preferir, fale com a clínica. {{clinicName}}` |
| Alerta de risco (e-mail ao profissional) | Assunto: `⚠ Resposta de risco — {{patientName}}` · Corpo: `O paciente {{patientName}} endossou um item de risco no {{scaleName}} em {{date}} às {{time}}. Acesse o sistema para ver os detalhes e tomar as providências clínicas adequadas. Este alerta não substitui acompanhamento de emergência.` |
| Todo de risco | `⚠ Resposta de risco — {{patientName}}` |
| Conclusão (sem risco) | `Obrigado! Suas respostas foram enviadas para {{professionalName}}.` |
| Acolhimento default (com risco; configurável por clínica) | `Obrigado por responder. Algumas das suas respostas mostram que você pode estar passando por um momento difícil. Você não está sozinho(a): seu psicólogo verá suas respostas e falará com você. Se precisar de apoio imediato, ligue para o CVV — 188 (24 horas, gratuito) ou acesse cvv.org.br. Em emergência, ligue 192 (SAMU) ou procure o pronto-socorro mais próximo.` |
| Link expirado | `Este link expirou. Peça um novo link para a clínica.` |
| Já respondido | `Este questionário já foi respondido. Obrigado!` |
| Aviso ADMIN | `Pontuações e respostas são dados clínicos visíveis apenas para profissionais autorizados.` |
| Sem canal | `Paciente sem canal de contato consentido — aplique a escala em sessão.` |
| Estado vazio | `Nenhuma escala aplicada ainda. Envie a primeira para começar a acompanhar a evolução.` |
| Config. clínica | `Mensagem de apoio (resposta de risco)` |

### 2.6 Casos de borda

- **Resposta parcial + expiração**: parciais ficam salvas; reenvio reativa a mesma
  administração com token novo (não cria duplicata, preserva o que foi respondido).
- **Duplo envio da mesma escala**: supersede (regra 5). Envio de **escalas diferentes** pode
  coexistir (PHQ-9 e GAD-7 ativos simultaneamente).
- **Submissão dupla** (duplo clique / retry de rede): `POST` público é idempotente — se já
  `CONCLUIDA`, responde 200 com a mesma tela de conclusão, sem repontuar nem realertar.
- **Token de administração expirada usada via PATCH**: 410 Gone com a mensagem de expirado.
- **Paciente excluído**: cascade remove administrações e agendamentos (consistente com o
  restante do schema).
- **Profissional desligado** (`User.isActive = false`): cron pula agendamentos cujo
  profissional está inativo e pausa com `pausedReason = "PROFISSIONAL_INATIVO"`.
- **Duas clínicas, mesmo paciente (CPF)**: isolamento por `clinicId` em tudo; token é global
  e único, e o handler público resolve a clínica a partir da administração.
- **Risco em aplicação EM_SESSAO**: alerta dispara igual (Todo + e-mail) — sem tela de
  acolhimento.
- **Clinic.appointmentNotificationsEnabled = false**: não bloqueia `SCALE_INVITE` (envio é
  ação explícita do profissional ou de agendamento que ele criou — análogo ao e-mail de
  NFS-e). Ver decisão na seção 3.7.
- **Fuso horário**: janelas de cadência calculadas em UTC; cron roda 11:00 UTC (08:00 BRT) —
  desvio de minutos/horas é aceitável para cadência semanal/diária.
- **Gráfico com 1 ponto**: renderiza ponto único + bandas; tabela continua útil.

---

## 3. Design Técnico

### 3.1 Mudanças no Prisma schema (`prisma/schema.prisma`)

Novos enums:

```prisma
enum ScaleAdministrationSource {
  LINK_PACIENTE
  EM_SESSAO
}

enum ScaleAdministrationStatus {
  ENVIADA
  CONCLUIDA
  EXPIRADA
}

enum ScaleCadenceType {
  ANTES_DE_SESSAO
  A_CADA_N_SEMANAS
}
```

`NotificationType` ganha dois valores:

```prisma
enum NotificationType {
  // ... existentes ...
  SCALE_INVITE
  SCALE_RISK_ALERT
}
```

Novos models (ambos clinic-scoped):

```prisma
/// Uma aplicação de escala clínica (PHQ-9/GAD-7) para um paciente.
/// answers = { [itemId: string]: number } — parcial enquanto ENVIADA.
/// Pontuação/severidade/riskFlag são DADOS CLÍNICOS (RBAC feature "escalas").
model ScaleAdministration {
  id                    String                    @id @default(cuid())
  clinicId              String
  patientId             String
  professionalProfileId String // profissional responsável pela aplicação
  scheduleId            String? // agendamento que originou o envio (cron)
  appointmentId         String? // CONSULTA alvo (modo ANTES_DE_SESSAO) — dedup
  scaleCode             String // "PHQ9" | "GAD7" — validado contra o registry em código
  scaleVersion          Int    @default(1) // versão da definição no momento do envio
  source                ScaleAdministrationSource
  status                ScaleAdministrationStatus @default(ENVIADA)
  answers               Json                      @default("{}")
  totalScore            Int?
  severityLabel         String?
  riskFlag              Boolean                   @default(false)
  tokenHash             String?                   @unique // sha256 do token público; null em EM_SESSAO
  expiresAt             DateTime?
  sentAt                DateTime?
  startedAt             DateTime? // primeiro autosave do paciente
  completedAt           DateTime?
  supersededById        String? // id da administração que substituiu esta

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic              Clinic              @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patient             Patient             @relation(fields: [patientId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  schedule            ScaleSchedule?      @relation(fields: [scheduleId], references: [id], onDelete: SetNull)
  appointment         Appointment?        @relation(fields: [appointmentId], references: [id], onDelete: SetNull)

  @@index([clinicId])
  @@index([patientId, scaleCode, completedAt])
  @@index([clinicId, status])
  @@index([professionalProfileId])
  @@index([scheduleId])
  @@index([appointmentId])
  @@index([clinicId, riskFlag])
}

/// Cadência de envio automático de uma escala para um paciente.
model ScaleSchedule {
  id                    String           @id @default(cuid())
  clinicId              String
  patientId             String
  professionalProfileId String
  scaleCode             String
  cadenceType           ScaleCadenceType
  intervalWeeks         Int? // 1..26 — obrigatório em A_CADA_N_SEMANAS
  active                Boolean          @default(true)
  pausedReason          String? // SEM_AGENDAMENTOS_FUTUROS | SEM_CANAL_CONSENTIDO | PROFISSIONAL_INATIVO
  lastSentAt            DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  clinic              Clinic                @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patient             Patient               @relation(fields: [patientId], references: [id], onDelete: Cascade)
  professionalProfile ProfessionalProfile   @relation(fields: [professionalProfileId], references: [id], onDelete: Cascade)
  administrations     ScaleAdministration[]

  @@index([clinicId, active])
  @@index([patientId])
  @@index([professionalProfileId])
  // Unique parcial (patientId, scaleCode) WHERE active — só no SQL da migration
  // (Prisma DSL não expressa unique parcial; mesmo padrão do Todo).
}
```

Campos novos em models existentes:

```prisma
model Clinic {
  // ...
  scaleRiskMessage     String? // mensagem de acolhimento (default em código quando null)
  scaleAdministrations ScaleAdministration[]
  scaleSchedules       ScaleSchedule[]
}

model Patient {
  // ...
  scaleAdministrations ScaleAdministration[]
  scaleSchedules       ScaleSchedule[]
}

model ProfessionalProfile {
  // ...
  scaleAdministrations ScaleAdministration[]
  scaleSchedules       ScaleSchedule[]
}

model Appointment {
  // ...
  scaleAdministrations ScaleAdministration[]
}
```

**Decisão — sem tabela `ScaleDefinition`**: as definições (itens, opções, regras de
pontuação, faixas, itens de risco) vivem como **constantes TypeScript versionadas** em
`src/lib/scales/definitions/` — não em banco. Motivos: (a) instrumentos read-only de domínio
público, sem edição por clínica no v1; (b) type-safety total e funções de pontuação puras
testáveis sem mock; (c) zero seed/migração de conteúdo; (d) `scaleCode + scaleVersion` na
administração preserva interpretabilidade se um texto mudar (bump de versão). Se um dia
houver escalas customizadas por clínica, aí sim nasce a tabela (registrado em Riscos).

### 3.2 Migration SQL (autorada offline — NUNCA `prisma db push`/`migrate dev`)

Criar `prisma/migrations/<timestamp>_add_clinical_scales/migration.sql`:

```sql
-- Enums
CREATE TYPE "ScaleAdministrationSource" AS ENUM ('LINK_PACIENTE', 'EM_SESSAO');
CREATE TYPE "ScaleAdministrationStatus" AS ENUM ('ENVIADA', 'CONCLUIDA', 'EXPIRADA');
CREATE TYPE "ScaleCadenceType" AS ENUM ('ANTES_DE_SESSAO', 'A_CADA_N_SEMANAS');

-- NotificationType: novos valores (PG ≥ 12 permite em transação; uso só em
-- transações futuras, então é seguro dentro da migration)
ALTER TYPE "NotificationType" ADD VALUE 'SCALE_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'SCALE_RISK_ALERT';

-- Clinic
ALTER TABLE "Clinic" ADD COLUMN "scaleRiskMessage" TEXT;

-- Tabelas (colunas espelhando o schema acima), FKs com ON DELETE conforme schema,
-- índices declarados, e:
CREATE UNIQUE INDEX "ScaleAdministration_tokenHash_key"
  ON "ScaleAdministration"("tokenHash");
CREATE UNIQUE INDEX "ScaleSchedule_patient_scale_active_uniq"
  ON "ScaleSchedule"("patientId", "scaleCode") WHERE "active" = true;
```

> Atenção: `ALTER TYPE ... ADD VALUE` dentro de transação exige PostgreSQL ≥ 12 e o valor
> novo não pode ser **usado** na mesma transação — esta migration só adiciona, não usa.
> Neon (prod) e o Postgres do Docker local atendem. Se a versão local for < 12, dividir em
> duas migrations.

### 3.3 RBAC — novo feature `escalas`

`src/lib/rbac/types.ts`:
- `FEATURES`: adicionar `"escalas"`.
- `FEATURE_LABELS`: `escalas: "Escalas Clinicas"` (labels existentes não usam acento).

`src/lib/rbac/permissions.ts` (`ROLE_DEFAULTS`):
- `ADMIN: { ..., escalas: "NONE" }` ← postura prontuário (dado clínico).
- `PROFESSIONAL: { ..., escalas: "WRITE" }`.

Overrides via `UserPermission` (UI existente em `/admin/permissions`) permitem conceder
READ/WRITE a um ADMIN/diretor clínico. `resolvePermissions` já trata feature ausente como
NONE em sessões antigas.

**Escopo "tratante" para PROFESSIONAL** (decisão pura, no domínio):

```typescript
// src/lib/scales/access.ts
export interface ScaleAccessInput {
  viewerRole: "ADMIN" | "PROFESSIONAL"
  viewerEscalasAccess: "NONE" | "READ" | "WRITE"
  viewerProfessionalProfileId: string | null
  patientReferenceProfessionalId: string | null
  viewerHasAppointmentWithPatient: boolean
}
export function canViewScaleContent(input: ScaleAccessInput): boolean
// READ+ E (ADMIN com override OU PROFESSIONAL tratante:
//   referenceProfessionalId === viewerProfileId || viewerHasAppointmentWithPatient)
export function canManageScales(input: ScaleAccessInput): boolean // idem com WRITE
```

O handler calcula `viewerHasAppointmentWithPatient` com
`prisma.appointment.count({ where: { clinicId, patientId, professionalProfileId } }) > 0`.

### 3.4 Helper de ownership — `src/lib/clinic/ownership.ts`

Reusar o helper introduzido pelo plano `prontuario-eletronico` (`assertPatientInClinic`,
`OwnershipError` → rotas respondem **404**, nunca 403, para não vazar existência entre
tenants). Se aquele plano ainda não tiver sido implementado quando este começar, criar o
arquivo aqui com o mesmo contrato (subset):

```typescript
export class OwnershipError extends Error {}
export async function assertPatientInClinic(clinicId: string, patientId: string): Promise<void>
export async function assertScaleAdministrationInClinic(
  clinicId: string,
  administrationId: string
): Promise<{ id: string; patientId: string; professionalProfileId: string; status: ScaleAdministrationStatus; scaleCode: string }>
export async function assertScaleScheduleInClinic(
  clinicId: string,
  scheduleId: string
): Promise<{ id: string; patientId: string }>
```

Implementação: `findFirst({ where: { id, clinicId }, select })`; nulo ⇒ `OwnershipError`.

### 3.5 Módulo de domínio `src/lib/scales/` (funções puras + testes colocados)

```
src/lib/scales/
├── index.ts                 # barrel
├── types.ts                 # ScaleDefinition, ScaleItem, SeverityBand, AnswerMap, ScoreResult...
├── definitions/
│   ├── phq9.ts              # PHQ9_DEFINITION (itens pt-BR validados, bandas, riskItems: ["item9"])
│   ├── gad7.ts              # GAD7_DEFINITION
│   └── index.ts             # SCALE_DEFINITIONS registry, getScaleDefinition(code), listScales()
├── scoring.ts               # validação de respostas, completude, soma (+reversos), banda, risco
├── tokens.ts                # token aleatório + sha256 (padrão anamnese), TTL
├── schedule.ts              # decisões de cadência/pausa do cron (puras)
├── risk.ts                  # copy de risco: todo title, e-mail, mensagem de acolhimento
├── chart.ts                 # série temporal + áreas de banda p/ recharts (puro)
├── format.ts                # labels pt-BR (status, origem, cadência, severidade + cor de chip)
└── *.test.ts                # colocados (ver seção 4)
```

Assinaturas principais:

```typescript
// types.ts
export type ScaleCode = "PHQ9" | "GAD7"
export interface ScaleOption { value: number; label: string }
export interface ScaleItem { id: string; text: string; reverse?: boolean }
export interface SeverityBand { min: number; max: number; label: string; color: string }
export interface ScaleDefinition {
  code: ScaleCode
  version: number
  name: string            // "PHQ-9 — Questionário de Saúde do Paciente"
  shortName: string       // "PHQ-9"
  stem: string            // "Durante as últimas 2 semanas, com que frequência..."
  items: ScaleItem[]
  options: ScaleOption[]  // 0 Nenhuma vez · 1 Vários dias · 2 Mais da metade dos dias · 3 Quase todos os dias
  maxScore: number        // 27 | 21
  severityBands: SeverityBand[]
  riskItemIds: string[]   // PHQ9: ["item9"]; GAD7: []
}
export type AnswerMap = Record<string, number>
export interface ScoreResult {
  totalScore: number
  severityLabel: string
  riskFlag: boolean
  endorsedRiskItemIds: string[]
}

// definitions/index.ts
export const SCALE_DEFINITIONS: Readonly<Record<ScaleCode, ScaleDefinition>>
export function getScaleDefinition(code: string): ScaleDefinition // lança em código desconhecido
export function isScaleCode(code: string): code is ScaleCode
export function listScales(): Array<Pick<ScaleDefinition, "code" | "name" | "shortName">>

// scoring.ts
export function validateAnswers(def: ScaleDefinition, answers: unknown): AnswerMap
// chaves ⊆ item ids; valores ∈ options.values; lança ScaleValidationError
export function mergeAnswers(current: AnswerMap, patch: AnswerMap): AnswerMap
export function isComplete(def: ScaleDefinition, answers: AnswerMap): boolean
export function getProgress(def: ScaleDefinition, answers: AnswerMap): { answered: number; total: number; nextItemIndex: number }
export function scoreScale(def: ScaleDefinition, answers: AnswerMap): ScoreResult
// lança IncompleteAnswersError se !isComplete; aplica reverse (maxValue - v) quando item.reverse
export function getSeverityBand(def: ScaleDefinition, totalScore: number): SeverityBand
export function detectRisk(def: ScaleDefinition, answers: AnswerMap): { riskFlag: boolean; endorsedRiskItemIds: string[] }
// risco avaliável mesmo com respostas parciais (alerta cedo se item de risco já respondido > 0)

// tokens.ts
export const SCALE_TOKEN_TTL_DAYS = 7
export function generateScaleToken(): { token: string; tokenHash: string }
// token = randomBytes(32) base64url; tokenHash = sha256 hex (node:crypto)
export function hashScaleToken(token: string): string
export function computeExpiry(now: Date, ttlDays?: number): Date

// schedule.ts (decisões puras do cron)
export interface ScheduleDecisionInput {
  cadenceType: "ANTES_DE_SESSAO" | "A_CADA_N_SEMANAS"
  intervalWeeks: number | null
  lastSentAt: Date | null
  now: Date
  nextConsultaAt: Date | null            // próxima CONSULTA AGENDADO/CONFIRMADO
  alreadySentForAppointment: boolean     // dedup por appointmentId
  professionalIsActive: boolean
  hasConsentedChannel: boolean
  recordClosedAt: Date | null            // null até prontuário existir
}
export type ScheduleDecision =
  | { action: "SEND"; targetAppointment: boolean }
  | { action: "SKIP" }
  | { action: "PAUSE"; reason: "SEM_AGENDAMENTOS_FUTUROS" | "SEM_CANAL_CONSENTIDO" | "PROFISSIONAL_INATIVO" }
export function decideSchedule(input: ScheduleDecisionInput): ScheduleDecision
export const PRE_SESSION_WINDOW_HOURS = 36
export function isWithinPreSessionWindow(nextConsultaAt: Date, now: Date): boolean // (now, now+36h]
export function isCadenceDue(lastSentAt: Date | null, intervalWeeks: number, now: Date): boolean
export function describeCadence(cadenceType: string, intervalWeeks: number | null): string // pt-BR

// risk.ts
export const DEFAULT_RISK_PATIENT_MESSAGE: string // copy da seção 2.5 (contém "CVV" e "188")
export function resolveRiskPatientMessage(clinicMessage: string | null): string
export function buildRiskTodoTitle(patientName: string): string
export function buildRiskAlertEmail(input: { patientName: string; scaleShortName: string; completedAt: Date }): { subject: string; content: string }
// datas no corpo em pt-BR DD/MM/YYYY + HH:mm; SEM pontuação/respostas (sigilo)

// chart.ts
export interface TrajectoryPoint { date: Date; totalScore: number; severityLabel: string }
export function buildTrajectorySeries(
  administrations: Array<{ status: string; completedAt: Date | string | null; totalScore: number | null; severityLabel: string | null; scaleCode: string }>,
  scaleCode: ScaleCode
): TrajectoryPoint[] // só CONCLUIDA, ordenado por completedAt asc
export function buildSeverityAreas(def: ScaleDefinition): Array<{ y1: number; y2: number; label: string; color: string }>

// format.ts
export const STATUS_LABELS: Record<ScaleAdministrationStatusString, string>
export const SOURCE_LABELS: Record<ScaleAdministrationSourceString, string>
export const PAUSED_REASON_LABELS: Record<string, string>
export function severityChipColor(def: ScaleDefinition, label: string): string // tailwind classes
```

Conteúdo das definições (resumo — texto integral vai nos arquivos):

- **PHQ-9 v1** — stem "Durante as últimas 2 semanas, com que frequência você foi
  incomodado(a) por qualquer um dos problemas abaixo?"; itens `item1..item9` (1 Pouco
  interesse ou prazer em fazer as coisas; 2 Sentir-se "para baixo", deprimido(a) ou sem
  perspectiva; 3 Dificuldade para pegar no sono, permanecer dormindo ou dormir demais;
  4 Sentir-se cansado(a) ou com pouca energia; 5 Falta de apetite ou comer demais; 6
  Sentir-se mal consigo mesmo(a), um fracasso, ou que decepcionou a família; 7 Dificuldade
  de concentração; 8 Lentidão ou agitação percebível; 9 Pensamentos de que seria melhor
  estar morto(a) ou de se ferir); opções 0–3; bandas 0–4 Mínimo / 5–9 Leve / 10–14 Moderado /
  15–19 Moderadamente grave / 20–27 Grave; `riskItemIds: ["item9"]`.
- **GAD-7 v1** — mesmo stem/opções; itens `item1..item7` (nervosismo/tensão; não controlar
  preocupações; preocupação excessiva; dificuldade de relaxar; inquietação; irritabilidade;
  medo de algo horrível acontecer); bandas 0–4 Mínima / 5–9 Leve / 10–14 Moderada / 15–21
  Grave; sem itens de risco.

### 3.6 Rotas de API (adaptadores finos — `withFeatureAuth`, self-scoped por `clinicId`)

> `withFeatureAuth` **não** escopa por clínica: todo handler filtra `where: { clinicId:
> user.clinicId, ... }` e valida FKs do body via `src/lib/clinic/ownership.ts`. Erros
> `OwnershipError` ⇒ 404.

**Autenticadas:**

| Método/Rota | Auth | Descrição |
|---|---|---|
| `GET /api/patients/[id]/escalas` | `escalas ≥ READ` | Lista administrações (com `totalScore/severityLabel/riskFlag/answers`) + agendamentos + `listScales()`. Verifica `canViewScaleContent` (tratante). Audita `scale.viewed`. |
| `POST /api/patients/[id]/escalas/enviar` | `escalas ≥ WRITE` | Body zod `{ scaleCode, channel: "WHATSAPP"\|"EMAIL" }`. Consent check; supersede envio ativo da mesma escala; cria administração + token; notifica `SCALE_INVITE`; audita `scale.sent`. Responde `{ administration, link }` (link p/ "Copiar link"). |
| `POST /api/patients/[id]/escalas/em-sessao` | `escalas ≥ WRITE` | Body `{ scaleCode, answers }`. `validateAnswers` + `scoreScale`; cria CONCLUIDA `EM_SESSAO`; pipeline de risco se aplicável; audita `scale.completed`. |
| `GET/POST /api/patients/[id]/escalas/agendamentos` | `READ`/`WRITE` | POST body `{ scaleCode, cadenceType, intervalWeeks? }` (zod: `intervalWeeks` 1–26 obrigatório em `A_CADA_N_SEMANAS`). Unique parcial ativa ⇒ 409 "Já existe um envio automático ativo desta escala". |
| `PATCH/DELETE /api/patients/[id]/escalas/agendamentos/[scheduleId]` | `escalas ≥ WRITE` | PATCH `{ active?, intervalWeeks?, cadenceType? }` (reativar limpa `pausedReason`). Ownership do schedule + pertencimento ao patient da rota. |
| `POST /api/escalas/administracoes/[administracaoId]/reenviar` | `escalas ≥ WRITE` | Para ENVIADA/EXPIRADA: novo token, `status = ENVIADA`, novo `expiresAt`, reenvia notificação; audita `scale.resent`. |
| `GET /api/patients/[id]/escalas/metadata` | `patients ≥ READ` | **Sem** pontuação/respostas/risco: `{ scaleCode, shortName, status, sentAt, completedAt }[]`. É a visão do ADMIN com `escalas = NONE`. |
| `GET /api/patients/[id]/escalas/pdf?scaleCode=` | `escalas ≥ READ` | PDF (`@react-pdf/renderer`, já é dependência) com gráfico tabular da trajetória + tabela de administrações; audita `scale.pdf_exported`. |

Atualização existente: `GET/PATCH /api/clinic` (settings) passa a incluir
`scaleRiskMessage` (feature `clinic_settings`).

**Públicas** (`src/app/api/public/escalas/[token]/route.ts` — sem auth, com
`rate-limit` igual ao intake público; resolve por `hashScaleToken(token)` →
`findUnique({ where: { tokenHash } })`; **nunca** filtra por clinicId aqui — o token é o
segredo; tudo que a rota retorna deriva da administração encontrada):

| Método | Comportamento |
|---|---|
| `GET` | 404 token desconhecido; 410 + copy se `EXPIRADA`/`expiresAt < now`; 200 + `{ alreadyCompleted: true, message }` se CONCLUIDA; senão `{ scale: { name, stem, items, options }, savedAnswers, progress, clinicName, professionalName, patientFirstName }`. |
| `PATCH` | Autosave body `{ answers }` parcial → `validateAnswers` (subset) + `mergeAnswers`; seta `startedAt` no primeiro save; 410 se expirada. |
| `POST` | Submissão: exige `isComplete`; `scoreScale`; update `{ status: CONCLUIDA, totalScore, severityLabel, riskFlag, completedAt }`; se já CONCLUIDA ⇒ 200 idempotente. Em risco: cria Todo (dia = hoje, `professionalProfileId` da administração) + `createAndSendNotification` `SCALE_RISK_ALERT` (EMAIL ao `professionalProfile.user.email`) + audita `scale.risk_flagged` (userId null). Atualiza `ScaleSchedule.lastSentAt`? Não — `lastSentAt` é de envio, já setado. Resposta: `{ completed: true, riskEndorsed, message }` com a mensagem de acolhimento resolvida (`resolveRiskPatientMessage(clinic.scaleRiskMessage)`) quando `riskEndorsed`. |

Handlers ficam < 50 linhas de lógica inline: validação zod + ownership + chamadas ao domínio
+ Prisma. Lógica de supersede/envio extraída para `src/lib/scales/send.ts`? Não — envolve
Prisma; fica num **service fino** `src/app/api/patients/[id]/escalas/helpers.ts` se a rota
crescer, mantendo o domínio puro.

### 3.7 Notificações

- `NotificationType.SCALE_INVITE` e `SCALE_RISK_ALERT` (enum §3.1).
- `src/lib/notifications/notification-service.ts`: adicionar `SCALE_RISK_ALERT` a
  `ALWAYS_ENABLED_EMAIL_TYPES` (notificação interna de staff, como `INTAKE_FORM_SUBMITTED`).
  **Decisão**: `SCALE_INVITE` também entra em `ALWAYS_ENABLED_EMAIL_TYPES` — o gate
  `appointmentNotificationsEnabled` existe porque confirmação/lembrete são *outbound
  automáticos não-GA*; o convite de escala é **ação explícita** do profissional (ou de
  agendamento que ele criou), consent-gated no call site (regra 9) — análogo ao e-mail de
  NFS-e. Registrado em Riscos para revisão.
- `src/lib/notifications/templates.ts`: `DEFAULT_TEMPLATES` ganha entradas
  `SCALE_INVITE` × {WHATSAPP, EMAIL} com as variáveis `{{patientName}},
  {{professionalName}}, {{scaleName}}, {{scaleLink}}, {{clinicName}}` (copy §2.5).
  `SCALE_RISK_ALERT` **não** usa template de clínica (conteúdo fixo de `risk.ts`, sem dado
  clínico) — vai direto em `createAndSendNotification` com subject/content prontos.
- WhatsApp continua mock: o dialog mostra "Copiar link" sempre (regra 14).

### 3.8 Cron job — `/api/jobs/scale-sends`

`vercel.json`:

```json
{ "path": "/api/jobs/scale-sends", "schedule": "0 11 * * *" }
```

`src/app/api/jobs/scale-sends/route.ts` (mesmo padrão de `send-reminders`: `GET` com
`authorization: Bearer ${CRON_SECRET}`, loop por clínica ativa, contadores no response,
erros por clínica isolados):

1. **Expiração**: `updateMany` ENVIADA com `expiresAt < now` ⇒ EXPIRADA (global, por clínica).
2. Para cada `ScaleSchedule` ativa da clínica: monta `ScheduleDecisionInput` (próxima
   CONSULTA via `prisma.appointment.findFirst({ where: { clinicId, patientId, type:
   "CONSULTA", status: { in: ["AGENDADO", "CONFIRMADO"] }, scheduledAt: { gt: now } },
   orderBy: { scheduledAt: "asc" } })`; dedup `alreadySentForAppointment` via
   `scaleAdministration.findFirst({ where: { scheduleId, appointmentId } })`;
   `hasConsentedChannel` via `hasPatientConsent` reusado de `@/lib/jobs/send-reminders`;
   `recordClosedAt: null` até o prontuário existir — comentário TODO) e aplica
   `decideSchedule`:
   - `SEND` ⇒ mesma rotina de envio do ad hoc (supersede + token + notificação preferindo
     EMAIL quando ambos consentidos), com `scheduleId` (+ `appointmentId` no modo
     pré-sessão); atualiza `lastSentAt`.
   - `PAUSE` ⇒ `active = false, pausedReason`.
   - `SKIP` ⇒ nada.
3. `processPendingNotifications(50)` ao final (como em send-reminders).
4. **Nota nullable patient**: a query de CONSULTA filtra `type: "CONSULTA"`, e o acesso a
   dados do paciente parte do `schedule.patient` (sempre presente) — ainda assim, qualquer
   leitura de appointment usa `appointment.patientId` com optional chaining onde aplicável.

A lógica de orquestração com Prisma fica em `src/lib/jobs/scale-sends.ts` **somente** nas
partes puras (montagem de input, janelas) — espelhando `send-reminders.ts`; o route faz as
queries.

### 3.9 Auditoria (`createAuditLog` de `src/lib/rbac/audit.ts`)

| Ação | Quando | entityType/entityId |
|---|---|---|
| `scale.sent` / `scale.resent` | envio/reenvio (rota ou cron — cron com `userId: null`) | `ScaleAdministration` |
| `scale.viewed` | GET de conteúdo clínico (lista com pontuações, detalhe, PDF) | `Patient` (id do paciente) |
| `scale.completed` | submissão pública (`userId: null`) ou em-sessão | `ScaleAdministration` |
| `scale.risk_flagged` | riskFlag setado | `ScaleAdministration` |
| `scale.schedule_created/updated/deleted` | CRUD de agendamento | `ScaleSchedule` |
| `scale.pdf_exported` | export | `Patient` |

`src/lib/audit/field-labels` ganha labels para os novos campos exibidos no histórico, se a
UI de auditoria listar essas entidades (mínimo: labels de ação).

### 3.10 UI — páginas e componentes

**Novos** (feature-specific em `src/app/patients/components/escalas/`, cada arquivo < 200
linhas, sem `useEffect` cru — dados via fetch nas actions/handlers e estado derivado):

| Arquivo | Responsabilidade |
|---|---|
| `ScalesTab.tsx` | Orquestrador da aba: busca `GET .../escalas` (ou `/metadata` quando `escalas = NONE`), distribui para os filhos. Resetar por paciente via `key={patientId}`. |
| `TrajectoryChart.tsx` | recharts `LineChart` + `ReferenceArea` por banda (`buildTrajectorySeries`/`buildSeverityAreas`); seletor de escala; datas `DD/MM`. |
| `AdministrationsTable.tsx` | Tabela (§2.3) + chips (`format.ts`) + ações reenviar/copiar link/detalhe. |
| `AdministrationDetailDialog.tsx` | Respostas item a item de uma administração CONCLUIDA. |
| `SendScaleDialog.tsx` | react-hook-form + zod; escolha de escala/canal; estados de consentimento; aviso "validado para adultos" se menor; pós-envio mostra "Copiar link". |
| `InSessionFillDialog.tsx` | Formulário completo da escala (react-hook-form + zod, valores 0–3 obrigatórios). |
| `ScheduleDialog.tsx` + `SchedulesList.tsx` | CRUD de envios automáticos, labels `describeCadence`/`PAUSED_REASON_LABELS`. |
| `ScaleMetadataList.tsx` | Visão ADMIN-NONE (metadados + aviso). |

**Página pública**: `src/app/escala/[token]/page.tsx` (server component que faz o GET) +
`scale-fill-form.tsx` (client: uma pergunta por tela, progresso, autosave via PATCH no
handler de resposta — *event handler, não effect*; estados expirado/concluído/acolhimento).
Reusa padrões visuais de `src/app/intake/[slug]`.

**Alterados**:
- `src/app/patients/components/PatientDetailsView.tsx`: `PatientTabKey` ganha `"escalas"`;
  novo botão de aba (ícone lucide `Activity` ou `LineChart`); render do `ScalesTab`.
  *Arquivo já é grande — adicionar apenas o wiring da aba; conteúdo todo nos novos
  componentes.*
- Página de configurações da clínica (settings): textarea "Mensagem de apoio (resposta de
  risco)" com placeholder = default.
- `/admin/permissions`: nenhum código — o feature novo aparece automaticamente via
  `FEATURES`/`FEATURE_LABELS`.

**PDF**: `src/lib/scales/pdf.tsx` (ou `src/app/api/patients/[id]/escalas/pdf/document.tsx`)
com `@react-pdf/renderer` — cabeçalho da clínica (logo se houver), paciente, escala,
tabela de administrações (data, pontuação, severidade) e gráfico simplificado (barras por
data via `View`s dimensionados — react-pdf não roda recharts). Datas `DD/MM/YYYY`.

### 3.11 Pontos de integração — resumo

| Integração | Mudança |
|---|---|
| RBAC | feature `escalas` (types + ROLE_DEFAULTS) |
| Notificações | 2 `NotificationType` novos; templates default `SCALE_INVITE`; `ALWAYS_ENABLED_EMAIL_TYPES` |
| Cron | `/api/jobs/scale-sends` + entrada no `vercel.json` |
| Todos | criação de Todo de risco (model existente — sem mudança de schema) |
| Auditoria | ações `scale.*` |
| Ownership | reuso/criação de `src/lib/clinic/ownership.ts` |
| Consent LGPD | reuso de `hasPatientConsent` (`src/lib/jobs/send-reminders.ts`) |
| Prontuário (futuro) | administrações CONCLUIDAS referenciáveis em notas clínicas; `recordClosedAt` na pausa automática (TODO marcado) |

---

## 4. Plano de Testes (vitest, colocados, `describe/it/expect` de "vitest")

> Enums Prisma em testes = string literals (`"ENVIADA"`, `"PHQ9"`). Time-dependent =
> `vi.useFakeTimers()` / `vi.useRealTimers()`.

| Arquivo | Comportamentos |
|---|---|
| `src/lib/scales/definitions/definitions.test.ts` | Integridade do registry: PHQ9 com 9 itens/max 27, GAD7 com 7 itens/max 21; opções 0..3; bandas contíguas cobrindo 0..maxScore sem buracos/sobreposição; `riskItemIds ⊆ items`; `getScaleDefinition` lança em código desconhecido; `isScaleCode`. |
| `src/lib/scales/scoring.test.ts` | `validateAnswers`: rejeita item desconhecido, valor fora do domínio, não-número; aceita subset. `isComplete`/`getProgress` (0, parcial, total; `nextItemIndex`). `scoreScale`: somas conhecidas (ex.: PHQ9 todos 1 ⇒ 9 "Leve"); limites de banda 4/5, 9/10, 14/15, 19/20, 27 (PHQ9) e 14/15, 21 (GAD7); lança `IncompleteAnswersError` em parcial; item reverso (definição sintética) inverte valor. `detectRisk`: item9 = 0 ⇒ false; 1..3 ⇒ true + ids; funciona com respostas parciais; GAD7 sempre false. |
| `src/lib/scales/tokens.test.ts` | token ≥ 43 chars url-safe; tokens distintos; `hashScaleToken(token) === tokenHash`; hex de 64 chars; `computeExpiry` = now + 7d (fake timers). |
| `src/lib/scales/schedule.test.ts` | `isCadenceDue` (null ⇒ true; exatamente N semanas; N-1 dia ⇒ false). `isWithinPreSessionWindow` (limites `(now, now+36h]`). `decideSchedule`: prioridade PAUSE > SEND (profissional inativo; sem canal; sem consulta futura + recordClosedAt setado ⇒ PAUSE; sem consulta futura mas recordClosedAt null ⇒ SKIP, não pausa); pré-sessão com `alreadySentForAppointment` ⇒ SKIP; cadência due + canal ok ⇒ SEND. `describeCadence` pt-BR. |
| `src/lib/scales/risk.test.ts` | `DEFAULT_RISK_PATIENT_MESSAGE` contém "CVV" e "188"; `resolveRiskPatientMessage` usa override quando não-vazio; `buildRiskTodoTitle` interpola nome; `buildRiskAlertEmail` tem data `DD/MM/YYYY` e hora `HH:mm` e **não** contém pontuação. |
| `src/lib/scales/chart.test.ts` | `buildTrajectorySeries`: filtra não-CONCLUIDA e outras escalas; ordena por `completedAt` asc; ignora `totalScore` nulo. `buildSeverityAreas` espelha as bandas. |
| `src/lib/scales/format.test.ts` | labels de status/origem/pausa; `severityChipColor` para cada banda das duas escalas. |
| `src/lib/scales/access.test.ts` | `canViewScaleContent`/`canManageScales`: ADMIN NONE ⇒ false; ADMIN com override READ ⇒ true; PROFESSIONAL WRITE tratante (referência ou appointment) ⇒ true; PROFESSIONAL não-tratante ⇒ false; READ não dá manage. |
| `src/lib/clinic/ownership.test.ts` | (se criado aqui) registro de outra clínica ⇒ `OwnershipError`; mesmo clinicId ⇒ retorna select. Prisma mockado com `vi.mock`. |
| `src/lib/rbac/permissions.test.ts` (existente — estender) | `escalas` presente em FEATURES; defaults ADMIN NONE / PROFESSIONAL WRITE; `resolvePermissions` com override. |

Rotas/cron não ganham testes de integração no v1 (padrão do projeto: domínio puro testado;
rotas são adaptadores finos). `npm run test` e `npm run build` como gates.

---

## 5. Etapas de Implementação (cada uma verificável isoladamente)

> Trabalhar em worktree isolado: `bash scripts/new-feature.sh escalas-clinicas`.
> **Nunca** `prisma db push`/`migrate dev`; migration SQL autorada offline.

1. **Schema + migration**: editar `prisma/schema.prisma` (§3.1); criar
   `prisma/migrations/<ts>_add_clinical_scales/migration.sql` (§3.2); `npx prisma generate`.
   ✔ Verifica: generate sem erros; `npx prisma migrate status` reconhece a migration;
   `npx prisma validate` ok.
2. **Ownership helper** (se ainda não existir do plano 001): `src/lib/clinic/ownership.ts`
   + `ownership.test.ts`. ✔ `npx vitest run src/lib/clinic/ownership.test.ts`.
3. **RBAC**: `escalas` em `types.ts`/`permissions.ts` + testes estendidos.
   ✔ `npx vitest run src/lib/rbac/permissions.test.ts`; `/admin/permissions` lista o feature.
4. **Domínio `src/lib/scales/`**: types, definitions (PHQ-9/GAD-7 completos), scoring,
   tokens, schedule, risk, chart, format, access, barrel — com todos os testes da seção 4.
   ✔ `npx vitest run src/lib/scales` verde; nenhum arquivo > 200 linhas.
5. **Notificações**: enum types no client gerado (já no passo 1), templates default
   `SCALE_INVITE`, `ALWAYS_ENABLED_EMAIL_TYPES` + testes de template existentes estendidos.
   ✔ `npx vitest run src/lib/notifications`.
6. **Rotas autenticadas** (§3.6): escalas do paciente (GET/enviar/em-sessao/agendamentos/
   reenviar/metadata) com ownership + auditoria; atualizar `/api/clinic` com
   `scaleRiskMessage`. ✔ `npm run build`; smoke manual via curl com sessão dev
   (lista vazia, envio cria administração ENVIADA com link).
7. **Rotas públicas + página de preenchimento**: `src/app/api/public/escalas/[token]` (GET/
   PATCH/POST com rate-limit) e `src/app/escala/[token]` (uma pergunta por tela, autosave,
   telas de expirado/concluído/acolhimento). ✔ fluxo completo no navegador com link do passo
   6: responder, fechar no meio, retomar, submeter; PHQ9 item9 > 0 mostra acolhimento.
8. **Pipeline de risco**: Todo + `SCALE_RISK_ALERT` + auditoria na submissão (pública e
   em-sessão). ✔ submeter com item9 = 2 ⇒ Todo aparece em /tarefas do profissional;
   Notification row criada; AuditLog `scale.risk_flagged`.
9. **Aba Escalas na UI** (§3.10): componentes novos + wiring no `PatientDetailsView` +
   visão metadados p/ ADMIN. ✔ navegação nas 4 abas; gráfico com bandas após ≥ 2
   administrações; ADMIN sem override não vê pontuações (verificar payload da rota também).
10. **Cron `scale-sends`**: route + `vercel.json` + (helpers puros já testados no passo 4).
    ✔ `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/jobs/scale-sends` com
    fixtures: cadência due envia; pré-sessão envia só na janela e deduplica; pausas corretas;
    ENVIADA vencida vira EXPIRADA.
11. **PDF + settings**: export da trajetória e campo `scaleRiskMessage` nas configurações.
    ✔ PDF abre com datas DD/MM/YYYY; mensagem customizada aparece na tela de acolhimento.
12. **Gates + commit**: `npx prisma generate && npm run test && npm run build` — tudo verde.
    Commit local na branch (sem push):
    `feat(escalas): escalas clínicas PHQ-9/GAD-7 com envio, pontuação, risco e trajetória`
    terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## 6. Riscos e Questões em Aberto

1. **Responsabilidade clínica**: a ferramenta não diagnostica nem substitui julgamento
   profissional; o alerta de risco é **assíncrono** (não é monitoramento de emergência).
   Copys do alerta e do acolhimento já dizem isso — validar com assessoria
   jurídica/CFP antes do launch (disclaimer também na tela do gráfico?).
2. **Licenciamento de instrumentos**: PHQ-9/GAD-7 (Pfizer/PRIME-MD) são de uso livre;
   BDI/BAI são licenciados (Pearson) e estão **explicitamente fora de escopo** — garantir
   que nenhum atalho os adicione. Conferir a redação pt-BR usada contra a versão validada
   publicada antes do launch.
3. **WhatsApp mock**: até existir provider real, entrega efetiva só por e-mail; o "Copiar
   link" mitiga. Risco de percepção ("enviei e não chegou") — UI deve sinalizar claramente o
   canal usado.
4. **Gate de notificações**: a decisão de colocar `SCALE_INVITE` em
   `ALWAYS_ENABLED_EMAIL_TYPES` (envio explícito ≠ outbound automático) precisa de aval do
   Marcus — alternativa é um flag por clínica `scaleNotificationsEnabled`.
5. **Dependência do prontuário (001)**: postura RBAC replicada aqui de forma independente;
   `recordClosedAt` entra na pausa automática só quando 001 estiver no schema (TODO no cron).
   Referenciar administrações em notas clínicas fica para quando 001 existir.
6. **Sem tabela `ScaleDefinition`** (desvio do spec original): definições em código (§3.1).
   Se surgir demanda de escalas customizadas por clínica, será preciso introduzir a tabela e
   migrar o registry — decisão registrada e reversível (administrações guardam
   `scaleCode + scaleVersion`).
7. **Menores de idade**: v1 só autorrelato adulto com aviso na UI; respondente responsável/
   escalas infantis (SDQ etc.) ficam para v2 — definir critério de bloqueio (hoje é só aviso).
8. **`ALTER TYPE ADD VALUE` em transação**: exige PG ≥ 12 (ok em Neon e Docker local
   atual); validar a versão local antes de aplicar; plano B na §3.2.
9. **LGPD**: respostas de escalas são dados sensíveis de saúde — mantidos no mesmo banco com
   acesso restrito por RBAC + auditoria; avaliar criptografia em repouso/coluna junto com o
   prontuário (mesma decisão de plataforma).
10. **Performance do gráfico**: recharts já é dependência; volume por paciente é pequeno
    (dezenas de pontos) — sem risco real; PDF usa render próprio (react-pdf não roda SVG da
    recharts) — manter o documento simples.
