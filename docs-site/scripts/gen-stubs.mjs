#!/usr/bin/env node
// Gerador one-shot dos stubs de conteudo a partir do sitemap (Secao 4 do plano).
// Cria: content/docs/index.mdx, content/docs/meta.json (ordem das secoes) e, por secao,
// uma pasta com meta.json (titulo pt-BR + ordem das paginas) e um .mdx por pagina do sitemap.
// Cada stub nasce com frontmatter COMPLETO e lastReviewedCommit carimbado no HEAD atual.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(__dirname, "..", "content", "docs");
const COMMIT = "1d93f26"; // git -C .. rev-parse HEAD (curto), forma estavel para o sitemap inicial.

// Escapa valor de string YAML simples (aspas duplas).
const yq = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

// Ordem das secoes da sidebar (raiz content/docs/meta.json).
const SECTION_ORDER = [
  "primeiros-passos",
  "configuracao",
  "agenda",
  "pacientes",
  "prontuario",
  "ia",
  "documentos",
  "financeiro",
  "fiscal",
  "notificacoes",
  "portal",
  "formularios",
  "grupos",
  "teleconsulta",
  "plataforma",
];

// Titulo pt-BR de cada secao (meta.json da pasta) + chave de feature default da secao.
const SECTIONS = {
  "primeiros-passos": { title: "Primeiros passos", feature: "onboarding-contas" },
  configuracao: { title: "Configuração inicial", feature: "configuracao-clinica" },
  agenda: { title: "Agenda e agendamentos", feature: "agendamento" },
  pacientes: { title: "Pacientes", feature: "pacientes" },
  prontuario: { title: "Prontuário", feature: "prontuario" },
  ia: { title: "Recursos de IA", feature: "ia" },
  documentos: { title: "Documentos e assinaturas", feature: "documentos" },
  financeiro: { title: "Financeiro e faturamento", feature: "financeiro" },
  fiscal: { title: "Fiscal (NFS-e, Receita Saúde, DMED)", feature: "fiscal" },
  notificacoes: { title: "Notificações e lembretes", feature: "notificacoes" },
  portal: { title: "Portal do paciente e agendamento online", feature: "portal-paciente" },
  formularios: { title: "Formulários e intake", feature: "formularios" },
  grupos: { title: "Grupos terapêuticos", feature: "grupos" },
  teleconsulta: { title: "Teleconsulta (telessaúde)", feature: "teleconsulta" },
  plataforma: { title: "Plataforma (Superadmin)", feature: "superadmin" },
};

