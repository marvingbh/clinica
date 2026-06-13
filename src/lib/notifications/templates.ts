import { prisma } from "@/lib/prisma"
import {
  NotificationChannel,
  NotificationType,
  type NotificationTemplate,
} from "@prisma/client"

/**
 * Template variables that can be used in notification templates
 */
export interface TemplateVariables {
  patientName?: string
  professionalName?: string
  date?: string
  time?: string
  confirmLink?: string
  cancelLink?: string
  clinicName?: string
  modality?: string
  guardianName?: string
  childName?: string
  /** Optional rejection reason for ONLINE_BOOKING_REJECTED (may be empty). */
  reason?: string
  /** Link to the staff booking-requests inbox for ONLINE_BOOKING_RECEIVED. */
  requestsLink?: string
  /** Visitor phone for the staff ONLINE_BOOKING_RECEIVED notice. */
  phone?: string
  /** OTP code for PATIENT_PORTAL_OTP. */
  otpCode?: string
  /** Patient-portal deep link embedded in reminders. */
  portalLink?: string
  /** Public acceptance link for WAITLIST_OFFER. */
  offerUrl?: string
  /** Human-readable expiry (DD/MM HH:mm) for WAITLIST_OFFER. */
  expiresAt?: string
  /** Stable payment link for PAYMENT_LINK / PAYMENT_REMINDER. */
  paymentLink?: string
  /** Invoice open amount formatted as R$ (e.g. "R$ 300,00"). */
  invoiceAmount?: string
  /** Invoice due date (DD/MM/YYYY) for payment messages. */
  dueDate?: string
  /** Invoice reference month (MM/YYYY) for payment messages. */
  referenceMonth?: string
  /** Signer's name for signature notifications. */
  signerName?: string
  /** Title of the document sent for signature. */
  documentTitle?: string
  /** Public signing link (/assinar/{token}). */
  signingLink?: string
  /** OTP code for DOCUMENT_SIGNATURE_OTP. */
  code?: string
  /** Patient teleconsulta link (/teleconsulta/{token} or external meetingUrl). */
  videoLink?: string
  /** Name of the form/anamnese sent for completion. */
  formName?: string
  /** Public form-fill link (/f/{token}). */
  formLink?: string
  /** Human-readable expiry (DD/MM/YYYY) for the form link. */
  expiryDate?: string
}

/**
 * Available template variable names for UI display
 */
export const TEMPLATE_VARIABLES = [
  { key: "patientName", label: "Nome do Paciente", example: "João Silva" },
  { key: "professionalName", label: "Nome do Profissional", example: "Dra. Maria Santos" },
  { key: "date", label: "Data da Consulta", example: "15/02/2026" },
  { key: "time", label: "Horário da Consulta", example: "14:00" },
  { key: "confirmLink", label: "Link de Confirmação", example: "https://..." },
  { key: "cancelLink", label: "Link de Cancelamento", example: "https://..." },
  { key: "clinicName", label: "Nome da Clínica", example: "Clínica Exemplo" },
  { key: "modality", label: "Modalidade", example: "Presencial" },
  { key: "paymentLink", label: "Link de Pagamento", example: "https://..." },
  { key: "invoiceAmount", label: "Valor da Fatura", example: "R$ 300,00" },
  { key: "dueDate", label: "Vencimento", example: "15/06/2026" },
  { key: "referenceMonth", label: "Mês de Referência", example: "06/2026" },
  { key: "videoLink", label: "Link da Teleconsulta", example: "https://..." },
  { key: "formName", label: "Nome do Formulário", example: "Anamnese adulto" },
  { key: "formLink", label: "Link do Formulário", example: "https://..." },
  { key: "expiryDate", label: "Validade do Link", example: "26/06/2026" },
] as const

/**
 * Default templates for each notification type and channel
 */
