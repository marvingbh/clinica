import { describe, it, expect } from "vitest"
import {
  determineInvoiceProfessional,
  shouldSkipInvoice,
  separateManualItems,
} from "./invoice-generation"

describe("determineInvoiceProfessional", () => {
  it("returns referenceProfId when set", () => {
    const result = determineInvoiceProfessional("ref-prof-1", [
      { professionalProfileId: "prof-a" },
      { professionalProfileId: "prof-a" },
      { professionalProfileId: "prof-b" },
    ])
    expect(result).toBe("ref-prof-1")
  })

  it("returns the professional with the most sessions when no referenceProfId", () => {
    const result = determineInvoiceProfessional(null, [
      { professionalProfileId: "prof-a" },
      { professionalProfileId: "prof-b" },
      { professionalProfileId: "prof-b" },
      { professionalProfileId: "prof-b" },
      { professionalProfileId: "prof-a" },
    ])
    expect(result).toBe("prof-b")
  })

  it("returns first professional when tied", () => {
    const result = determineInvoiceProfessional(null, [
      { professionalProfileId: "prof-a" },
      { professionalProfileId: "prof-b" },
    ])
    // With a tie, whichever appears first in iteration wins
    expect(["prof-a", "prof-b"]).toContain(result)
  })

  it("handles single appointment", () => {
    const result = determineInvoiceProfessional(null, [
      { professionalProfileId: "prof-x" },
    ])
    expect(result).toBe("prof-x")
  })
})

describe("shouldSkipInvoice", () => {
  it("returns true for PAGO", () => {
    expect(shouldSkipInvoice("PAGO")).toBe(true)
  })

  it("returns true for ENVIADO", () => {
    expect(shouldSkipInvoice("ENVIADO")).toBe(true)
  })

  it("returns false for PENDENTE", () => {
    expect(shouldSkipInvoice("PENDENTE")).toBe(false)
  })

  it("returns false for CANCELADO", () => {
    expect(shouldSkipInvoice("CANCELADO")).toBe(false)
  })
})

describe("separateManualItems", () => {
  it("separates auto items (with appointmentId) from manual items", () => {
    const items = [
      { id: "1", appointmentId: "apt-1", type: "SESSAO_REGULAR", description: "Sessão" },
      { id: "2", appointmentId: null, type: "SESSAO_EXTRA", description: "Manual extra" },
      { id: "3", appointmentId: "apt-2", type: "SESSAO_REGULAR", description: "Sessão" },
    ]
    const { autoItems, manualItems } = separateManualItems(items)
    expect(autoItems).toHaveLength(2)
    expect(manualItems).toHaveLength(1)
    expect(manualItems[0].id).toBe("2")
  })

  it("treats CREDITO items as auto only when matching consumed credits", () => {
    const items = [
      { id: "1", appointmentId: null, type: "CREDITO", description: "Crédito: Cancelamento acordado" },
      { id: "2", appointmentId: null, type: "SESSAO_EXTRA", description: "Manual extra" },
    ]
    const consumedCredits = [{ id: "credit-1", reason: "Cancelamento acordado" }]
    const { autoItems, manualItems } = separateManualItems(items, consumedCredits)
    expect(autoItems).toHaveLength(1)
    expect(autoItems[0].id).toBe("1")
    expect(manualItems).toHaveLength(1)
    expect(manualItems[0].id).toBe("2")
  })

  it("treats CREDITO items as manual when no matching consumed credits", () => {
    const items = [
      { id: "1", appointmentId: null, type: "CREDITO", description: "Manual credit adjustment" },
      { id: "2", appointmentId: null, type: "SESSAO_EXTRA", description: "Manual extra" },
    ]
    // No consumed credits provided
    const { autoItems, manualItems } = separateManualItems(items, [])
    expect(autoItems).toHaveLength(0)
    expect(manualItems).toHaveLength(2)
  })

  it("returns empty arrays for empty input", () => {
    const { autoItems, manualItems } = separateManualItems([])
    expect(autoItems).toHaveLength(0)
    expect(manualItems).toHaveLength(0)
  })

  it("correctly classifies mixed items with consumed credits", () => {
    const items = [
      { id: "1", appointmentId: "apt-1", type: "SESSAO_REGULAR", description: "Sessão" },
      { id: "2", appointmentId: null, type: "CREDITO", description: "Crédito: Falta justificada" },
      { id: "3", appointmentId: null, type: "REUNIAO_ESCOLA", description: "Reunião manual" },
      { id: "4", appointmentId: "apt-2", type: "SESSAO_GRUPO", description: "Sessão grupo" },
      { id: "5", appointmentId: null, type: "CREDITO", description: "Desconto especial" },
    ]
    const consumedCredits = [{ id: "credit-1", reason: "Falta justificada" }]
    const { autoItems, manualItems } = separateManualItems(items, consumedCredits)
    // Auto: id 1 (appointmentId), id 2 (matching credit), id 4 (appointmentId)
    // Manual: id 3 (no appointmentId), id 5 (CREDITO but no match)
    expect(autoItems.map(i => i.id)).toEqual(["1", "2", "4"])
    expect(manualItems.map(i => i.id)).toEqual(["3", "5"])
  })
})
