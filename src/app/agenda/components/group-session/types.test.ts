import { describe, it, expect } from "vitest"
import { formatDateTime, formatTimeRange, PARTICIPANT_STATUS_LABELS } from "./types"

describe("formatDateTime", () => {
  it("formats ISO string to pt-BR date and time", () => {
    const result = formatDateTime("2026-04-15T14:30:00.000Z")
    expect(result.date).toContain("15")
    expect(result.time).toMatch(/\d{2}:\d{2}/)
  })
})

describe("formatTimeRange", () => {
  it("formats start and end ISO strings to HH:mm - HH:mm", () => {
    const result = formatTimeRange("2026-04-15T14:00:00.000Z", "2026-04-15T15:30:00.000Z")
    expect(result).toMatch(/\d{2}:\d{2} - \d{2}:\d{2}/)
  })
})

describe("PARTICIPANT_STATUS_LABELS", () => {
  it("has labels for all appointment statuses", () => {
    expect(PARTICIPANT_STATUS_LABELS.AGENDADO).toBe("Agendado")
    expect(PARTICIPANT_STATUS_LABELS.CONFIRMADO).toBe("Confirmado")
    expect(PARTICIPANT_STATUS_LABELS.FINALIZADO).toBe("Compareceu")
    expect(PARTICIPANT_STATUS_LABELS.CANCELADO_ACORDADO).toBe("Desmarcou")
    expect(PARTICIPANT_STATUS_LABELS.CANCELADO_FALTA).toBe("Faltou")
    expect(PARTICIPANT_STATUS_LABELS.CANCELADO_PROFISSIONAL).toBe("Sem cobrança")
  })
})
