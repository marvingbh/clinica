// src/lib/audit/field-labels.test.ts
import { describe, it, expect } from "vitest"
import { formatFieldValue, computeChanges, FIELD_LABELS } from "./field-labels"

describe("formatFieldValue", () => {
  it("returns em dash for null/undefined", () => {
    expect(formatFieldValue("name", null)).toBe("\u2014")
    expect(formatFieldValue("name", undefined)).toBe("\u2014")
  })

  it("formats booleans as Sim/Nao", () => {
    expect(formatFieldValue("isActive", true)).toBe("Sim")
    expect(formatFieldValue("isActive", false)).toBe("Nao")
  })

  it("formats appointment status enums", () => {
    expect(formatFieldValue("status", "AGENDADO")).toBe("Agendado")
    expect(formatFieldValue("status", "CONFIRMADO")).toBe("Confirmado")
    expect(formatFieldValue("status", "CANCELADO_ACORDADO")).toBe("Desmarcou")
    expect(formatFieldValue("status", "CANCELADO_FALTA")).toBe("Cancelado (Falta)")
    expect(formatFieldValue("status", "CANCELADO_PROFISSIONAL")).toBe("Cancelado (sem cobrança)")
  })

  it("formats modality enums", () => {
    expect(formatFieldValue("modality", "ONLINE")).toBe("Online")
    expect(formatFieldValue("modality", "PRESENCIAL")).toBe("Presencial")
  })

  it("formats appointment type enums", () => {
    expect(formatFieldValue("type", "CONSULTA")).toBe("Consulta")
    expect(formatFieldValue("type", "TAREFA")).toBe("Tarefa")
    expect(formatFieldValue("type", "REUNIAO")).toBe("Reuniao")
  })

  it("formats recurrence type enums", () => {
    expect(formatFieldValue("recurrenceType", "WEEKLY")).toBe("Semanal")
    expect(formatFieldValue("recurrenceType", "BIWEEKLY")).toBe("Quinzenal")
    expect(formatFieldValue("recurrenceType", "MONTHLY")).toBe("Mensal")
  })

  it("formats day of week numbers", () => {
    expect(formatFieldValue("dayOfWeek", 0)).toBe("Domingo")
    expect(formatFieldValue("dayOfWeek", 1)).toBe("Segunda-feira")
    expect(formatFieldValue("dayOfWeek", 6)).toBe("Sabado")
  })

  it("formats currency fields as BRL", () => {
    expect(formatFieldValue("price", 150.5)).toBe("R$ 150,50")
    expect(formatFieldValue("sessionFee", 200)).toBe("R$ 200,00")
    expect(formatFieldValue("price", 0)).toBe("R$ 0,00")
  })

  it("returns raw string for unknown fields", () => {
    expect(formatFieldValue("unknownField", "hello")).toBe("hello")
    expect(formatFieldValue("unknownField", 42)).toBe("42")
  })

  it("returns raw string for unknown enum values", () => {
    expect(formatFieldValue("status", "UNKNOWN_STATUS")).toBe("UNKNOWN_STATUS")
  })
})

describe("computeChanges", () => {
  it("returns empty array for null inputs", () => {
    expect(computeChanges(null, null)).toEqual([])
    expect(computeChanges(undefined, undefined)).toEqual([])
  })

  it("detects changed fields between old and new values", () => {
    const old = { name: "Alice", phone: "111" }
    const nw = { name: "Bob", phone: "111" }
    const changes = computeChanges(old, nw)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({
      field: "name",
      label: "Nome",
      oldValue: "Alice",
      newValue: "Bob",
    })
  })

  it("excludes internal fields like id, clinicId, createdAt", () => {
    const old = { id: "1", clinicId: "c1", createdAt: "a", name: "Alice" }
    const nw = { id: "2", clinicId: "c2", createdAt: "b", name: "Bob" }
    const changes = computeChanges(old, nw)

    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe("name")
  })

  it("handles fields only in oldValues (removed)", () => {
    const old = { name: "Alice", phone: "111" }
    const nw = { name: "Alice" }
    const changes = computeChanges(old, nw)

    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe("phone")
    expect(changes[0].oldValue).toBe("111")
    expect(changes[0].newValue).toBe("\u2014") // undefined → em dash
  })

  it("handles fields only in newValues (added)", () => {
    const old = { name: "Alice" }
    const nw = { name: "Alice", phone: "222" }
    const changes = computeChanges(old, nw)

    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe("phone")
    expect(changes[0].oldValue).toBe("\u2014")
    expect(changes[0].newValue).toBe("222")
  })

  it("uses FIELD_LABELS for known fields, raw name for unknown", () => {
    const old = { customThing: "a" }
    const nw = { customThing: "b" }
    const changes = computeChanges(old, nw)

    expect(changes[0].label).toBe("customThing") // no label mapped
  })

  it("formats enum values in changes", () => {
    const old = { status: "AGENDADO" }
    const nw = { status: "CONFIRMADO" }
    const changes = computeChanges(old, nw)

    expect(changes[0].oldValue).toBe("Agendado")
    expect(changes[0].newValue).toBe("Confirmado")
  })

  it("skips fields where JSON representation is equal", () => {
    const old = { notes: "hello" }
    const nw = { notes: "hello" }
    expect(computeChanges(old, nw)).toEqual([])
  })
})