// SITEMAP completo. Cada pagina: slug, title, audience, sources[], outline, isNew, feature(override).
// `feature` so e definido quando difere da feature default da secao (consistencia com o manifesto).
const PAGES = [
  // --- Primeiros passos ---
  { slug: "primeiros-passos/o-que-e-o-clinica", title: "O que é o Clinica", audience: "admin", sources: ["src/app/landing/**"], outline: "Visão geral do produto, módulos, modelo multi-tenant e para quem serve." },
  { slug: "primeiros-passos/criar-conta-da-clinica", title: "Criar a conta da clínica", audience: "admin", sources: ["src/app/signup/**", "src/app/api/public/signup/**"], outline: "Inscrição inicial em /signup: cria clínica, usuário ADMIN e perfil profissional." },
  { slug: "primeiros-passos/login-e-conta", title: "Entrar e acessar o sistema", audience: "admin", sources: ["src/app/login/**", "src/lib/auth.ts", "src/app/api/auth/**"], outline: "Login por credenciais, sessão multi-tenant, recuperação de acesso, logout." },
  { slug: "primeiros-passos/visao-geral-do-painel", title: "Visão geral do painel e navegação", audience: "profissional", sources: ["src/app/agenda/**", "src/app/hooks/**"], outline: "Tour do menu lateral/bottom nav, dashboard inicial e como abrir Configurações." },
  { slug: "primeiros-passos/papeis-e-permissoes", title: "Papéis e permissões (ADMIN x PROFISSIONAL)", audience: "admin", sources: ["src/lib/rbac/**"], outline: "Os dois papéis, escopo de acesso e por que ADMIN não vê prontuário." },

  // --- Configuração inicial ---
  { slug: "configuracao/dados-da-clinica", title: "Dados gerais da clínica", audience: "admin", sources: ["src/app/admin/settings/components/GeneralTab.tsx", "src/lib/clinic/**"], outline: "Nome, slug, contato, endereço, fuso horário e logo; link da ficha de cadastro." },
  { slug: "configuracao/usuarios-e-permissoes", title: "Usuários e permissões", audience: "admin", sources: ["src/app/users/**", "src/app/api/users/**", "src/lib/rbac/**"], outline: "Criar/editar/desativar usuários; overrides de permissão por usuário por feature. [NOVA: overrides por usuário]", isNew: true, feature: "onboarding-contas" },
  { slug: "configuracao/meu-perfil", title: "Meu perfil", audience: "profissional", sources: ["src/app/profile/**", "src/app/api/me/**"], outline: "Editar dados pessoais/profissionais, duração padrão de sessão e opt-out de IA.", feature: "onboarding-contas" },
  { slug: "configuracao/profissionais", title: "Cadastro de profissionais", audience: "admin", sources: ["src/app/professionals/**", "src/app/admin/settings/agendamento-online/components/ProfessionalBookingTable.tsx", "src/app/api/professionals/**"], outline: "Criar perfis, especialidade, registro, buffers, regime fiscal e settings de agendamento.", feature: "onboarding-contas" },
  { slug: "configuracao/disponibilidade", title: "Disponibilidade do profissional", audience: "profissional", sources: ["src/lib/professionals/availability.ts", "src/app/settings/**"], outline: "Regras semanais + exceções (férias/folgas) que alimentam slots de agendamento.", feature: "agendamento" },
  { slug: "configuracao/cores-da-agenda", title: "Cores da agenda", audience: "admin", sources: ["src/app/admin/settings/components/AgendaColorsTab.tsx", "src/lib/clinic/**"], outline: "Personalizar cores por tipo de evento; paletas e restaurar padrão." },
  { slug: "configuracao/configuracoes-financeiras", title: "Configurações financeiras", audience: "admin", sources: ["src/app/admin/settings/components/BillingTab.tsx", "src/lib/financeiro/invoice-template.ts"], outline: "Vencimento, modo de cobrança, agrupamento, imposto, template e dados de pagamento.", feature: "financeiro" },
  { slug: "configuracao/configuracoes-de-email", title: "Configurações de e-mail", audience: "admin", sources: ["src/app/admin/settings/components/EmailTab.tsx", "src/lib/notifications/**"], outline: "Remetente, endereço de envio (Resend), BCC e acesso aos templates.", feature: "notificacoes" },
  { slug: "configuracao/templates-de-notificacao", title: "Templates de notificação", audience: "admin", sources: ["src/app/admin/settings/notifications/**", "src/app/api/admin/notification-templates/**", "src/lib/notifications/templates.ts"], outline: "Personalizar mensagens WhatsApp/Email com variáveis, preview e restaurar.", feature: "notificacoes" },
  { slug: "configuracao/teleconsulta-config", title: "Habilitar teleconsulta", audience: "admin", sources: ["src/app/admin/settings/components/SchedulingTab.tsx", "src/lib/telehealth/**"], outline: "Flag por clínica; depende de TELEHEALTH_JITSI_DOMAIN no servidor.", isNew: true, feature: "configuracao-clinica" },
  { slug: "configuracao/armazenamento", title: "Armazenamento e cotas", audience: "admin", sources: ["src/app/admin/settings/components/StorageUsageCard.tsx", "src/lib/storage/**"], outline: "Monitorar uso/lixeira; restringir exames a profissionais; cota por plano.", isNew: true, feature: "anexos" },
  { slug: "configuracao/configuracoes-de-prontuario", title: "Configurações de prontuário", audience: "admin", sources: ["src/app/admin/settings/components/ProntuarioTab.tsx", "src/lib/prontuario/retention.ts"], outline: "Prazo de guarda, responsável por prontuários de inativos, mensagem de risco.", isNew: true, feature: "prontuario" },

  // --- Agenda e agendamentos ---
  { slug: "agenda/visao-geral-agenda", title: "Visão geral da agenda (diária e semanal)", audience: "profissional", sources: ["src/app/agenda/page.tsx", "src/app/agenda/weekly/**", "src/app/agenda/components/**"], outline: "Timeline diária, grade semanal, tipos de evento e seleção de profissional." },
  { slug: "agenda/criar-e-editar-agendamento", title: "Criar e editar agendamentos", audience: "profissional", sources: ["src/app/agenda/components/CreateAppointmentSheet.tsx", "src/app/agenda/components/AppointmentEditor.tsx", "src/app/api/appointments/**"], outline: "Criar por paciente/tipo/modalidade; editar horário, notas, preço; histórico." },
  { slug: "agenda/status-e-pendencias", title: "Status e pendências", audience: "profissional", sources: ["src/lib/appointments/status-transitions.ts", "src/app/agenda/pendencias/**", "src/app/agenda/components/CancelConfirmDialog.tsx"], outline: "Workflow AGENDADO→CONFIRMADO→FINALIZADO, cancelamentos e ações em massa." },
  { slug: "agenda/recorrencias", title: "Agendamentos recorrentes", audience: "profissional", sources: ["src/lib/appointments/recurrence.ts", "src/lib/appointments/recurrence-slots.ts", "src/lib/appointments/biweekly.ts", "src/app/agenda/recorrencias/**", "src/lib/jobs/extend-recurrences.ts"], outline: "Semanal/quinzenal/mensal, exceções e quinzenal com alternância de paciente.", isNew: true },
  { slug: "agenda/conflitos-e-arrastar-soltar", title: "Conflitos e arrastar-e-soltar", audience: "profissional", sources: ["src/lib/appointments/conflict-check.ts", "src/lib/appointments/drag-constraints.ts", "src/app/agenda/components/SlotMatchesDialog.tsx"], outline: "Detecção de conflito com buffers; reagendar por drag-and-drop com sugestões." },
  { slug: "agenda/tarefas", title: "Tarefas (TODOs do profissional)", audience: "profissional", sources: ["src/lib/todos/**", "src/app/agenda/components/todos/**", "src/app/tarefas/**"], outline: "Tarefas datadas sem paciente, recorrência e geração a partir de notas pendentes.", isNew: true },
  { slug: "agenda/imprimir-agenda", title: "Imprimir a agenda", audience: "recepcao", sources: ["src/app/agenda/components/AgendaPrintView.tsx", "src/app/agenda/components/DailyPrintGrid.tsx", "src/app/agenda/components/WeeklyPrintGrid.tsx"], outline: "Layouts de impressão diário/semanal e exportar para PDF." },
  { slug: "agenda/disponibilidade", title: "Disponibilidade que alimenta a agenda", audience: "profissional", sources: ["src/lib/professionals/availability.ts", "src/app/settings/**"], outline: "Como regras e exceções definem os slots livres na agenda e no agendamento online." },
  { slug: "agenda/lembretes-automaticos", title: "Lembretes automáticos de sessão", audience: "recepcao", sources: ["src/lib/jobs/send-reminders.ts", "src/lib/appointments/appointment-links.ts"], outline: "Lembretes em horários configuráveis com links HMAC de confirmar/cancelar.", isNew: true },
  { slug: "agenda/sincronizacao-google-ical", title: "Sincronizar com Google Agenda / iCal", audience: "profissional", sources: ["src/lib/calendar-sync/**", "src/app/api/calendar-sync/**", "src/app/profile/components/CalendarSyncSettings.tsx"], outline: "OAuth Google bidirecional e feed iCal público; tratamento de erros de sync.", isNew: true, feature: "calendar-sync" },

  // --- Pacientes ---
  { slug: "pacientes/cadastro-de-pacientes", title: "Cadastro e gestão de pacientes", audience: "recepcao", sources: ["src/app/patients/**", "src/app/api/patients/**", "src/lib/patients/**", "src/lib/phone/**"], outline: "Criar/editar/visualizar, múltiplos telefones, pagadores habituais e desativação." },
  { slug: "pacientes/consentimentos-e-lgpd", title: "Consentimentos e LGPD", audience: "recepcao", sources: ["src/app/patients/components/PatientDetailsView.tsx", "src/app/patients/components/PatientForm.tsx"], outline: "Status de consentimento WhatsApp/Email com datas, projeto terapêutico, referência." },
  { slug: "pacientes/historico-e-financeiro", title: "Histórico de atendimentos e taxa de sessão", audience: "profissional", sources: ["src/app/patients/components/AppointmentHistorySection.tsx", "src/app/patients/components/PatientFinanceTab.tsx"], outline: "Histórico paginado, taxa de sessão e profissional de referência." },
  { slug: "pacientes/abas-do-paciente", title: "Abas e deep-links do paciente", audience: "profissional", sources: ["src/app/patients/components/PatientDetailsView.tsx", "src/app/patients/page.tsx"], outline: "As 8 abas, deep-links ?id=&tab= e abas de página (Pacientes/Fichas/Solicitações).", isNew: true },
  { slug: "pacientes/anexos-do-paciente", title: "Anexos do paciente", audience: "profissional", sources: ["src/lib/patient-documents/**", "src/lib/storage/**", "src/app/patients/components/documents/**", "src/app/api/patients/[id]/documents/**"], outline: "Upload, categorizar, buscar, pré-visualizar, lixeira/restaurar e cota de armazenamento.", isNew: true, feature: "anexos" },
  { slug: "pacientes/solicitacoes-do-portal", title: "Solicitações do portal do paciente", audience: "recepcao", sources: ["src/lib/patient-portal/**", "src/app/patients/components/PortalRequestsTable.tsx", "src/app/api/public/portal/**"], outline: "Tratar pedidos de reagendamento, alteração de dados e export LGPD do portal.", isNew: true, feature: "portal-paciente" },

  // --- Prontuário ---
  { slug: "prontuario/prontuario-eletronico", title: "Prontuário eletrônico", audience: "profissional", sources: ["src/lib/prontuario/**", "src/app/prontuario/[id]/**", "src/app/api/prontuario/notes/**"], outline: "Registrar evolução (SOAP/DAP/Livre), autosave, assinar e tornar imutável.", isNew: true },
  { slug: "prontuario/busca-e-navegacao", title: "Buscar e navegar o prontuário", audience: "profissional", sources: ["src/app/prontuario/page.tsx", "src/app/prontuario/components/ProntuarioBrowser.tsx", "src/app/api/prontuario/notes/**", "src/app/api/prontuario/pending/**"], outline: "Filtrar por Pendentes/Rascunhos/Assinadas, buscar por nome e paginar.", isNew: true },
  { slug: "prontuario/exportar-pdf", title: "Exportar prontuário em PDF", audience: "profissional", sources: ["src/lib/prontuario/record-export.ts", "src/app/api/prontuario/record/[patientId]/pdf/**", "src/app/patients/components/prontuario/ProntuarioTab.tsx"], outline: "Exportar notas assinadas com cabeçalho, adendos, assinaturas e hash.", isNew: true },
  { slug: "prontuario/adendos", title: "Adendos (correções de nota assinada)", audience: "profissional", sources: ["src/lib/prontuario/immutability.ts", "src/app/prontuario/components/AddendumList.tsx", "src/app/api/prontuario/notes/[id]/addenda/**"], outline: "Adicionar correções imutáveis e datadas a notas já assinadas.", isNew: true },
  { slug: "prontuario/escalas-clinicas", title: "Escalas clínicas (PHQ-9 / GAD-7)", audience: "profissional", sources: ["src/lib/scales/**", "src/app/escala/**", "src/app/api/patients/[id]/escalas/**", "src/app/patients/components/escalas/**"], outline: "Enviar/preencher escalas, cálculo de score, faixa de risco e trajetória.", isNew: true, feature: "escalas" },

  // --- Recursos de IA ---
  { slug: "ia/assistente-de-evolucoes", title: "Assistente de IA para evoluções", audience: "profissional", sources: ["src/lib/ai/**", "src/app/api/ai/note-draft/**", "src/app/prontuario/components/ai/AiDraftPanel.tsx"], outline: "Gerar rascunho a partir de tópicos, pseudonimização, abordagem e contexto histórico.", isNew: true },
  { slug: "ia/creditos-e-feedback", title: "Créditos, feedback e revisão de IA", audience: "profissional", sources: ["src/app/prontuario/components/ai/AiCreditsBadge.tsx", "src/app/prontuario/components/ai/AiFeedbackButtons.tsx", "src/app/prontuario/components/ai/AiReviewBanner.tsx", "src/app/api/ai/usage/**"], outline: "Contador mensal de créditos, feedback 👍/👎 e banners de revisão CFP 11/2018.", isNew: true },
  { slug: "ia/configuracao-de-ia", title: "Configurar IA na clínica e opt-out", audience: "admin", sources: ["src/app/admin/settings/components/AiSettingsTab.tsx", "src/app/admin/settings/components/AiDisclosureDialog.tsx", "src/app/profile/page.tsx"], outline: "Habilitar IA, aceitar termos LGPD, contexto histórico e opt-out individual.", isNew: true },

  // --- Documentos e assinaturas ---
  { slug: "documentos/gerar-documentos-cfp", title: "Gerar documentos CFP", audience: "profissional", sources: ["src/lib/documents/**", "src/shared/components/documents/**", "src/app/api/documents/generate/**", "src/app/api/documents/preview/**", "src/app/patients/components/DocumentsTab.tsx"], outline: "Wizard de tipos CFP, merge de dados, preview, checklist de pendências e PDF.", isNew: true },
  { slug: "documentos/enviar-documentos", title: "Enviar documentos (e-mail/WhatsApp)", audience: "recepcao", sources: ["src/shared/components/documents/SendDocumentDialog.tsx", "src/app/api/documents/[id]/send/**", "src/app/api/documents/recibo-items/**"], outline: "Enviar por e-mail (anexo) ou WhatsApp (link HMAC 7 dias); recibos por período.", isNew: true },
  { slug: "documentos/templates-de-documentos", title: "Templates de documentos", audience: "admin", sources: ["src/app/admin/settings/components/DocumentTemplatesSection.tsx", "src/app/admin/settings/components/TemplateEditorSheet.tsx", "src/lib/documents/seed-templates.ts", "src/app/api/documents/templates/**"], outline: "Duplicar modelos do sistema, editar placeholders e restringir docs clínicos.", isNew: true },
  { slug: "documentos/assinatura-eletronica", title: "Assinatura eletrônica de TCLE/contratos", audience: "admin", sources: ["src/lib/assinaturas/**", "src/app/assinar/**", "src/app/api/assinaturas/**", "src/app/api/public/assinaturas/**", "src/lib/jobs/signature-reminders.ts"], outline: "Envelope OTP, trilha de evidências, ICP-Brasil opcional, sync LGPD, lembretes.", isNew: true, feature: "assinaturas" },
  { slug: "documentos/verificar-autenticidade", title: "Verificar autenticidade de documentos", audience: "paciente", sources: ["src/app/verificar/**", "src/lib/assinaturas/verification-code.ts", "src/app/api/public/assinaturas/verification/**"], outline: "Verificação pública por código, validação de hash SHA-256 e aviso CFP 09/2024.", isNew: true, feature: "assinaturas" },

  // --- Financeiro e faturamento ---
  { slug: "financeiro/dashboard-financeiro", title: "Dashboard financeiro", audience: "admin", sources: ["src/app/financeiro/page.tsx", "src/app/financeiro/components/**", "src/lib/financeiro/dashboard-aggregation.ts", "src/app/api/financeiro/dashboard/**"], outline: "Resumo, cobrança, atendimento e análise; filtros por período.", isNew: true },
  { slug: "financeiro/faturas", title: "Gerenciamento de faturas", audience: "admin", sources: ["src/app/financeiro/faturas/**", "src/lib/financeiro/generate-monthly-invoice.ts", "src/lib/financeiro/generate-per-session-invoices.ts", "src/app/api/financeiro/faturas/**"], outline: "Gerar/editar/cancelar, status, recalcular, enviar, PDF/ZIP e agrupamento.", isNew: true },
  { slug: "financeiro/creditos-de-sessao", title: "Créditos de sessão", audience: "admin", sources: ["src/app/financeiro/creditos/**", "src/lib/financeiro/credit-eligibility.ts", "src/app/api/financeiro/creditos/**"], outline: "Créditos de cancelamentos acordados, disponibilidade e consumo em faturas.", isNew: true },
  { slug: "financeiro/tabela-de-precos", title: "Tabela de preços", audience: "admin", sources: ["src/app/financeiro/precos/**", "src/lib/financeiro/billing-labels.ts"], outline: "Valores de sessão por paciente, edição em lote e modos de faturamento.", isNew: true },
  { slug: "financeiro/repasse", title: "Repasse a profissionais", audience: "admin", sources: ["src/app/financeiro/repasse/**", "src/lib/financeiro/repasse.ts", "src/app/api/financeiro/repasse/**"], outline: "Cálculo mensal, impostos, líquido, marcar pago e detalhamento por profissional.", isNew: true },
  { slug: "financeiro/cobranca-stripe", title: "Cobrança integrada (Stripe)", audience: "admin", sources: ["src/lib/cobranca/**", "src/app/financeiro/faturas/components/CobrarModal.tsx", "src/app/financeiro/faturas/components/ChargeHistory.tsx", "src/app/api/financeiro/faturas/[id]/cobranca/**"], outline: "Links Pix/cartão via Stripe Connect, régua de dunning e histórico de cobrança.", isNew: true },
  { slug: "financeiro/fluxo-de-caixa", title: "Fluxo de caixa", audience: "admin", sources: ["src/app/financeiro/fluxo-de-caixa/**", "src/lib/cashflow/**", "src/app/api/financeiro/cashflow/**"], outline: "Realizado x projetado, gráfico/tabela, granularidade e estimativa de impostos.", isNew: true },
  { slug: "financeiro/despesas", title: "Despesas e contas a pagar", audience: "admin", sources: ["src/app/financeiro/despesas/**", "src/lib/expenses/**", "src/app/api/financeiro/despesas/**"], outline: "Criar/categorizar/pagar despesas, categorias, recorrentes e import OFX/CSV.", isNew: true },
  { slug: "financeiro/conciliacao-bancaria", title: "Conciliação bancária e integração Inter", audience: "admin", sources: ["src/lib/bank-reconciliation/**", "src/lib/expense-matcher/**", "src/lib/bank-statement-parser/**", "src/app/financeiro/conciliacao/**", "src/app/financeiro/despesas/inter/**", "src/app/api/financeiro/conciliacao/**"], outline: "Importar transações, matching com faturas/Stripe, reembolsos e Inter.", isNew: true },
  { slug: "financeiro/relatorios-operacionais", title: "Relatórios e dashboard operacional", audience: "admin", sources: ["src/lib/analytics/**", "src/app/relatorios/**"], outline: "Ocupação, retenção, faltas e desempenho por profissional; escopo por papel.", isNew: true, feature: "relatorios" },

  // --- Fiscal ---
  { slug: "fiscal/configuracao-fiscal", title: "Configuração fiscal (NFS-e e DMED)", audience: "admin", sources: ["src/app/admin/settings/components/NfseConfigForm.tsx", "src/app/admin/settings/components/NfseConfigFields.tsx", "src/app/admin/settings/components/FiscalConfigTab.tsx", "src/lib/nfse/validation.ts", "src/app/api/admin/settings/nfse/**", "src/app/api/financeiro/fiscal/config/**"], outline: "Certificado A1, dados municipais, regime tributário, ISS e dados DMED/CNPJ.", isNew: true },
  { slug: "fiscal/nfse", title: "Emissão de NFS-e", audience: "admin", sources: ["src/lib/nfse/**", "src/app/financeiro/faturas/[id]/Nfse*", "src/app/financeiro/faturas/NfseEmitWrapper.tsx", "src/app/api/financeiro/faturas/[id]/nfse/**"], outline: "Emitir por fatura/item, DANFSE/XML, cancelar, e-mail, marcar externa, histórico, download em massa.", isNew: true },
  { slug: "fiscal/receita-saude", title: "Receita Saúde (recibos PF)", audience: "admin", sources: ["src/lib/fiscal/recibo-validation.ts", "src/lib/fiscal/recibo-file-builder.ts", "src/lib/fiscal/recibo-result-parser.ts", "src/app/financeiro/receita-saude/**", "src/app/api/financeiro/fiscal/receita-saude/**"], outline: "Lote TXT por profissional PF, bloqueadores com \"Corrigir cadastro\" e upload de retorno.", isNew: true },
  { slug: "fiscal/dmed", title: "DMED (declaração anual PJ)", audience: "admin", sources: ["src/lib/fiscal/dmed-aggregation.ts", "src/lib/fiscal/dmed-file-builder.ts", "src/lib/fiscal/dmed-csv.ts", "src/app/financeiro/dmed/**", "src/app/api/financeiro/fiscal/dmed/**"], outline: "Conferência por CPF do pagador por ano, divergências e download TXT/CSV.", isNew: true },

  // --- Notificações ---
  { slug: "notificacoes/notificacoes-e-lembretes", title: "Notificações e lembretes", audience: "admin", sources: ["src/lib/notifications/**", "src/app/api/jobs/send-reminders/**"], outline: "Canais (Resend/WhatsApp mock), tipos de notificação, retry, LGPD e gate por clínica." },

  // --- Portal do paciente ---
  { slug: "portal/agendamento-online", title: "Agendamento online público", audience: "paciente", sources: ["src/lib/booking/**", "src/app/agendar/**", "src/app/api/public/booking/**"], outline: "Fluxo público sem login: escolher profissional, slot e dados; auto-confirm ou aprovação.", isNew: true },
  { slug: "portal/configurar-agendamento-online", title: "Configurar agendamento online", audience: "admin", sources: ["src/app/admin/settings/agendamento-online/**", "src/app/api/clinic/booking-settings/**"], outline: "Modo de confirmação, duração, antecedência, modalidades, slugs e bloqueio de telefones.", isNew: true },
  { slug: "portal/portal-do-paciente", title: "Portal do paciente (área do paciente)", audience: "paciente", sources: ["src/lib/patient-portal/**", "src/app/paciente/**", "src/app/api/public/portal/**"], outline: "Login OTP, próximas sessões, histórico, faturas/recibos, dados e consentimentos.", isNew: true },
  { slug: "portal/solicitacoes-de-agendamento", title: "Aprovar solicitações de agendamento", audience: "recepcao", sources: ["src/app/agenda/solicitacoes/**", "src/app/api/public/booking/**", "src/app/api/admin/booking-requests/**"], outline: "Revisar pendentes, aprovar (vincular/criar paciente), recusar e reenviar.", isNew: true },
  { slug: "portal/lista-de-espera", title: "Lista de espera e ofertas automáticas", audience: "recepcao", sources: ["src/lib/waitlist/**", "src/app/espera/**", "src/app/oferta/**", "src/app/api/public/waitlist/**", "src/app/admin/settings/components/WaitlistTab.tsx"], outline: "Entradas, modo triagem/automático, estratégia, ofertas por link e aceite/recusa.", isNew: true, feature: "lista-espera" },

  // --- Formulários ---
  { slug: "formularios/construtor-de-formularios", title: "Construtor de formulários", audience: "profissional", sources: ["src/lib/forms/**", "src/app/formularios/**", "src/app/api/forms/templates/**"], outline: "Drag-and-drop, 10 tipos de campo, condicionais, validação, versionamento e biblioteca.", isNew: true },
  { slug: "formularios/enviar-e-responder", title: "Enviar e responder formulários", audience: "recepcao", sources: ["src/app/formularios/components/SendFormDialog.tsx", "src/app/f/**", "src/app/api/forms/responses/**", "src/app/api/public/forms/**", "src/lib/forms/completion.ts"], outline: "Enviar por canal, preenchimento público com progresso, status e visualização/PDF.", isNew: true },
  { slug: "formularios/fichas-de-cadastro", title: "Fichas de cadastro (intake público)", audience: "recepcao", sources: ["src/lib/intake/**", "src/app/intake/**", "src/app/api/public/intake/**", "src/app/api/intake-submissions/**", "src/app/patients/components/IntakeSubmission*"], outline: "Ficha pública, ViaCEP, aprovar/rejeitar virando paciente e envio automático de formulário.", isNew: true },

  // --- Grupos ---
  { slug: "grupos/grupos-terapeuticos", title: "Grupos terapêuticos", audience: "profissional", sources: ["src/lib/groups/**", "src/app/groups/**", "src/app/api/groups/**"], outline: "Criar/editar grupos, membros (entrada/saída), profissionais adicionais, desativar/encerrar." },
  { slug: "grupos/sessoes-de-grupo", title: "Sessões de grupo na agenda", audience: "profissional", sources: ["src/app/agenda/components/group-session/**", "src/app/agenda/components/GroupSessionSheet.tsx", "src/app/agenda/components/CreateGroupSessionSheet.tsx", "src/app/api/group-sessions/**"], outline: "Gerar/reagendar sessões, status por participante, evolução em massa e faturas agrupadas." },

  // --- Teleconsulta ---
  { slug: "teleconsulta/teleconsulta", title: "Iniciar teleconsulta (profissional)", audience: "profissional", sources: ["src/lib/telehealth/**", "src/app/agenda/components/Teleconsulta*", "src/shared/components/telehealth/**", "src/app/api/appointments/[id]/teleconsulta/**"], outline: "Sala Jitsi/mock, sessões de grupo online, link externo, janela de acesso e finalizar.", isNew: true },
  { slug: "teleconsulta/acesso-do-paciente", title: "Acesso do paciente à teleconsulta", audience: "paciente", sources: ["src/app/teleconsulta/**", "src/app/api/public/teleconsulta/**", "src/lib/telehealth/video-tokens.ts", "src/lib/telehealth/join-window.ts"], outline: "Link por token HMAC, pré-entrada LGPD, sala de espera, telas de erro e auditoria.", isNew: true },

  // --- Plataforma (Superadmin) ---
  { slug: "plataforma/superadmin", title: "Superadmin: clínicas e dashboard", audience: "operador-plataforma", sources: ["src/app/superadmin/**", "src/app/api/superadmin/**", "src/lib/superadmin-auth.ts", "src/lib/api/with-superadmin.ts"], outline: "Login JWT, métricas (MRR/trials), gestão de clínicas, detalhes e ações de assinatura." },
  { slug: "plataforma/planos-e-assinaturas", title: "Planos e assinaturas", audience: "operador-plataforma", sources: ["src/app/superadmin/plans/**", "src/app/api/superadmin/plans/**", "src/lib/subscription/**"], outline: "Criar/editar planos (limites, preço, créditos IA, portal, cota) e limites por plano." },
  { slug: "plataforma/monitoramento-de-ia", title: "Monitoramento de consumo de IA", audience: "operador-plataforma", sources: ["src/app/superadmin/components/AiUsageTable.tsx", "src/app/api/superadmin/ai-usage/**"], outline: "Consumo mensal por clínica (gerações, tokens, feedback) sem conteúdo clínico.", isNew: true },
];

