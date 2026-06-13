import type { FormField } from "./types"

export interface SeedTemplate {
  name: string
  description: string
  fields: FormField[]
}

/**
 * pt-BR starter library. "Adicionar modelos prontos" copies these into the
 * clinic as drafts (the clinic reviews and publishes). Field ids are fixed and
 * unique within each template; conditions only reference earlier fields.
 */
export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    name: "Anamnese adulto",
    description: "Anamnese inicial para pacientes adultos.",
    fields: [
      { id: "f_ad_sec_ident", type: "section", label: "Identificação" },
      { id: "f_ad_nome", type: "short_text", label: "Nome completo", required: true },
      { id: "f_ad_nasc", type: "date", label: "Data de nascimento", required: true },
      { id: "f_ad_sec_queixa", type: "section", label: "Queixa principal" },
      { id: "f_ad_queixa", type: "long_text", label: "O que o(a) traz à terapia neste momento?", required: true },
      { id: "f_ad_sec_saude", type: "section", label: "Histórico de saúde" },
      { id: "f_ad_diag", type: "long_text", label: "Possui algum diagnóstico ou condição de saúde? Qual?" },
      { id: "f_ad_med_uso", type: "yes_no", label: "Faz uso de medicação atualmente?", required: true },
      {
        id: "f_ad_med_quais",
        type: "long_text",
        label: "Quais medicações e dosagens?",
        visibleWhen: { fieldId: "f_ad_med_uso", equals: true },
      },
      { id: "f_ad_sec_fam", type: "section", label: "Histórico familiar" },
      { id: "f_ad_fam", type: "long_text", label: "Histórico de saúde mental na família" },
      { id: "f_ad_sec_sono", type: "section", label: "Sono e rotina" },
      { id: "f_ad_sono", type: "single_choice", label: "Como avalia a qualidade do seu sono?", required: true, options: ["Boa", "Regular", "Ruim"] },
      { id: "f_ad_sofrimento", type: "scale_0_10", label: "Em uma escala de 0 a 10, qual o seu nível de sofrimento atual?", required: true },
    ],
  },
  {
    name: "Anamnese infantil",
    description: "Anamnese inicial preenchida pelo responsável da criança/adolescente.",
    fields: [
      { id: "f_in_sec_ident", type: "section", label: "Identificação" },
      { id: "f_in_resp", type: "short_text", label: "Nome do responsável que está preenchendo", required: true },
      { id: "f_in_sec_gest", type: "section", label: "Gestação e parto" },
      { id: "f_in_gest", type: "long_text", label: "Como foi a gestação e o parto?" },
      { id: "f_in_sec_dev", type: "section", label: "Desenvolvimento" },
      { id: "f_in_dev", type: "long_text", label: "Como foi o desenvolvimento (fala, marcha, controle dos esfíncteres)?" },
      { id: "f_in_sec_escola", type: "section", label: "Escola" },
      { id: "f_in_escola", type: "yes_no", label: "Frequenta a escola atualmente?", required: true },
      {
        id: "f_in_escola_obs",
        type: "long_text",
        label: "Como é o desempenho e a adaptação escolar?",
        visibleWhen: { fieldId: "f_in_escola", equals: true },
      },
      { id: "f_in_sec_rotina", type: "section", label: "Rotina" },
      { id: "f_in_rotina", type: "long_text", label: "Descreva a rotina diária da criança" },
      { id: "f_in_sec_comp", type: "section", label: "Comportamento" },
      { id: "f_in_comp", type: "long_text", label: "Quais comportamentos preocupam o responsável?" },
      { id: "f_in_sec_med", type: "section", label: "Histórico médico" },
      { id: "f_in_med", type: "long_text", label: "Histórico médico relevante (diagnósticos, medicações, acompanhamentos)" },
    ],
  },
  {
    name: "Termo de consentimento (LGPD)",
    description: "Termo de consentimento para tratamento de dados sensíveis de saúde.",
    fields: [
      {
        id: "f_lg_consent",
        type: "info_consent",
        label: "Consentimento para tratamento de dados (LGPD)",
        required: true,
        infoText:
          "De acordo com a Lei Geral de Proteção de Dados (LGPD), informamos que os dados aqui coletados são dados sensíveis de saúde e serão tratados exclusivamente para a finalidade do seu atendimento clínico, ficando acessíveis ao profissional responsável. Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento.",
      },
      { id: "f_lg_nome", type: "short_text", label: "Confirme seu nome completo", required: true },
      { id: "f_lg_data", type: "date", label: "Data de hoje", required: true },
    ],
  },
  {
    name: "Check-in pré-sessão",
    description: "Questionário rápido enviado antes da sessão.",
    fields: [
      { id: "f_ck_humor", type: "scale_0_10", label: "Como está o seu humor hoje (0 a 10)?", required: true },
      { id: "f_ck_novidade", type: "long_text", label: "Aconteceu algo importante desde a última sessão?" },
      { id: "f_ck_med", type: "yes_no", label: "Houve mudança na sua medicação?", required: true },
    ],
  },
]