export const DEFAULT_TEMPLATES: Array<{
  type: NotificationType
  channel: NotificationChannel
  name: string
  subject: string | null
  content: string
}> = [
  // APPOINTMENT_CONFIRMATION - WhatsApp
  {
    type: NotificationType.APPOINTMENT_CONFIRMATION,
    channel: NotificationChannel.WHATSAPP,
    name: "Confirmação de Agendamento (WhatsApp)",
    subject: null,
    content: `Olá, {{patientName}}! 👋

Sua consulta foi agendada com sucesso.

📅 Data: {{date}}
🕐 Horário: {{time}}
👤 Profissional: {{professionalName}}
📍 Modalidade: {{modality}}
💻 Teleconsulta — acesse no horário: {{videoLink}}

Para confirmar sua presença, clique aqui:
{{confirmLink}}

Caso precise cancelar, acesse:
{{cancelLink}}

Atenciosamente,
{{clinicName}}`,
  },
  // APPOINTMENT_CONFIRMATION - Email
  {
    type: NotificationType.APPOINTMENT_CONFIRMATION,
    channel: NotificationChannel.EMAIL,
    name: "Confirmação de Agendamento (Email)",
    subject: "Confirmação de Agendamento - {{clinicName}}",
    content: `Olá, {{patientName}}!

Sua consulta foi agendada com sucesso.

Data: {{date}}
Horário: {{time}}
Profissional: {{professionalName}}
Modalidade: {{modality}}
Teleconsulta — acesse no horário: {{videoLink}}

Para confirmar sua presença, clique no link abaixo:
{{confirmLink}}

Caso precise cancelar, acesse:
{{cancelLink}}

Atenciosamente,
{{clinicName}}`,
  },
  // APPOINTMENT_REMINDER - WhatsApp
  {
    type: NotificationType.APPOINTMENT_REMINDER,
    channel: NotificationChannel.WHATSAPP,
    name: "Lembrete de Consulta (WhatsApp)",
    subject: null,
    content: `Olá, {{patientName}}! 👋

Lembrete: você tem uma consulta agendada.

📅 Data: {{date}}
🕐 Horário: {{time}}
👤 Profissional: {{professionalName}}
📍 Modalidade: {{modality}}
💻 Teleconsulta — acesse no horário: {{videoLink}}

Confirme sua presença:
{{confirmLink}}

Precisa cancelar?
{{cancelLink}}

{{clinicName}}`,
  },
  // APPOINTMENT_REMINDER - Email
  {
    type: NotificationType.APPOINTMENT_REMINDER,
    channel: NotificationChannel.EMAIL,
    name: "Lembrete de Consulta (Email)",
    subject: "Lembrete de Consulta - {{clinicName}}",
    content: `Olá, {{patientName}}!

Este é um lembrete da sua consulta agendada.

Data: {{date}}
Horário: {{time}}
Profissional: {{professionalName}}
Modalidade: {{modality}}
Teleconsulta — acesse no horário: {{videoLink}}

Confirme sua presença:
{{confirmLink}}

Caso precise cancelar:
{{cancelLink}}

Atenciosamente,
{{clinicName}}`,
  },
  // APPOINTMENT_CANCELLATION - WhatsApp
  {
    type: NotificationType.APPOINTMENT_CANCELLATION,
    channel: NotificationChannel.WHATSAPP,
    name: "Cancelamento de Consulta (WhatsApp)",
    subject: null,
    content: `Olá, {{patientName}}.

Sua consulta do dia {{date}} às {{time}} com {{professionalName}} foi cancelada.

Para reagendar, entre em contato conosco.

{{clinicName}}`,
  },
  // APPOINTMENT_CANCELLATION - Email
  {
    type: NotificationType.APPOINTMENT_CANCELLATION,
    channel: NotificationChannel.EMAIL,
    name: "Cancelamento de Consulta (Email)",
    subject: "Consulta Cancelada - {{clinicName}}",
    content: `Olá, {{patientName}}.

Informamos que sua consulta foi cancelada.

Data: {{date}}
Horário: {{time}}
Profissional: {{professionalName}}

Para reagendar, entre em contato conosco.

Atenciosamente,
{{clinicName}}`,
  },
  // INTAKE_FORM_SUBMITTED - Email
  {
    type: NotificationType.INTAKE_FORM_SUBMITTED,
    channel: NotificationChannel.EMAIL,
    name: "Nova Ficha de Cadastro (Email)",
    subject: "Nova ficha de cadastro recebida - {{clinicName}}",
    content: `Uma nova ficha de cadastro foi preenchida por {{guardianName}} para {{childName}}.

Acesse o sistema para revisar e aprovar.

{{clinicName}}`,
  },
  // ONLINE_BOOKING_RECEIVED - Email (staff)
  {
    type: NotificationType.ONLINE_BOOKING_RECEIVED,
    channel: NotificationChannel.EMAIL,
    name: "Novo Agendamento Online (Email)",
    subject: "Novo agendamento online — {{patientName}}",
    content: `Um novo agendamento online foi solicitado.

Paciente/Contato: {{patientName}}
Telefone: {{phone}}
Profissional: {{professionalName}}
Data: {{date}}
Horário: {{time}}
Modalidade: {{modality}}

Acesse a caixa de solicitações para revisar:
{{requestsLink}}

{{clinicName}}`,
  },
  // ONLINE_BOOKING_REJECTED - WhatsApp (contact)
  {
    type: NotificationType.ONLINE_BOOKING_REJECTED,
    channel: NotificationChannel.WHATSAPP,
    name: "Agendamento Online Não Confirmado (WhatsApp)",
    subject: null,
    content: `Olá, {{patientName}}. Infelizmente não foi possível confirmar seu horário de {{date}} às {{time}}. {{reason}} Entre em contato com a {{clinicName}} para encontrarmos um novo horário.`,
  },
  // ONLINE_BOOKING_REJECTED - Email (contact)
  {
    type: NotificationType.ONLINE_BOOKING_REJECTED,
    channel: NotificationChannel.EMAIL,
    name: "Agendamento Online Não Confirmado (Email)",
    subject: "Sobre seu agendamento — {{clinicName}}",
    content: `Olá, {{patientName}}. Infelizmente não foi possível confirmar seu horário de {{date}} às {{time}}. {{reason}} Entre em contato com a {{clinicName}} para encontrarmos um novo horário.

Atenciosamente,
{{clinicName}}`,
  },
  // PATIENT_PORTAL_OTP - WhatsApp
  {
    type: NotificationType.PATIENT_PORTAL_OTP,
    channel: NotificationChannel.WHATSAPP,
    name: "Código de Acesso ao Portal (WhatsApp)",
    subject: null,
    content: `Seu código de acesso à área do paciente de {{clinicName}}: {{otpCode}}. Válido por 10 minutos.`,
  },
  // PATIENT_PORTAL_OTP - Email
  {
    type: NotificationType.PATIENT_PORTAL_OTP,
    channel: NotificationChannel.EMAIL,
    name: "Código de Acesso ao Portal (Email)",
    subject: "Seu código de acesso — {{clinicName}}",
    content: `Olá!

Seu código de acesso à área do paciente de {{clinicName}} é:

{{otpCode}}

Ele é válido por 10 minutos. Se você não solicitou este código, ignore esta mensagem.

Atenciosamente,
{{clinicName}}`,
  },
  // WAITLIST_OFFER - WhatsApp
  {
    type: NotificationType.WAITLIST_OFFER,
    channel: NotificationChannel.WHATSAPP,
    name: "Oferta de Horário (WhatsApp)",
    subject: null,
    content: `Olá {{patientName}}! Surgiu um horário com {{professionalName}} no dia {{date}} às {{time}} ({{modality}}). Para aceitar, acesse: {{offerUrl}}. Esta oferta é válida até {{expiresAt}}.`,
  },
  // WAITLIST_OFFER - Email
  {
    type: NotificationType.WAITLIST_OFFER,
    channel: NotificationChannel.EMAIL,
    name: "Oferta de Horário (Email)",
    subject: "Horário disponível — {{date}} às {{time}}",
    content: `Olá {{patientName}}!

Surgiu um horário com {{professionalName}} no dia {{date}} às {{time}} ({{modality}}).

Para aceitar, acesse:
{{offerUrl}}

Esta oferta é válida até {{expiresAt}}.

Atenciosamente,
{{clinicName}}`,
  },
  // WAITLIST_OFFER_EXPIRED - WhatsApp
  {
    type: NotificationType.WAITLIST_OFFER_EXPIRED,
    channel: NotificationChannel.WHATSAPP,
    name: "Horário Já Preenchido (WhatsApp)",
    subject: null,
    content: `O horário de {{date}} às {{time}} já foi preenchido. Você continua na nossa lista de espera e avisaremos na próxima oportunidade.

{{clinicName}}`,
  },
  // WAITLIST_OFFER_EXPIRED - Email
  {
    type: NotificationType.WAITLIST_OFFER_EXPIRED,
    channel: NotificationChannel.EMAIL,
    name: "Horário Já Preenchido (Email)",
    subject: "Atualização sobre seu horário — {{clinicName}}",
    content: `Olá {{patientName}}.

O horário de {{date}} às {{time}} já foi preenchido. Você continua na nossa lista de espera e avisaremos na próxima oportunidade.

Atenciosamente,
{{clinicName}}`,
  },
  // PAYMENT_LINK - WhatsApp
  {
    type: NotificationType.PAYMENT_LINK,
    channel: NotificationChannel.WHATSAPP,
    name: "Link de Cobrança (WhatsApp)",
    subject: null,
    content: `Olá, {{patientName}}! Segue o link para pagamento da sua fatura de {{referenceMonth}} no valor de {{invoiceAmount}} (vencimento {{dueDate}}): {{paymentLink}} — {{clinicName}}`,
  },
  // PAYMENT_LINK - Email
  {
    type: NotificationType.PAYMENT_LINK,
    channel: NotificationChannel.EMAIL,
    name: "Link de Cobrança (Email)",
    subject: "Link para pagamento da sua fatura — {{clinicName}}",
    content: `Olá, {{patientName}}!

Segue o link para pagamento da sua fatura de {{referenceMonth}}.

Valor: {{invoiceAmount}}
Vencimento: {{dueDate}}

Pague por Pix ou cartão:
{{paymentLink}}

Atenciosamente,
{{clinicName}}`,
  },
  // PAYMENT_REMINDER - WhatsApp
  {
    type: NotificationType.PAYMENT_REMINDER,
    channel: NotificationChannel.WHATSAPP,
    name: "Lembrete de Cobrança (WhatsApp)",
    subject: null,
    content: `Olá, {{patientName}}! Lembrete: sua fatura de {{invoiceAmount}} vence em {{dueDate}}. Pague por Pix ou cartão: {{paymentLink}} — {{clinicName}}`,
  },
  // PAYMENT_REMINDER - Email
  {
    type: NotificationType.PAYMENT_REMINDER,
    channel: NotificationChannel.EMAIL,
    name: "Lembrete de Cobrança (Email)",
    subject: "Lembrete: sua fatura vence em breve — {{clinicName}}",
    content: `Olá, {{patientName}}!

Lembrete: sua fatura de {{invoiceAmount}} vence em {{dueDate}}.

Pague por Pix ou cartão:
{{paymentLink}}

Atenciosamente,
{{clinicName}}`,
  },
  // DOCUMENT_SIGNATURE_REQUEST - WhatsApp
  {
    type: NotificationType.DOCUMENT_SIGNATURE_REQUEST,
    channel: NotificationChannel.WHATSAPP,
    name: "Documento para Assinatura (WhatsApp)",
    subject: null,
    content: `Olá, {{signerName}}! A {{clinicName}} enviou o documento "{{documentTitle}}" para sua assinatura eletrônica. Acesse: {{signingLink}} (válido até {{expiresAt}}).`,
  },
  // DOCUMENT_SIGNATURE_REQUEST - Email
  {
    type: NotificationType.DOCUMENT_SIGNATURE_REQUEST,
    channel: NotificationChannel.EMAIL,
    name: "Documento para Assinatura (Email)",
    subject: "Documento para assinatura — {{clinicName}}",
    content: `Olá, {{signerName}}!

A {{clinicName}} enviou o documento "{{documentTitle}}" para sua assinatura eletrônica.

Acesse o link abaixo para ler e assinar:
{{signingLink}}

O link é válido até {{expiresAt}}.

Atenciosamente,
{{clinicName}}`,
  },
  // DOCUMENT_SIGNATURE_OTP - WhatsApp
  {
    type: NotificationType.DOCUMENT_SIGNATURE_OTP,
    channel: NotificationChannel.WHATSAPP,
    name: "Código para Assinar (WhatsApp)",
    subject: null,
    content: `{{code}} é seu código para assinar "{{documentTitle}}" — {{clinicName}}. Válido por 10 minutos.`,
  },
  // DOCUMENT_SIGNATURE_OTP - Email
  {
    type: NotificationType.DOCUMENT_SIGNATURE_OTP,
    channel: NotificationChannel.EMAIL,
    name: "Código para Assinar (Email)",
    subject: "Seu código de assinatura — {{clinicName}}",
    content: `Olá!

{{code}} é o seu código para assinar o documento "{{documentTitle}}" da {{clinicName}}.

Ele é válido por 10 minutos. Se você não solicitou este código, ignore esta mensagem.

Atenciosamente,
{{clinicName}}`,
  },
  // DOCUMENT_SIGNATURE_REMINDER - WhatsApp
  {
    type: NotificationType.DOCUMENT_SIGNATURE_REMINDER,
    channel: NotificationChannel.WHATSAPP,
    name: "Lembrete de Assinatura (WhatsApp)",
    subject: null,
    content: `Lembrete: o documento "{{documentTitle}}" da {{clinicName}} aguarda sua assinatura. Acesse: {{signingLink}}`,
  },
  // DOCUMENT_SIGNATURE_REMINDER - Email
  {
    type: NotificationType.DOCUMENT_SIGNATURE_REMINDER,
    channel: NotificationChannel.EMAIL,
    name: "Lembrete de Assinatura (Email)",
    subject: "Lembrete: documento aguardando assinatura — {{clinicName}}",
    content: `Olá, {{signerName}}!

Lembrete: o documento "{{documentTitle}}" da {{clinicName}} ainda aguarda sua assinatura.

Acesse o link abaixo para concluir:
{{signingLink}}

Atenciosamente,
{{clinicName}}`,
  },
  // DOCUMENT_SIGNED - WhatsApp (to requesting staff)
  {
    type: NotificationType.DOCUMENT_SIGNED,
    channel: NotificationChannel.WHATSAPP,
    name: "Documento Assinado (WhatsApp)",
    subject: null,
    content: `O documento "{{documentTitle}}" de {{patientName}} foi assinado. — {{clinicName}}`,
  },
  // DOCUMENT_SIGNED - Email (to requesting staff)
  {
    type: NotificationType.DOCUMENT_SIGNED,
    channel: NotificationChannel.EMAIL,
    name: "Documento Assinado (Email)",
    subject: "Documento assinado — {{clinicName}}",
    content: `O documento "{{documentTitle}}" de {{patientName}} foi assinado com sucesso.

Acesse o sistema para baixar a via assinada.

{{clinicName}}`,
  },
  // FORM_REQUEST - WhatsApp (to patient/guardian)
  {
    type: NotificationType.FORM_REQUEST,
    channel: NotificationChannel.WHATSAPP,
    name: "Formulário para Preencher (WhatsApp)",
    subject: null,
    content: `Olá, {{patientName}}! A {{clinicName}} pede que você preencha o formulário "{{formName}}". Acesse: {{formLink}} (válido até {{expiryDate}}).`,
  },
  // FORM_REQUEST - Email (to patient/guardian)
  {
    type: NotificationType.FORM_REQUEST,
    channel: NotificationChannel.EMAIL,
    name: "Formulário para Preencher (Email)",
    subject: 'Formulário para preencher — {{clinicName}}',
    content: `Olá, {{patientName}}!

A {{clinicName}} pede que você preencha o formulário "{{formName}}".

Acesse o link abaixo para responder no seu celular ou computador:
{{formLink}}

O link é válido até {{expiryDate}}.

Atenciosamente,
{{clinicName}}`,
  },
  // FORM_COMPLETED - Email (to responsible professional)
  {
    type: NotificationType.FORM_COMPLETED,
    channel: NotificationChannel.EMAIL,
    name: "Formulário Respondido (Email)",
    subject: "Formulário respondido — {{patientName}}",
    content: `O paciente {{patientName}} respondeu o formulário "{{formName}}".

Acesse o sistema para revisar as respostas antes da sessão.

{{clinicName}}`,
  },
]

