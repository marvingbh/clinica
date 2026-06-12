import { describe, it, expect } from "vitest"
import { deriveChargeBadge, CHARGE_BADGE_LABELS } from "./charge-badge"

describe("deriveChargeBadge", () => {
  it("returns ATIVO for an unviewed open charge", () => {
    expect(deriveChargeBadge({ status: "ABERTA", viewedAt: null, paymentMethod: null })).toBe("ATIVO")
  })

  it("returns VISUALIZADO for a viewed open charge", () => {
    expect(
      deriveChargeBadge({ status: "ABERTA", viewedAt: new Date(), paymentMethod: null })
    ).toBe("VISUALIZADO")
  })

  it("splits PAGA by payment method", () => {
    expect(deriveChargeBadge({ status: "PAGA", viewedAt: null, paymentMethod: "pix" })).toBe("PAGO_PIX")
    expect(deriveChargeBadge({ status: "PAGA", viewedAt: null, paymentMethod: "card" })).toBe("PAGO_CARTAO")
  })

  it("defaults PAGA without a method to cartão", () => {
    expect(deriveChargeBadge({ status: "PAGA", viewedAt: null, paymentMethod: null })).toBe("PAGO_CARTAO")
  })

  it("maps terminal statuses", () => {
    expect(deriveChargeBadge({ status: "EXPIRADA", viewedAt: null, paymentMethod: null })).toBe("EXPIRADO")
    expect(deriveChargeBadge({ status: "CANCELADA", viewedAt: null, paymentMethod: null })).toBe("CANCELADO")
    expect(deriveChargeBadge({ status: "REEMBOLSADA", viewedAt: null, paymentMethod: null })).toBe("REEMBOLSADA")
  })

  it("has a pt-BR label for every badge", () => {
    for (const badge of [
      "ATIVO",
      "VISUALIZADO",
      "PAGO_PIX",
      "PAGO_CARTAO",
      "EXPIRADO",
      "CANCELADO",
      "REEMBOLSADA",
    ] as const) {
      expect(CHARGE_BADGE_LABELS[badge]).toBeTruthy()
    }
  })
})
