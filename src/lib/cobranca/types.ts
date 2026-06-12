/** Shared types for the cobrança (integrated billing) module. */

export type ChargeChannel = "WHATSAPP" | "EMAIL"

export type ChargeNotificationType = "PAYMENT_LINK" | "PAYMENT_REMINDER"

/** Reason a charge link is unavailable when a patient opens the public link. */
export type ChargeUnavailableReason = "invalido" | "pago" | "expirado"

/** Public-facing status used by the invoice list badge. */
export type ChargeBadgeStatus =
  | "ATIVO"
  | "VISUALIZADO"
  | "PAGO_PIX"
  | "PAGO_CARTAO"
  | "EXPIRADO"
  | "CANCELADO"
  | "REEMBOLSADA"
