import type { ChargeBadgeStatus } from "./types"

export interface ChargeBadgeInput {
  status: "ABERTA" | "PAGA" | "EXPIRADA" | "CANCELADA" | "REEMBOLSADA"
  viewedAt: string | Date | null
  paymentMethod: string | null
}

/**
 * Derives the public-facing charge badge from a charge's status fields.
 * PAGA splits into Pix/cartão; ABERTA splits into active vs. viewed.
 */
export function deriveChargeBadge(charge: ChargeBadgeInput): ChargeBadgeStatus {
  switch (charge.status) {
    case "PAGA":
      return charge.paymentMethod === "pix" ? "PAGO_PIX" : "PAGO_CARTAO"
    case "EXPIRADA":
      return "EXPIRADO"
    case "CANCELADA":
      return "CANCELADO"
    case "REEMBOLSADA":
      return "REEMBOLSADA"
    case "ABERTA":
    default:
      return charge.viewedAt ? "VISUALIZADO" : "ATIVO"
  }
}

export const CHARGE_BADGE_LABELS: Record<ChargeBadgeStatus, string> = {
  ATIVO: "Link ativo",
  VISUALIZADO: "Link visualizado",
  PAGO_PIX: "Pago via Pix",
  PAGO_CARTAO: "Pago via cartão",
  EXPIRADO: "Link expirado",
  CANCELADO: "Link cancelado",
  REEMBOLSADA: "Reembolsada",
}
