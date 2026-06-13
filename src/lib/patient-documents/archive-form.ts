import { renderToBuffer } from "@react-pdf/renderer"
import { prisma } from "@/lib/prisma"
import { createResponseDocument } from "@/lib/forms/pdf/ResponsePdf"
import { parseFieldsSafe, type FormAnswers } from "@/lib/forms"
import { getStorageProvider } from "@/lib/storage/server"
import { buildStorageKey, sanitizeFilename } from "@/lib/storage"
import { randomUUID } from "node:crypto"
import { registerSystemDocument, type PatientDocumentCreateDb } from "./register"

export interface FormResponseForArchive {
  id: string
  completedAt: Date | null
  answers: unknown
  professionalProfileId: string | null
  patient: { id: string; name: string }
  clinic: { id: string; name: string }
  formVersion: {
    version: number
    fields: unknown
    template: { name: string }
  }
}

/**
 * Renders a completed form response to PDF, stores it in the patient's document
 * library as a system document (source FORMULARIO), and creates the metadata
 * row. Bypasses the upload quota (mandatory clinical artifact) per the plan.
 * Best-effort: callers wrap this so a failure never blocks the patient submit.
 */
export async function archiveFormResponseAsDocument(
  response: FormResponseForArchive
): Promise<{ id: string }> {
  const fields = parseFieldsSafe(response.formVersion.fields)
  const buffer = await renderToBuffer(
    createResponseDocument({
      clinicName: response.clinic.name,
      templateName: response.formVersion.template.name,
      version: response.formVersion.version,
      patientName: response.patient.name,
      status: "CONCLUIDO",
      completedAtLabel: response.completedAt
        ? response.completedAt.toLocaleDateString("pt-BR")
        : null,
      fields,
      answers: (response.answers ?? {}) as FormAnswers,
    })
  )

  const documentId = randomUUID()
  const filename = `${sanitizeFilename(response.formVersion.template.name)}.pdf`
  const storageKey = buildStorageKey({
    clinicId: response.clinic.id,
    patientId: response.patient.id,
    documentId,
    filename,
  })

  await getStorageProvider().put(storageKey, Buffer.from(buffer), {
    mimeType: "application/pdf",
  })

  return registerSystemDocument(prisma as unknown as PatientDocumentCreateDb, {
    clinicId: response.clinic.id,
    patientId: response.patient.id,
    source: "FORMULARIO",
    filename,
    mimeType: "application/pdf",
    sizeBytes: buffer.length,
    storageKey,
    category: "DOCUMENTO",
    description: `Formulário "${response.formVersion.template.name}" respondido`,
  })
}
