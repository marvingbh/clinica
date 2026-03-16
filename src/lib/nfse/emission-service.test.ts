import { describe, it, expect } from "vitest"
import {
  determineEmissionMode,
  buildPerItemEmissions,
  computeAggregateNfseStatus,
} from "./emission-service"

describe("determineEmissionMode", () => {
  it("returns per-invoice when nfsePerAppointment is false", () => {
    expect(determineEmissionMode({ nfsePerAppointment: false })).toBe("per-invoice")
  })

  it("returns per-item when nfsePerAppointment is true", () => {
    expect(determineEmissionMode({ nfsePerAppointment: true })).toBe("per-item")
  })
})

describe("buildPerItemEmissions", () => {
  it("creates one plan per billable item", () => {
    const items = [
      { id: "i1", type: "SESSAO_REGULAR", total: 540, description: "Sessao 05/03" },
      { id: "i2", type: "SESSAO_REGULAR", total: 540, description: "Sessao 12/03" },
    ]
    const plans = buildPerItemEmissions(items)
    expect(plans).toHaveLength(2)
    expect(plans[0]).toEqual({ invoiceItemId: "i1", valor: 540, descricao: "Sessao 05/03" })
    expect(plans[1]).toEqual({ invoiceItemId: "i2", valor: 540, descricao: "Sessao 12/03" })
  })

  it("skips CREDITO items", () => {
    const items = [
      { id: "i1", type: "SESSAO_REGULAR", total: 540, description: "Sessao 05/03" },
      { id: "i2", type: "CREDITO", total: -540, description: "Credito cancelamento" },
      { id: "i3", type: "SESSAO_EXTRA", total: 300, description: "Sessao extra" },
    ]
    const plans = buildPerItemEmissions(items)
    expect(plans).toHaveLength(2)
    expect(plans.map(p => p.invoiceItemId)).toEqual(["i1", "i3"])
  })

  it("returns empty array when no items", () => {
    expect(buildPerItemEmissions([])).toEqual([])
  })

  it("returns empty array when all items are CREDITO", () => {
    const items = [
      { id: "i1", type: "CREDITO", total: -200, description: "Credito" },
    ]
    expect(buildPerItemEmissions(items)).toEqual([])
  })

  it("handles string totals (from Prisma Decimal)", () => {
    const items = [
      { id: "i1", type: "SESSAO_REGULAR", total: "540.00", description: "Sessao" },
    ]
    const plans = buildPerItemEmissions(items)
    expect(plans[0].valor).toBe(540)
  })

  it("handles Decimal-like objects with toNumber()", () => {
    const items = [
      { id: "i1", type: "SESSAO_REGULAR", total: { toNumber: () => 540 }, description: "Sessao" },
    ]
    const plans = buildPerItemEmissions(items)
    expect(plans[0].valor).toBe(540)
  })

  it("includes SESSAO_GRUPO items", () => {
    const items = [
      { id: "i1", type: "SESSAO_GRUPO", total: 200, description: "Sessao grupo 10/03" },
    ]
    const plans = buildPerItemEmissions(items)
    expect(plans).toHaveLength(1)
  })

  it("includes REUNIAO_ESCOLA items", () => {
    const items = [
      { id: "i1", type: "REUNIAO_ESCOLA", total: 150, description: "Reuniao escola" },
    ]
    const plans = buildPerItemEmissions(items)
    expect(plans).toHaveLength(1)
  })
})

describe("computeAggregateNfseStatus", () => {
  it("returns null for empty array", () => {
    expect(computeAggregateNfseStatus([])).toBeNull()
  })

  it("returns PENDENTE when all PENDENTE", () => {
    expect(computeAggregateNfseStatus(["PENDENTE", "PENDENTE"])).toBe("PENDENTE")
  })

  it("returns EMITIDA when all EMITIDA", () => {
    expect(computeAggregateNfseStatus(["EMITIDA", "EMITIDA"])).toBe("EMITIDA")
  })

  it("returns ERRO when all ERRO", () => {
    expect(computeAggregateNfseStatus(["ERRO", "ERRO"])).toBe("ERRO")
  })

  it("returns CANCELADA when all CANCELADA", () => {
    expect(computeAggregateNfseStatus(["CANCELADA", "CANCELADA"])).toBe("CANCELADA")
  })

  it("returns PARCIAL when mix of EMITIDA and PENDENTE", () => {
    expect(computeAggregateNfseStatus(["EMITIDA", "PENDENTE"])).toBe("PARCIAL")
  })

  it("returns PARCIAL when mix of EMITIDA and ERRO", () => {
    expect(computeAggregateNfseStatus(["EMITIDA", "ERRO"])).toBe("PARCIAL")
  })

  it("returns PARCIAL when mix of EMITIDA and CANCELADA", () => {
    expect(computeAggregateNfseStatus(["EMITIDA", "CANCELADA"])).toBe("PARCIAL")
  })

  it("returns PENDENTE when mix of PENDENTE and ERRO (no EMITIDA)", () => {
    expect(computeAggregateNfseStatus(["PENDENTE", "ERRO"])).toBe("PENDENTE")
  })

  it("returns ERRO when mix of ERRO and CANCELADA (no EMITIDA or PENDENTE)", () => {
    expect(computeAggregateNfseStatus(["ERRO", "CANCELADA"])).toBe("ERRO")
  })

  it("handles single status", () => {
    expect(computeAggregateNfseStatus(["EMITIDA"])).toBe("EMITIDA")
    expect(computeAggregateNfseStatus(["PENDENTE"])).toBe("PENDENTE")
  })

  it("handles complex mix: EMITIDA + PENDENTE + ERRO", () => {
    expect(computeAggregateNfseStatus(["EMITIDA", "PENDENTE", "ERRO"])).toBe("PARCIAL")
  })
})