/**
 * Replaces template variables with actual values
 */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  let result = template

  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined && value !== null) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g")
      result = result.replace(regex, value)
    }
  }

  return result
}

/**
 * Gets the template for a specific notification type and channel
 * Falls back to default template if no custom template exists
 */
export async function getTemplate(
  clinicId: string,
  type: NotificationType,
  channel: NotificationChannel
): Promise<{ subject: string | null; content: string }> {
  // Try to find custom template
  const customTemplate = await prisma.notificationTemplate.findUnique({
    where: {
      clinicId_type_channel: {
        clinicId,
        type,
        channel,
      },
    },
  })

  if (customTemplate && customTemplate.isActive) {
    return {
      subject: customTemplate.subject,
      content: customTemplate.content,
    }
  }

  // Fall back to default template
  const defaultTemplate = DEFAULT_TEMPLATES.find(
    (t) => t.type === type && t.channel === channel
  )

  if (defaultTemplate) {
    return {
      subject: defaultTemplate.subject,
      content: defaultTemplate.content,
    }
  }

  throw new Error(`No template found for type ${type} and channel ${channel}`)
}

/**
 * Gets all templates for a clinic, merging custom and default templates
 */
export async function getTemplatesForClinic(
  clinicId: string
): Promise<Array<{
  type: NotificationType
  channel: NotificationChannel
  name: string
  subject: string | null
  content: string
  isCustom: boolean
  isActive: boolean
}>> {
  // Get all custom templates for the clinic
  const customTemplates = await prisma.notificationTemplate.findMany({
    where: { clinicId },
  })

  // Create a map of custom templates
  const customMap = new Map<string, NotificationTemplate>()
  for (const template of customTemplates) {
    customMap.set(`${template.type}-${template.channel}`, template)
  }

  // Merge with defaults
  return DEFAULT_TEMPLATES.map((defaultTemplate) => {
    const key = `${defaultTemplate.type}-${defaultTemplate.channel}`
    const custom = customMap.get(key)

    if (custom) {
      return {
        type: custom.type,
        channel: custom.channel,
        name: custom.name,
        subject: custom.subject,
        content: custom.content,
        isCustom: true,
        isActive: custom.isActive,
      }
    }

    return {
      ...defaultTemplate,
      isCustom: false,
      isActive: true,
    }
  })
}

