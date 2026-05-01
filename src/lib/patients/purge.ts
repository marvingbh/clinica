/**
 * LGPD right-to-erase (Art. 18, V) for a single patient.
 *
 * This does NOT hard-delete the patient row — that would break referential
 * integrity with invoices and NFS-e records that Brazilian tax law requires
 * retained for 5 years (CTN Art. 173-174) and clinical records that CFP
 * Resolução 001/2009 requires retained for 20 years.
 *
 * Instead, this anonymizes every PII field on the patient row and cascades
 * redaction into dependent tables. Sum of remaining non-PII fields preserves
 * the clinical/financial "shape" that legal hold requires while removing
 * anything that identifies the subject.
 *
 * Structure:
 *   1. Main transaction (fast, atomic): anonymize Patient + delete
 *      PatientPhone/PatientUsualPayer/IntakeSubmission; write PATIENT_PURGED
 *      audit row.
 *   2. Post-transaction chunked redactions (bulk UPDATEs that may touch
 *      thousands of rows for a long-history patient): AuditLog, Notification,
 *      Appointment.notes, SessionCredit.reason, Invoice.notes,
 *      InvoiceItem.description, AdnLog.requestBody/responseBody.
 *   3. Final AUDIT_REDACTED audit row with per-table row counts.
 *
 * The Vercel serverless function limit (10s Hobby / 60s Pro) and Prisma's
 * default 5s transaction timeout would both fail for long-history patients
 * if the redactions were all inside one transaction. Splitting keeps the
 * main purge atomic while allowing the bulk work to finish out-of-band.
 */

import { Prisma } from "@prisma/client"
import { prisma } from "../prisma"
import { AuditAction } from "../rbac/audit"
import type { AuthUser } from "../rbac/types"

const CHUNK_SIZE = 1000
const REDACTED = "[conteudo removido por solicitacao LGPD]"

export interface PurgePatientInput {
  patientId: string
  actingUser: AuthUser
  reason: string
  requestId?: string
}

export interface PurgeResult {
  patientId: string
  purgeAuditId: string
  rowCounts: {
    patientPhone: number
    patientUsualPayer: number
    intakeSubmission: number
    auditLog: number
    notification: number
    appointment: number
    sessionCredit: number
    invoice: number
    invoiceItem: number
    adnLog: number
  }
}

