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
}

export function getSystemTemplate(type: DocumentType): SystemTemplate {
  return SYSTEM_TEMPLATES[type]
}
