import { prisma } from "@/lib/prisma"
import type { AuthUser } from "@/lib/rbac/types"
import {
  buildMergeContext,
  extractPlaceholderKeys,
  mergeTemplate,
  resolveValues,
  validateGeneration,
  getPlaceholder,
  getSystemTemplate,
  canGenerateClinicalDoc,
  buildReciboSessionRows,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  type MissingField,
  type SessionRow,
} from "@/lib/documents"

export interface GenerationRequest {
  templateType: DocumentType
  templateId?: string | null
  patientId: string
  appointmentId?: string | null
  invoiceItemIds?: string[]
  professionalProfileId?: string | null
  manualFields?: Record<string, string>
}

export interface GenerationResult {
  ok: true
  body: string
  templateName: string
  content: string
  sessionRows: SessionRow[]
  missingFields: MissingField[]
  signingProfessionalId: string | null
  clinicLogo: { data: Buffer | null; mime: string | null }
  clinicName: string
  clinicAddress: string | null
  clinicPhone: string | null
  generatedAt: Date
}

export interface GenerationError {
  ok: false
  status: number
  error: string
  missingFields?: MissingField[]
}

/**
 * Shared fetch + merge-context + validation pipeline for preview and generate.
 * Self-scopes every query by user.clinicId. Returns either the resolved
 * content + checklist or an error with HTTP status.
 */
export async function buildGeneration(
  user: AuthUser,
  req: GenerationRequest
): Promise<GenerationResult | GenerationError> {
  const clinicId = user.clinicId

  // --- Patient (self-scoped) ---
  const patient = await prisma.patient.findFirst({
    where: { id: req.patientId, clinicId },
    select: {
      id: true, name: true, cpf: true, birthDate: true,
      billingResponsibleName: true, motherName: true, fatherName: true,
      email: true, phone: true,
    },
  })
  if (!patient) return { ok: false, status: 404, error: "Paciente não encontrado" }

  // --- Clinic ---
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      name: true, address: true, phone: true, email: true, timezone: true,
      defaultSessionDuration: true, logoData: true, logoMime: true,
      restrictClinicalDocsToProfessionals: true,
      nfseConfig: { select: { cnpj: true } },
    },
  })
  if (!clinic) return { ok: false, status: 404, error: "Clínica não encontrada" }

  // --- Signing professional ---
  const signingProfessionalId =
    user.role === "PROFESSIONAL"
      ? user.professionalProfileId
      : req.professionalProfileId ?? user.professionalProfileId ?? null

  // Clinical-doc restriction (regra 3)
  if (!canGenerateClinicalDoc(req.templateType, clinic.restrictClinicalDocsToProfessionals, signingProfessionalId)) {
    return {
      ok: false,
      status: 403,
      error: "A geração de documentos clínicos está restrita a profissionais nesta clínica",
    }
  }

  let professional: { name: string; crp: string | null; cpf: string | null } | null = null
  if (signingProfessionalId) {
    const prof = await prisma.professionalProfile.findFirst({
      where: { id: signingProfessionalId, user: { clinicId } },
      select: { registrationNumber: true, cpf: true, user: { select: { name: true } } },
    })
    if (!prof) return { ok: false, status: 404, error: "Profissional não encontrado" }
    professional = { name: prof.user.name, crp: prof.registrationNumber, cpf: prof.cpf }
  }

  // --- Source appointment (optional, self-scoped) ---
  let appointment: { scheduledAt: Date; endAt: Date } | null = null
  if (req.appointmentId) {
    const appt = await prisma.appointment.findFirst({
      where: { id: req.appointmentId, clinicId, patientId: req.patientId },
      select: { scheduledAt: true, endAt: true },
    })
    if (!appt) return { ok: false, status: 404, error: "Agendamento não encontrado" }
    appointment = { scheduledAt: appt.scheduledAt, endAt: appt.endAt }
  }

  // --- Recibo session rows (optional, self-scoped) ---
  let sessionRows: SessionRow[] = []
  if (req.invoiceItemIds && req.invoiceItemIds.length > 0) {
    const items = await prisma.invoiceItem.findMany({
      where: {
        id: { in: req.invoiceItemIds },
        invoice: { clinicId, patientId: req.patientId },
      },
      select: {
        id: true, description: true, total: true, type: true,
        invoice: { select: { status: true } },
        appointment: { select: { scheduledAt: true, endAt: true } },
      },
    })
    if (items.length !== new Set(req.invoiceItemIds).size) {
      return { ok: false, status: 403, error: "Itens de fatura inválidos" }
    }
    sessionRows = buildReciboSessionRows(
      items.map((it) => ({
        id: it.id,
        description: it.description,
        total: it.total.toString(),
        appointmentScheduledAt: it.appointment?.scheduledAt ?? null,
        appointmentEndAt: it.appointment?.endAt ?? null,
        invoiceStatus: it.invoice.status,
        type: it.type,
      })),
      clinic.timezone,
      clinic.defaultSessionDuration
    )
  }

  // --- Resolve template body ---
  let body: string
  let templateName: string
  if (req.templateId) {
    const tpl = await prisma.clinicDocumentTemplate.findFirst({
      where: { id: req.templateId, clinicId },
      select: { body: true, name: true, type: true },
    })
    if (!tpl) return { ok: false, status: 404, error: "Modelo não encontrado" }
    body = tpl.body
    templateName = tpl.name
  } else {
    const seed = getSystemTemplate(req.templateType)
    body = seed.body
    templateName = seed.name
  }

  // --- Build context, merge, validate ---
  const generatedAt = new Date()
  const ctx = buildMergeContext({
    patient,
    professional,
    clinic: { name: clinic.name, cnpj: clinic.nfseConfig?.cnpj ?? null, timezone: clinic.timezone, address: clinic.address, phone: clinic.phone, email: clinic.email },
    appointment,
    sessionRows,
    manualFields: req.manualFields ?? {},
    generatedAt,
  })

  const bodyKeys = extractPlaceholderKeys(body)
  const missingFields = augmentQuickFix(validateGeneration(req.templateType, bodyKeys, ctx), patient.id)

  const optionalKeys = bodyKeys.filter((k) => {
    const def = getPlaceholder(k)
    return def ? !def.requiredFor.includes(req.templateType) : false
  })
  const { values } = resolveValues(bodyKeys, ctx)
  const { content } = mergeTemplate(body, values, optionalKeys)

  return {
    ok: true,
    body,
    templateName,
    content,
    sessionRows,
    missingFields,
    signingProfessionalId,
    clinicLogo: { data: clinic.logoData ? Buffer.from(clinic.logoData) : null, mime: clinic.logoMime },
    clinicName: clinic.name,
    clinicAddress: clinic.address,
    clinicPhone: clinic.phone,
    generatedAt,
  }
}

/** Title shown in the list, e.g. "Declaração de comparecimento — 11/06/2026". */
export function buildDocumentTitle(type: DocumentType, generatedAt: Date, timezone: string): string {
  const date = generatedAt.toLocaleDateString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric" })
  return `${DOCUMENT_TYPE_LABELS[type]} — ${date}`
}

function augmentQuickFix(missing: MissingField[], patientId: string): MissingField[] {
  return missing.map((m) =>
    m.key === "patientCpf"
      ? { ...m, quickFixPath: `/patients?id=${patientId}&edit=1` }
      : m
  )
}