function frontmatter(p) {
  const feature = p.feature || SECTIONS[p.slug.split("/")[0]].feature;
  const lines = [];
  lines.push("---");
  lines.push(`title: ${yq(p.title)}`);
  lines.push(`description: ${yq(p.outline.replace(/\s*\[NOVA[^\]]*\]\s*/g, " ").trim())}`);
  lines.push(`feature: ${feature}`);
  lines.push("sources:");
  for (const s of p.sources) lines.push(`  - ${yq(s)}`);
  lines.push(`lastReviewedCommit: ${COMMIT}`);
  lines.push(`audience: ${p.audience}`);
  lines.push(`status: draft`);
  if (p.isNew) lines.push("isNew: true");
  lines.push("---");
  return lines.join("\n");
}

function body(p) {
  const placeholder = p.isNew
    ? `Esta página documenta **${p.title}** (funcionalidade recém-lançada). Conteúdo em elaboração.`
    : `Esta página documenta **${p.title}**. Conteúdo em elaboração.`;
  // Outline preservado como comentario HTML para o escritor do corpo.
  const outline = `{/* OUTLINE (do sitemap): ${p.outline} */}`;
  return `${placeholder}\n\n${outline}\n`;
}

// --- Geracao ---
mkdirSync(DOCS_ROOT, { recursive: true });

