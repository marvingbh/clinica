import type { PatientDocumentDTO } from "@/lib/patient-documents"

export type DocumentDTO = PatientDocumentDTO

export type DocumentIconName = "pdf" | "image" | "spreadsheet" | "file"

/** Pick an icon name for a document based on its MIME type (pure). */
export function iconNameForMime(mimeType: string): DocumentIconName {
  if (mimeType === "application/pdf") return "pdf"
  if (mimeType.startsWith("image/")) return "image"
  if (
    mimeType.includes("spreadsheet") ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv"
  ) {
    return "spreadsheet"
  }
  return "file"
}

/** Brazilian short date DD/MM/YYYY. */
export function formatBrDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
}
