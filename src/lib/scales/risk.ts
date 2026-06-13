/**
 * Risk-response copy (pt-BR). The patient acolhimento message is configurable
 * per clinic; the professional alert email is fixed and carries NO clinical
 * content (score/answers) — only "acesse o sistema" — to preserve secrecy.
 */

/** Default patient acolhimento message (configurable per clinic). */
export const DEFAULT_RISK_PATIENT_MESSAGE =
  "Obrigado por responder. Algumas das suas respostas mostram que você pode estar " +
  "passando por um momento difícil. Você não está sozinho(a): seu psicólogo verá suas " +
  "respostas e falará com você. Se precisar de apoio imediato, ligue para o CVV — 188 " +
  "(24 horas, gratuito) ou acesse cvv.org.br. Em emergência, ligue 192 (SAMU) ou procure " +
  "o pronto-socorro mais próximo."

/** Returns the clinic override when non-empty, else the platform default. */
export function resolveRiskPatientMessage(clinicMessage: string | null): string {
  if (clinicMessage && clinicMessage.trim().length > 0) return clinicMessage
  return DEFAULT_RISK_PATIENT_MESSAGE
}

/** Title of the Todo created for the responsible professional. */
export function buildRiskTodoTitle(patientName: string): string {
  return `⚠ Resposta de risco — ${patientName}`
}

/**
 * Builds the professional risk-alert email. Dates render in pt-BR
 * (DD/MM/YYYY + HH:mm). Deliberately omits the score and answers.
 */
export function buildRiskAlertEmail(input: {
  patientName: string
  scaleShortName: string
  completedAt: Date
}): { subject: string; content: string } {
  const date = input.completedAt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
  const time = input.completedAt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
  return {
    subject: `⚠ Resposta de risco — ${input.patientName}`,
    content:
      `O paciente ${input.patientName} endossou um item de risco no ${input.scaleShortName} ` +
      `em ${date} às ${time}. Acesse o sistema para ver os detalhes e tomar as providências ` +
      `clínicas adequadas. Este alerta não substitui acompanhamento de emergência.`,
  }
}
