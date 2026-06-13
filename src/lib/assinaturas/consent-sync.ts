/**
 * Maps a signed document type to the LGPD consent booleans it should flip on
 * the Patient. Each ConsentField has a paired `*At` timestamp column on the
 * Patient model.
 */
export type ConsentField =
  | "consentPhotoVideo"
  | "consentSessionRecording"
  | "consentWhatsApp"
  | "consentEmail"

const CONSENT_AT: Record<ConsentField, string> = {
  consentPhotoVideo: "consentPhotoVideoAt",
  consentSessionRecording: "consentSessionRecordingAt",
  consentWhatsApp: "consentWhatsAppAt",
  consentEmail: "consentEmailAt",
}

/**
 * Which consent booleans a given document type updates when its envelope is
 * completed. TCLE / TERMO_LGPD / CONSENTIMENTO_MENOR are clinical/legal
 * consents that are NOT channel flags, so they map to `[]` (the envelope itself
 * is the record). Unknown types map to `[]`.
 */
export function mapDocumentTypeToConsents(docType: string): ConsentField[] {
  switch (docType) {
    case "CONSENTIMENTO_IMAGEM":
      return ["consentPhotoVideo"]
    case "CONSENTIMENTO_GRAVACAO":
      return ["consentSessionRecording"]
    case "TCLE":
    case "TERMO_LGPD":
    case "CONSENTIMENTO_MENOR":
    default:
      return []
  }
}

/**
 * Builds a Prisma update payload that sets each consent boolean to true and its
 * paired timestamp to `signedAt`.
 */
export function buildConsentUpdateData(
  fields: ConsentField[],
  signedAt: Date
): Record<string, boolean | Date> {
  const data: Record<string, boolean | Date> = {}
  for (const field of fields) {
    data[field] = true
    data[CONSENT_AT[field]] = signedAt
  }
  return data
}
