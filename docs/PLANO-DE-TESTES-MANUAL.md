# Plano de Testes Manual — Funcionalidades de Mercado

Branch: `market-features` · Ambiente: `http://localhost:3000` (worktree `clinica-market-features`)

Este plano cobre as 15 funcionalidades implementadas (Grupos 1 a 6) e as correções de
interface. Cada teste traz o caminho de menu, os cliques e o **resultado esperado**.

> **Dica:** sempre que abrir o sistema, faça **recarga forçada** do navegador
> (**⌘⇧R** no Mac / **Ctrl+Shift+R** no Windows) para garantir que está vendo a versão
> mais recente, e não uma página em cache.

---

## 0. Pré-requisitos

### 0.1 Contas de acesso
| Perfil | Como entrar | Usado para |
|--------|-------------|-----------|
| **ADMIN** | `admin@x.com` / `Test1234!` (base de teste) | Maioria das telas, configurações, financeiro, fiscal |
| **PROFISSIONAL** | uma conta de profissional da clínica | **Prontuário, IA, Escalas** (o ADMIN não vê o prontuário por sigilo profissional) |

> Para o Prontuário/IA/Escalas é obrigatório entrar como **PROFISSIONAL**. Se você não
> tiver a senha de um profissional, peça a um admin para redefini-la em **Profissionais**.

### 0.2 Configurações já habilitadas na base de teste
IA, Portal do Paciente, Agendamento Online, Teleconsulta (flag) e Armazenamento já estão
ligados no banco. Caso vá testar em outra clínica, habilite em **Configurações** (ver cada seção).

### 0.3 Clínica e URLs públicas
- Clínica de teste: **Elena Sabino Psicologia** — slug **`elena-sabino-psi`**
- Agendamento público: `http://localhost:3000/agendar/elena-sabino-psi`
- Portal do paciente: `http://localhost:3000/paciente/elena-sabino-psi`

### 0.4 Integrações que exigem credenciais/ambiente (não funcionam "ao vivo" sem configurar)
- **Teleconsulta**: precisa da variável `TELEHEALTH_JITSI_DOMAIN`. Sem ela, o botão aparece como *indisponível*.
- **Cobrança (Stripe Connect)**: precisa de chaves Stripe + onboarding da conta conectada.
- **Sincronização Google Agenda**: precisa de credenciais OAuth do Google por profissional.
- **WhatsApp**: provedor é *mock* — OTP do portal e mensagens caem no fallback de e-mail/log.

### 0.5 Como abrir Configurações
No rodapé do menu lateral, clique no seu **nome/avatar** → **Configurações**. As abas
relevantes são: **IA**, **Portal**, **Lista de espera**, **Fiscal**, **Documentos**,
**Prontuário**, **Armazenamento**, **Pagamentos**.

---

## 1. Grupo 1 — Núcleo Clínico

### 1.1 Prontuário Eletrônico — registrar e assinar uma evolução  *(entrar como PROFISSIONAL)*
1. Menu lateral → **Agenda**.
2. Clique em um agendamento do tipo **CONSULTA** já **Finalizado**.
3. No painel do agendamento, clique em **Registrar evolução**.
4. Você cai no editor em `/prontuario/<id>`. Selecione um **Modelo** (SOAP, DAP ou Livre).
5. Preencha as seções (ex.: *Dados*, *Avaliação*, *Plano*). Aguarde ~2s e confira o aviso **"Salvo às HH:mm"** (autosave).
6. Clique em **Assinar** → confirme em **Assinar nota**.
7. **Esperado:** a nota fica com status **Assinada**, torna-se somente leitura, e correções só são possíveis via **adendo**.

### 1.2 Navegar/buscar/paginar o prontuário
1. Menu lateral → **Prontuário**.
2. Alterne os filtros **Pendentes / Rascunhos / Assinadas**.
3. Digite um nome no campo **"Buscar por nome do paciente"**.
4. Use a paginação no rodapé da lista.
5. **Esperado:** a lista filtra por status e por nome; a paginação mostra "Mostrando X–Y de N".

