import { prisma } from "@/lib/prisma"
import {
  NotificationChannel,
  NotificationType,
  type NotificationTemplate,
} from "@/generated/prisma/client"

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
  }

  return {
    subject: subject ? renderTemplate(subject, sampleVariables) : null,
    content: renderTemplate(content, sampleVariables),
  }
}
