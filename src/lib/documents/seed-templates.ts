import type { DocumentType } from "./types"

export interface SystemTemplate {
  name: string
  body: string
}

/**
 * The 8 system document templates (pt-BR, aligned with Res. CFP 06/2019).
 * These are read-only code constants — they are NEVER seeded per clinic.
 * A clinic that wants to customize a template creates a ClinicDocumentTemplate
 * (a copy) instead.
 *
 * NOTE: the redaction here is a best-effort starting point that should be
 * reviewed by a psychologist / legal before release (see plan §6.2). The
 * structure (which placeholders may appear) is what is enforceable.
 */
export const SYSTEM_TEMPLATES: Record<DocumentType, SystemTemplate> = {
  DECLARACAO_COMPARECIMENTO: {
    name: "Declaração de comparecimento",
    body: `DECLARAÇÃO DE COMPARECIMENTO

Declaro, para os devidos fins, que {{patientName}} compareceu a atendimento psicológico no dia {{appointmentDate}}, no horário de {{appointmentStartTime}} às {{appointmentEndTime}}.

{{clinicName}}, {{currentDate}}.

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  ATESTADO_PSICOLOGICO: {
    name: "Atestado psicológico",
    body: `ATESTADO PSICOLÓGICO

Atesto, para a finalidade de {{finalidade}}, que {{patientName}} encontra-se em acompanhamento psicológico.

{{periodoAfastamento}}

{{clinicName}}, {{currentDate}}.

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  RELATORIO_PSICOLOGICO: {
    name: "Relatório psicológico",
    body: `RELATÓRIO PSICOLÓGICO

1. IDENTIFICAÇÃO
{{identificacao}}

2. DEMANDA
{{demanda}}

3. PROCEDIMENTO
{{procedimento}}

4. ANÁLISE
{{analise}}

5. CONCLUSÃO
{{conclusao}}

{{clinicName}}, {{currentDate}}.

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  LAUDO_PSICOLOGICO: {
    name: "Laudo psicológico",
    body: `LAUDO PSICOLÓGICO

1. IDENTIFICAÇÃO
{{identificacao}}

2. DEMANDA
{{demanda}}

3. PROCEDIMENTO
{{procedimento}}

4. ANÁLISE
{{analise}}

5. CONCLUSÃO
{{conclusao}}

{{clinicName}}, {{currentDate}}.

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  PARECER_PSICOLOGICO: {
    name: "Parecer psicológico",
    body: `PARECER PSICOLÓGICO

1. IDENTIFICAÇÃO
{{identificacao}}

2. EXPOSIÇÃO DE MOTIVOS
{{exposicaoMotivos}}

3. ANÁLISE
{{analise}}

4. CONCLUSÃO
{{conclusao}}

{{clinicName}}, {{currentDate}}.

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  ENCAMINHAMENTO: {
    name: "Encaminhamento",
    body: `ENCAMINHAMENTO

A/C: {{destinatario}}

Encaminho {{patientName}} pelo seguinte motivo:

{{motivoEncaminhamento}}

Coloco-me à disposição para os esclarecimentos necessários.

{{clinicName}}, {{currentDate}}.

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  CONTRATO_TERAPEUTICO: {
    name: "Contrato terapêutico",
    body: `CONTRATO TERAPÊUTICO

Paciente: {{patientName}}
Responsável: {{guardianName}}

Pelo presente instrumento, ficam estabelecidos os termos do acompanhamento psicológico prestado por {{clinicName}}, observadas as normas do Código de Ética Profissional do Psicólogo.

{{clinicName}}, {{currentDate}}.

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}

____________________________________
{{guardianName}}`,
  },
  RECIBO_REEMBOLSO: {
    name: "Recibo para reembolso",
    body: `RECIBO PARA REEMBOLSO

Recebi de {{patientName}}, CPF {{patientCpf}}, referente a atendimentos psicológicos, os valores discriminados abaixo:

{{sessionList}}

Valor total: {{totalValue}}

{{tussCode}}

{{clinicName}}, {{currentDate}}.

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}
CPF/CNPJ: {{professionalCpfCnpj}}`,
  },
  TCLE: {
    name: "Termo de consentimento livre e esclarecido (TCLE)",
    body: `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO

Paciente: {{patientName}}

Declaro que fui devidamente esclarecido(a) sobre os objetivos, os métodos e a natureza do acompanhamento psicológico oferecido por {{clinicName}}, bem como sobre o sigilo profissional e seus limites legais, conforme o Código de Ética Profissional do Psicólogo.

Declaro estar ciente de que minha participação é voluntária e de que posso interromper o acompanhamento a qualquer momento, sem qualquer prejuízo.

Manifesto, de forma livre e esclarecida, meu consentimento para o início e a continuidade do acompanhamento psicológico, e concordo que a assinatura eletrônica deste documento, mediante código enviado ao meu contato cadastrado, é meio válido para registrar minha manifestação de vontade.

{{clinicName}}, {{currentDate}}.

____________________________________
{{patientName}}

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  CONSENTIMENTO_MENOR: {
    name: "Consentimento para atendimento de menor",
    body: `TERMO DE CONSENTIMENTO PARA ATENDIMENTO DE MENOR

Paciente (menor): {{patientName}}
Responsável legal: {{guardianName}}

Na qualidade de responsável legal pelo(a) paciente acima identificado(a), declaro que fui esclarecido(a) sobre os objetivos e a natureza do acompanhamento psicológico oferecido por {{clinicName}}, observado o Código de Ética Profissional do Psicólogo.

Autorizo, de forma livre e esclarecida, o início e a continuidade do acompanhamento psicológico do(a) menor sob minha responsabilidade, e concordo que a assinatura eletrônica deste documento é meio válido para registrar minha manifestação de vontade.

{{clinicName}}, {{currentDate}}.

____________________________________
{{guardianName}}
Responsável legal

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  CONSENTIMENTO_IMAGEM: {
    name: "Consentimento de uso de imagem",
    body: `TERMO DE CONSENTIMENTO DE USO DE IMAGEM

Paciente: {{patientName}}
Responsável (quando aplicável): {{guardianName}}

Autorizo, de forma livre e esclarecida, o uso de imagem (fotografia e/ou vídeo) no contexto exclusivo do acompanhamento psicológico prestado por {{clinicName}}, ciente de que tal material é protegido pelo sigilo profissional e pela Lei Geral de Proteção de Dados (LGPD).

Este consentimento pode ser revogado a qualquer momento, mediante comunicação à clínica. A assinatura eletrônica deste documento é meio válido para registrar minha manifestação de vontade.

{{clinicName}}, {{currentDate}}.

____________________________________
{{patientName}}

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  CONSENTIMENTO_GRAVACAO: {
    name: "Consentimento de gravação de sessão",
    body: `TERMO DE CONSENTIMENTO DE GRAVAÇÃO DE SESSÃO

Paciente: {{patientName}}
Responsável (quando aplicável): {{guardianName}}

Autorizo, de forma livre e esclarecida, a gravação (áudio e/ou vídeo) das sessões de acompanhamento psicológico prestado por {{clinicName}}, com a finalidade exclusiva de registro clínico, ciente de que tal material é protegido pelo sigilo profissional e pela Lei Geral de Proteção de Dados (LGPD).

Este consentimento pode ser revogado a qualquer momento, mediante comunicação à clínica. A assinatura eletrônica deste documento é meio válido para registrar minha manifestação de vontade.

{{clinicName}}, {{currentDate}}.

____________________________________
{{patientName}}

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
  TERMO_LGPD: {
    name: "Termo de proteção de dados (LGPD)",
    body: `TERMO DE PROTEÇÃO DE DADOS (LGPD)

Paciente: {{patientName}}
Responsável (quando aplicável): {{guardianName}}

Declaro que fui informado(a) sobre o tratamento dos meus dados pessoais e dados pessoais sensíveis de saúde por {{clinicName}}, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018), incluindo as finalidades, a base legal, o prazo de guarda e os meus direitos como titular.

Manifesto, de forma livre e esclarecida, meu consentimento para o tratamento desses dados no contexto do acompanhamento psicológico, ciente de que posso exercer meus direitos de titular a qualquer momento. A assinatura eletrônica deste documento é meio válido para registrar minha manifestação de vontade.

{{clinicName}}, {{currentDate}}.

____________________________________
{{patientName}}

____________________________________
{{professionalName}}
Psicólogo(a) — CRP {{crp}}`,
  },
}

export function getSystemTemplate(type: DocumentType): SystemTemplate {
  return SYSTEM_TEMPLATES[type]
}