### 1.3 Exportar o prontuário em PDF
1. Menu lateral → **Pacientes** → clique no ícone **👁 (visualizar)** de um paciente.
2. Aba **Prontuário** → botão **Exportar PDF** (use os filtros De/Até se quiser um período).
3. **Esperado:** baixa um PDF com as evoluções **assinadas** em ordem cronológica (cabeçalho da clínica/paciente, seções, adendos, "assinado por", hash). Se não houver nota assinada, aparece um aviso.

### 1.4 IA para evoluções  *(PROFISSIONAL, IA habilitada)*
1. Abra/edite uma evolução em **rascunho** (passo 1.1, sem assinar).
2. No editor, localize o painel **Gerar com IA** (abaixo da linha "Formato").
3. Escreva alguns tópicos/rascunho (≥10 caracteres) e clique em **Gerar**.
4. **Esperado:** as seções são preenchidas com um rascunho marcado como gerado por IA; o contador de créditos diminui; editar uma seção remove a marca de IA. A nota **nunca** é assinada automaticamente.

### 1.5 Ajuda dos formatos (?)
1. No editor, na lista de **Modelo**, passe o mouse sobre o ícone **?** de cada modelo (SOAP/DAP/Livre).
2. **Esperado:** aparece a explicação do formato correspondente.

---

## 2. Grupo 2 — Agendamento & Autoatendimento

### 2.1 Configurar o agendamento online  *(ADMIN)*
1. **Configurações** → aba **Agenda** → clique em **Agendamento Online** (abre `/admin/settings/agendamento-online`).
2. Marque **Habilitar agendamento online**, escolha o **Modo de confirmação** (Aprovação manual / Confirmação automática), ajuste duração/antecedência/horizonte/modalidades e clique em **Salvar**.
3. Na seção **Profissionais** (mesma página), defina o **Link público** de cada profissional; configure também a **disponibilidade** do profissional (na agenda) se ainda não houver.
4. **Esperado:** configurações salvas; a URL pública exibida no topo (`…/agendar/elena-sabino-psi`) lista os profissionais com disponibilidade.

### 2.2 Agendar como paciente (público, sem login)
1. Abra `http://localhost:3000/agendar/elena-sabino-psi`.
2. Escolha um **profissional** → escolha um **horário** disponível → preencha **nome/telefone** → **Confirmar**.
3. **Esperado:** mensagem de solicitação recebida. Se o modo for "aprovação", fica pendente; se o telefone bater com um paciente existente e o modo for automático, confirma direto.

> Observação: só aparecem horários para profissionais com **disponibilidade** configurada.

### 2.3 Aprovar/recusar solicitação  *(ADMIN)*
1. Menu lateral → **Solicitações**.
2. Clique em uma solicitação → **Aprovar** (vincular a paciente existente **ou** criar novo) ou **Recusar**.
3. **Esperado:** ao aprovar, é criado o agendamento (e o paciente, se novo); o contador no menu diminui.

### 2.4 Portal do Paciente
1. Abra `http://localhost:3000/paciente/elena-sabino-psi`.
2. Informe o **telefone/CPF** do paciente → solicite o **código (OTP)**.
3. **Esperado:** como o WhatsApp é *mock*, o código é enviado por **e-mail** (ou aparece no log do servidor). Após entrar: vê próximas sessões, histórico, faturas (download de PDF), consentimentos e pode pedir reagendamento/alteração de dados.

### 2.5 Lista de Espera
1. Menu lateral → **Agenda** → **cancele** uma CONSULTA (status "Cancelado").
2. **Esperado:** abre a opção de oferecer o horário liberado a pacientes da lista de espera (diálogo de horários compatíveis). Configure a lista em **Configurações → Lista de espera**.

