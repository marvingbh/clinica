/**
 * NFS-e Emission Service
 *
 * Functions for determining emission mode, building per-item
 * emission plans, computing aggregate NFS-e status, and
 * persisting the aggregate status back to the invoice.
 */

import { prisma } from "@/lib/prisma"

export type EmissionMode = "per-invoice" | "per-item"

export type NfseAggregateStatus = "PENDENTE" | "PARCIAL" | "EMITIDA" | "ERRO" | "CANCELADA" | null

export interface EmissionPlan {
  invoiceItemId: string
  valor: number
  descricao: string
}

interface PatientLike {
  nfsePerAppointment: boolean
}

interface InvoiceItemLike {
  id: string
  type: string
  total: number | string | { toNumber?: () => number }
  description: string
}

/**
 * Determine whether NFS-e should be emitted per-invoice or per-item
 * based on the patient's nfsePerAppointment setting.
 */
export function determineEmissionMode(patient: PatientLike): EmissionMode {
  return patient.nfsePerAppointment ? "per-item" : "per-invoice"
}

/**
 * Build one emission plan per billable invoice item.
 * Skips CREDITO items (negative/discount items that never get NFS-e).
 */
export function buildPerItemEmissions(items: InvoiceItemLike[]): EmissionPlan[] {
  return items
    .filter((item) => item.type !== "CREDITO")
    .map((item) => ({
      invoiceItemId: item.id,
      valor: toNumber(item.total),
      descricao: item.description,
    }))
}

/**
 * Compute aggregate NFS-e status from a list of individual emission statuses.
 *
 * Rules:
 * - No emissions → null
 * - All same status → that status
 * - Any EMITIDA + others → PARCIAL
 * - Mix of PENDENTE/ERRO/CANCELADA without EMITIDA → PENDENTE (if any PENDENTE), else ERRO, else CANCELADA
 */
export function computeAggregateNfseStatus(
  statuses: Array<"PENDENTE" | "EMITIDA" | "ERRO" | "CANCELADA">
): NfseAggregateStatus {
  if (statuses.length === 0) return null

  const unique = new Set(statuses)
  if (unique.size === 1) return statuses[0]

  // Mixed statuses
  if (unique.has("EMITIDA")) return "PARCIAL"
  if (unique.has("PENDENTE")) return "PENDENTE"
  if (unique.has("ERRO")) return "ERRO"
  return "CANCELADA"
}

/**
 * Fetch all NfseEmission rows for an invoice, compute the aggregate status,
 * and persist it back to the Invoice row (including legacy notaFiscalEmitida fields).
 */
export async function updateInvoiceAggregateNfseStatus(invoiceId: string): Promise<NfseAggregateStatus> {
  const allEmissions = await prisma.nfseEmission.findMany({
    where: { invoiceId },
    select: { status: true },
  })
  const statuses = allEmissions.map(e => e.status) as Array<"PENDENTE" | "EMITIDA" | "ERRO" | "CANCELADA">
  const aggregate = computeAggregateNfseStatus(statuses)

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      nfseStatus: aggregate,
      // Keep legacy field in sync
      notaFiscalEmitida: aggregate === "EMITIDA",
      notaFiscalEmitidaAt: aggregate === "EMITIDA" ? new Date() : null,
    },
  })
  return aggregate
}

function toNumber(val: number | string | { toNumber?: () => number }): number {
  if (typeof val === "number") return val
  if (typeof val === "string") return parseFloat(val)
  if (typeof val === "object" && val !== null && typeof val.toNumber === "function") {
    return val.toNumber()
  }
  return 0
}