/**
 * Updates or creates a custom template for a clinic
 */
export async function upsertTemplate(
  clinicId: string,
  type: NotificationType,
  channel: NotificationChannel,
  data: {
    name: string
    subject: string | null
    content: string
    isActive?: boolean
  }
): Promise<NotificationTemplate> {
  return prisma.notificationTemplate.upsert({
    where: {
      clinicId_type_channel: {
        clinicId,
        type,
        channel,
      },
    },
    update: {
      name: data.name,
      subject: data.subject,
      content: data.content,
      isActive: data.isActive ?? true,
    },
    create: {
      clinicId,
      type,
      channel,
      name: data.name,
      subject: data.subject,
      content: data.content,
      isActive: data.isActive ?? true,
    },
  })
}

/**
 * Resets a template to default by deleting the custom template
 */
export async function resetTemplateToDefault(
  clinicId: string,
  type: NotificationType,
  channel: NotificationChannel
): Promise<void> {
  await prisma.notificationTemplate.deleteMany({
    where: {
      clinicId,
      type,
      channel,
    },
  })
}

/**
 * Preview a template with sample data
 */
export function previewTemplate(
  content: string,
  subject: string | null
): { subject: string | null; content: string } {
  const sampleVariables: TemplateVariables = {
    patientName: "João Silva",
    professionalName: "Dra. Maria Santos",
    date: "15/02/2026",
    time: "14:00",
    confirmLink: "https://clinica.exemplo.com/confirm/abc123",
    cancelLink: "https://clinica.exemplo.com/cancel/abc123",
    clinicName: "Clínica Exemplo",
    modality: "Presencial",
    videoLink: "https://clinica.exemplo.com/teleconsulta/abc123",
  }

  return {
    subject: subject ? renderTemplate(subject, sampleVariables) : null,
    content: renderTemplate(content, sampleVariables),
  }
}
