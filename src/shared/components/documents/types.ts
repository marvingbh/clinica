export interface DocumentTemplateDTO {
  id?: string
  type: string
  name: string
  body: string
  isActive?: boolean
}

export interface MissingFieldDTO {
  key: string
  label: string
  quickFixPath: string | null
}

export interface SessionRowDTO {
  date: string
  durationMinutes: number
  unitPrice: string
  invoiceItemId: string
}

export interface ReciboItemDTO {
  id: string
  description: string
  type: string
  total: string
  scheduledAt: string | null
  endAt: string | null
}

export interface GeneratedDocumentDTO {
  id: string
  title: string
  templateType: string
  templateName: string
  createdAt: string
  sentToEmail: string | null
  sentAt: string | null
  patientName: string
  professionalName: string | null
  generatedByName: string | null
}

export interface WizardSeed {
  patientId: string
  appointmentId?: string | null
  defaultType?: string
}