// index.mdx da raiz
const indexFm = [
  "---",
  `title: ${yq("Documentação do Clinica")}`,
  `description: ${yq("Guia de uso do sistema de gestão de clínicas: agenda, prontuário, financeiro, fiscal e portal do paciente.")}`,
  "feature: onboarding-contas",
  "sources:",
  '  - "src/app/landing/**"',
  `lastReviewedCommit: ${COMMIT}`,
  "audience: admin",
  "status: draft",
  "---",
].join("\n");
writeFileSync(
  join(DOCS_ROOT, "index.mdx"),
  `${indexFm}\n\nBem-vindo à documentação do **Clinica**. Use o menu lateral ou a busca para navegar pelas áreas do sistema.\n\n{/* OUTLINE: pagina inicial das docs; aponta para Primeiros passos e Configuração inicial. */}\n`
);

// meta.json da raiz (ordem das secoes)
writeFileSync(
  join(DOCS_ROOT, "meta.json"),
  JSON.stringify({ root: true, pages: ["index", ...SECTION_ORDER] }, null, 2) + "\n"
);

// Agrupa paginas por secao preservando a ordem do sitemap.
const bySection = new Map();
for (const p of PAGES) {
  const section = p.slug.split("/")[0];
  if (!bySection.has(section)) bySection.set(section, []);
  bySection.get(section).push(p);
}

let count = 0;
for (const section of SECTION_ORDER) {
  const dir = join(DOCS_ROOT, section);
  mkdirSync(dir, { recursive: true });
  const pages = bySection.get(section) || [];
  // meta.json da secao
  writeFileSync(
    join(dir, "meta.json"),
    JSON.stringify(
      { title: SECTIONS[section].title, pages: pages.map((p) => p.slug.split("/")[1]) },
      null,
      2
    ) + "\n"
  );
  for (const p of pages) {
    const file = join(DOCS_ROOT, `${p.slug}.mdx`);
    writeFileSync(file, `${frontmatter(p)}\n\n${body(p)}`);
    count++;
  }
}

console.log(`Gerados ${count} stubs em ${SECTION_ORDER.length} secoes.`);