export async function purgePatient(input: PurgePatientInput): Promise<PurgeResult> {
  const { patientId, actingUser, reason, requestId } = input

  // Pre-flight check — patient must exist and belong to the acting user's clinic.
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: actingUser.clinicId },
    select: { id: true, name: true, clinicId: true },
  })
  if (!patient) {
    throw new Error(`Patient ${patientId} not found in clinic ${actingUser.clinicId}`)
  }
  // Idempotency: already purged? Return the prior audit entry.
  if (patient.name === "[Paciente removido]") {
    const prior = await prisma.auditLog.findFirst({
      where: {
        clinicId: actingUser.clinicId,
        entityType: "Patient",
        entityId: patientId,
        action: AuditAction.PATIENT_PURGED,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    return emptyResult(patientId, prior?.id ?? "unknown")
  }

  // 1. Main transaction — atomic.
  const rowCounts = {
    patientPhone: 0,
    patientUsualPayer: 0,
    intakeSubmission: 0,
    auditLog: 0,
    notification: 0,
    appointment: 0,
    sessionCredit: 0,
    invoice: 0,
    invoiceItem: 0,
    adnLog: 0,
  }
  const purgeAudit = await prisma.$transaction(
    async (tx) => {
      const audit = await tx.auditLog.create({
        data: {
          clinicId: actingUser.clinicId,
          userId: actingUser.id,
          action: AuditAction.PATIENT_PURGED,
          entityType: "Patient",
          entityId: patientId,
          newValues: { reason, requestId: requestId ?? null },
          // no PII in metadata — patient.name etc. intentionally omitted.
        },
      })

      await tx.patient.update({
        where: { id: patientId },
        data: {
          name: "[Paciente removido]",
          email: null,
          phone: "",
          cpf: null,
          motherName: null,
          fatherName: null,
          billingCpf: null,
          billingResponsibleName: null,
          addressStreet: null,
          addressNumber: null,
          addressNeighborhood: null,
          addressCity: null,
          addressState: null,
          addressZip: null,
          notes: null,
          therapeuticProject: null,
          nfseObs: null,
          birthDate: null,
          schoolName: null,
          schoolUnit: null,
          schoolShift: null,
          motherPhone: null,
          fatherPhone: null,
          firstAppointmentDate: null,
          lastFeeAdjustmentDate: null,
          consentWhatsAppAt: null,
          consentEmailAt: null,
          consentPhotoVideoAt: null,
          consentSessionRecordingAt: null,
        },
      })

      rowCounts.patientPhone = (await tx.patientPhone.deleteMany({ where: { patientId } })).count
      rowCounts.patientUsualPayer = (await tx.patientUsualPayer.deleteMany({ where: { patientId } })).count
      rowCounts.intakeSubmission = (await tx.intakeSubmission.deleteMany({ where: { patientId } })).count

      return audit
    },
    { timeout: 30_000, maxWait: 5_000 },
  )

  // 2. Post-transaction chunked redactions. Each chunk is its own tiny
  //    transaction; we stop when affected rows < CHUNK_SIZE.
  rowCounts.auditLog = await chunkedRedactAuditLog(patientId)
  rowCounts.notification = await chunkedUpdateWhere(
    "Notification",
    { patientId, NOT: { content: REDACTED } },
    async (ids) =>
      prisma.notification.updateMany({
        where: { id: { in: ids } },
        data: { content: REDACTED, subject: null, recipient: "[redacted]", failureReason: null },
      }),
  )
  rowCounts.appointment = (
    await prisma.appointment.updateMany({
      where: { patientId },
      data: { notes: null, cancellationReason: null },
    })
  ).count
  rowCounts.sessionCredit = (
    await prisma.sessionCredit.updateMany({
      where: { patientId },
      data: { reason: "[redacted]" },
    })
  ).count
  const patientInvoices = await prisma.invoice.findMany({
    where: { patientId },
    select: { id: true },
  })
  const invoiceIds = patientInvoices.map((i) => i.id)

  const invoiceUpdate = await prisma.invoice.updateMany({
    where: { patientId },
    data: { notes: null },
  })
  rowCounts.invoice = invoiceUpdate.count

  if (invoiceIds.length > 0) {
    rowCounts.invoiceItem = (
      await prisma.invoiceItem.updateMany({
        where: { invoiceId: { in: invoiceIds } },
        data: { description: "[redacted]" },
      })
    ).count
    rowCounts.adnLog = (
      await prisma.adnLog.updateMany({
        where: { invoiceId: { in: invoiceIds } },
        data: { requestBody: null, responseBody: null },
      })
    ).count
  }

  // 3. AUDIT_REDACTED summary row.
  await prisma.auditLog.create({
    data: {
      clinicId: actingUser.clinicId,
      userId: actingUser.id,
      action: AuditAction.AUDIT_REDACTED,
      entityType: "Patient",
      entityId: patientId,
      newValues: { rowCounts, reason },
    },
  })

  return { patientId, purgeAuditId: purgeAudit.id, rowCounts }
}

async function chunkedRedactAuditLog(patientId: string): Promise<number> {
  let totalRedacted = 0
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      where: {
        entityType: "Patient",
        entityId: patientId,
        OR: [
          { NOT: { oldValues: { equals: Prisma.JsonNull } } },
          { NOT: { newValues: { equals: Prisma.JsonNull } } },
        ],
      },
      select: { id: true },
      take: CHUNK_SIZE,
    })
    if (rows.length === 0) break
    await prisma.auditLog.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { oldValues: Prisma.JsonNull, newValues: Prisma.JsonNull },
    })
    totalRedacted += rows.length
    if (rows.length < CHUNK_SIZE) break
  }
  return totalRedacted
}

async function chunkedUpdateWhere<_T>(
  modelLabel: string,
  where: unknown,
  updater: (ids: string[]) => Promise<{ count: number }>,
): Promise<number> {
  // Simple loop — `where` is scoped enough that one bulk updateMany would
  // also work, but chunking guards against runaway statement times on a
  // 10k+ row patient.
  const table = modelLabel.toLowerCase() as "notification"
  let total = 0
  for (;;) {
    // @ts-expect-error — narrow by label
    const rows = await prisma[table].findMany({ where, select: { id: true }, take: CHUNK_SIZE })
    if (rows.length === 0) break
    await updater(rows.map((r: { id: string }) => r.id))
    total += rows.length
    if (rows.length < CHUNK_SIZE) break
  }
  return total
}

function emptyResult(patientId: string, priorAuditId: string): PurgeResult {
  return {
    patientId,
    purgeAuditId: priorAuditId,
    rowCounts: {
      patientPhone: 0, patientUsualPayer: 0, intakeSubmission: 0,
      auditLog: 0, notification: 0, appointment: 0, sessionCredit: 0,
      invoice: 0, invoiceItem: 0, adnLog: 0,
    },
  }
}
