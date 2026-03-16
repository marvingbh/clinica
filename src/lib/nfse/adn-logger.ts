import { prisma } from "@/lib/prisma"

interface AdnLogEntry {
  clinicId: string
  invoiceId?: string
  operation: string
  method: string
  url: string
  requestBody?: string
  statusCode?: number
  responseBody?: string
  durationMs?: number
  error?: string
}

/**
 * Log an ADN API communication to the database.
 * Fire-and-forget — never blocks the main flow.
 */
export function logAdnCall(entry: AdnLogEntry): void {
  prisma.adnLog.create({
    data: {
      clinicId: entry.clinicId,
      invoiceId: entry.invoiceId || null,
      operation: entry.operation,
      method: entry.method,
      url: entry.url,
      requestBody: entry.requestBody?.slice(0, 50000) || null,
      statusCode: entry.statusCode || null,
      responseBody: entry.responseBody?.slice(0, 50000) || null,
      durationMs: entry.durationMs || null,
      error: entry.error || null,
    },
  }).catch((err) => {
    console.error("[AdnLogger] Failed to log:", err instanceof Error ? err.message : err)
  })
}
