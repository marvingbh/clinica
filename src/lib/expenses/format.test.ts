import { describe, it, expect } from "vitest"
import { formatExpenseStatus, formatFrequency } from "./format"

describe("formatExpenseStatus", () => {
  it("returns PT-BR labels for all statuses", () => {
    expect(formatExpenseStatus("DRAFT")).toBe("Rascunho")
    expect(formatExpenseStatus("OPEN")).toBe("Em aberto")
    expect(formatExpenseStatus("PAID")).toBe("Pago")
    expect(formatExpenseStatus("OVERDUE")).toBe("Vencido")
    expect(formatExpenseStatus("CANCELLED")).toBe("Cancelado")
  })
})

describe("formatFrequency", () => {
  it("returns PT-BR labels for frequencies", () => {
    expect(formatFrequency("MONTHLY")).toBe("Mensal")
    expect(formatFrequency("YEARLY")).toBe("Anual")
  })
})