### 2.6 Sincronização Google Agenda / iCal
1. **Configurações** (ou perfil do profissional) → seção de **Sincronização de Agenda**.
2. **Esperado:** botão de conectar Google (exige credenciais OAuth — sem elas, apenas a UI). O **feed iCal** (URL .ics) pode ser copiado e aberto em outro calendário.

---

## 3. Grupo 3 — Fiscal & Cobrança

### 3.1 Receita Saúde (recibos PF)  *(ADMIN)*
1. Em **Profissionais**, configure ao menos um profissional com **Regime fiscal = Pessoa Física (Receita Saúde)** e **CPF**.
2. Menu lateral → **Financeiro** → aba **Receita Saúde**.
3. **Esperado:** lista os **pagamentos** dos profissionais **PF** sem recibo emitido. Selecione recibos de **um** profissional → **Gerar arquivo de lote** (baixa o TXT). Itens com pendências mostram o badge de bloqueio com link **Corrigir cadastro** (deve abrir o paciente em edição, sem 404).

### 3.2 DMED (declaração anual PJ)  *(ADMIN)*
1. Menu lateral → **Financeiro** → aba **DMED**.
2. Escolha o **ano** → veja o relatório de conferência por CPF do pagador → baixe **TXT** e **CSV**.
3. **Esperado:** agregação por pagador; arquivos de conferência gerados.

### 3.3 Cobrança Integrada (Stripe Connect)  *(ADMIN — exige Stripe)*
1. **Configurações** → aba **Pagamentos** → **conectar** a conta Stripe (onboarding).
2. Em uma **Fatura**, gere um **link de pagamento** (Pix/cartão).
3. **Esperado (com Stripe configurado):** link de pagamento; após pago, a fatura concilia automaticamente; a régua de cobrança envia lembretes. Sem chaves Stripe, apenas a UI/validação.

---

## 4. Grupo 4 — Documentos & Assinatura

### 4.1 Gerar documento CFP
1. Menu lateral → **Pacientes** → **👁 visualizar** um paciente → aba **Documentos**.
2. Clique em **Novo documento** → escolha o tipo (declaração, atestado, recibo de reembolso, etc.) → preencha os campos.
3. Se faltar dado obrigatório, aparece a **lista de pendências** com link **Corrigir** (abre o cadastro certo).
4. Clique em **Gerar** → **baixe o PDF** ou **envie** (e-mail/link).
5. **Esperado:** PDF com timbre da clínica; documento fica registrado (imutável) na aba Documentos.

### 4.2 Assinatura eletrônica de TCLE/contrato
1. Em um documento gerado (ou tipo TCLE), clique em **Enviar para assinatura**.
2. Informe **signatário(s)** (nome + CPF) → enviar.
3. Abra o **link público de assinatura** (`/assinar/<token>`) → identifique-se → receba o **OTP** (e-mail) → **assinar**.
4. Verifique em `http://localhost:3000/verificar/<código>`.
5. **Esperado:** PDF final com **página de evidências** (IP, data/hora, hash); consentimentos LGPD do paciente sincronizados; verificação pública confirma autenticidade.

---

## 5. Grupo 5 — Sessões & Formulários

### 5.1 Teleconsulta  *(exige `TELEHEALTH_JITSI_DOMAIN`)*
1. Menu lateral → **Agenda** → crie/abra uma **CONSULTA** do tipo **Online**.
2. Confirme em **Configurações → Agenda** que a teleconsulta está habilitada.
3. No cartão do agendamento, clique em **Teleconsulta** (profissional) — o paciente recebe um **link** no lembrete (`/teleconsulta/<token>`).
4. **Esperado (com domínio Jitsi configurado):** abre a sala de vídeo; o link do paciente só funciona na janela permitida e é invalidado se a sessão for cancelada. Sem o domínio, o botão fica *indisponível*.

### 5.2 Construtor de Anamnese / Formulários
1. Menu lateral → **Formulários** → **Novo formulário** → arraste campos (dnd) → **Publicar**.
2. Em um paciente, aba **Formulários** → **Enviar formulário** (gera link público).
3. Abra o link público `/f/<token>` → preencha → **Enviar respostas**.
4. **Esperado:** a página pública fica centralizada e alinhada; ao concluir, gera uma Tarefa para o profissional, notifica por e-mail e a resposta aparece na aba Formulários do paciente.

### 5.3 Escalas Clínicas (PHQ-9 / GAD-7)  *(PROFISSIONAL)*
1. Menu lateral → **Pacientes** → **👁 visualizar** um paciente → aba **Escalas**.
2. Clique em **Enviar escala** → escolha a escala (PHQ-9/GAD-7) → enviar (link público `/escala/<token>`) **ou** preencher **em sessão**.
3. Preencha e envie a escala.
4. **Esperado:** pontuação calculada com a faixa de interpretação/risco; o histórico/trajetória de pontuação aparece na aba Escalas.

---

## 6. Grupo 6 — Anexos & Insights

### 6.1 Anexos do paciente
1. Menu lateral → **Pacientes** → **👁 visualizar** um paciente → aba **Anexos**.
2. **Arraste um arquivo** (ou clique para enviar) → escolha a **categoria** (exame, laudo, etc.).
3. Teste **buscar**, **pré-visualizar**, **baixar**, **editar** e **excluir** (lixeira) / **restaurar**.
4. **Esperado:** upload com validação de tamanho/tipo; medidor de armazenamento atualiza; download não expõe a URL bruta. Limite de cota em **Configurações → Armazenamento**.

### 6.2 Dashboard Operacional (Relatórios)  *(ADMIN)*
1. Menu lateral → **Relatórios**.
2. Ajuste o **período** e observe os indicadores: **ocupação**, **retenção**, **faltas/cancelamentos** e **desempenho por profissional**.
3. **Esperado:** métricas e gráficos consistentes; ADMIN vê toda a clínica, PROFISSIONAL vê apenas os próprios números.

---

## 7. Correções de interface a validar

### 7.1 Menu principal não some em /financeiro e /formularios
1. Vá em **Financeiro → Faturas** (e depois **Formulários**).
2. **Esperado:** o **menu lateral continua visível** em todas as páginas (antes ele sumia).

### 7.2 Abas do paciente
1. **Pacientes** → **👁 visualizar** um paciente.
2. **Esperado:** as 8 abas (Dados…Escalas) ficam em **uma única linha**, **mesma altura**, **sem barra de rolagem**.
3. Alterne entre **Dados**, **Documentos**, **Escalas**, etc.
4. **Esperado:** o **painel não muda de altura** ao trocar de aba (altura fixa, rolagem interna).

### 7.3 Outros
- **Autosave do prontuário**: digitar e ver "Salvo às HH:mm" sem erro 500.
- **Link "Corrigir cadastro"** (Receita Saúde): abre o paciente em edição, **sem 404**.
- **Formulário público** (`/f/<token>`): cabeçalho alinhado com os campos.

---

## Checklist resumido

- [ ] 1.1 Prontuário: registrar + assinar evolução (PROFISSIONAL)
- [ ] 1.2 Prontuário: buscar/filtrar/paginar
- [ ] 1.3 Prontuário: exportar PDF
- [ ] 1.4 IA: gerar rascunho de evolução
- [ ] 2.2 Agendamento online público
- [ ] 2.3 Aprovar solicitação
- [ ] 2.4 Portal do paciente (OTP por e-mail)
- [ ] 2.5 Lista de espera
- [ ] 3.1 Receita Saúde (lote)
- [ ] 3.2 DMED (conferência)
- [ ] 4.1 Documento CFP (PDF)
- [ ] 4.2 Assinatura eletrônica + verificação
- [ ] 5.1 Teleconsulta (se Jitsi configurado)
- [ ] 5.2 Formulário/anamnese (público)
- [ ] 5.3 Escalas PHQ-9/GAD-7
- [ ] 6.1 Anexos do paciente
- [ ] 6.2 Relatórios (dashboard)
- [ ] 7.x Correções de UI (menu, abas, autosave, links)
