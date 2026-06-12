import { describe, it, expect } from "vitest"
import {
  buildUpdateRequestPayload,
  summarizePortalRequest,
  rescheduleTodoTitle,
  changesToPatientUpdate,
} from "./requests"
import type { PortalPatientProfile } from "./serialize"

const current: PortalPatientProfile = {
  id: "p1",
  name: "Carlos",
  displayName: "Carlos",
  phone: "11999999999",
  email: "carlos@example.com",
  addressStreet: "Rua A",
  addressNumber: "100",
  addressNeighborhood: "Centro",
  addressCity: "São Paulo",
  addressState: "SP",
  addressZip: "01000000",
  consentWhatsApp: true,
  consentEmail: false,
}

describe("buildUpdateRequestPayload", () => {
  it("ignores fields that are unchanged", () => {
    expect(buildUpdateRequestPayload(current, { name: "Carlos", phone: "11999999999" })).toEqual([])
  })

  it("captures changed fields with current and requested values", () => {
    const changes = buildUpdateRequestPayload(current, { phone: "11900000000", addressCity: "Rio" })
    expect(changes).toEqual([
      { field: "phone", current: "11999999999", requested: "11900000000" },
      { field: "addressCity", current: "São Paulo", requested: "Rio" },
    ])
  })

  it("treats empty string as clearing the field (null)", () => {
    const changes = buildUpdateRequestPayload(current, { email: "" })
    expect(changes).toEqual([{ field: "email", current: "carlos@example.com", requested: null }])
  })

  it("drops keys that are not in the allow-list (e.g. sessionFee)", () => {
    const changes = buildUpdateRequestPayload(current, {
      sessionFee: "9999",
      cpf: "00000000000",
    } as Record<string, string>)
    expect(changes).toEqual([])
  })

  it("ignores fields not present in the requested object", () => {
    const changes = buildUpdateRequestPayload(current, {})
    expect(changes).toEqual([])
  })
})

describe("summarizePortalRequest", () => {
  it("summarizes a reschedule with preferences", () => {
    const text = summarizePortalRequest({
      type: "RESCHEDULE",
      payload: { message: "Manhãs, por favor", preferences: [{}, {}] },
    })
    expect(text).toContain("reagendamento")
    expect(text).toContain("Manhãs")
    expect(text).toContain("2 preferência")
  })

  it("summarizes an update-data request with field labels", () => {
    const text = summarizePortalRequest({
      type: "UPDATE_DATA",
      payload: { changes: [{ field: "phone", current: "a", requested: "b" }] },
    })
    expect(text).toContain("Atualização de dados")
    expect(text).toContain("Telefone")
  })

  it("summarizes an LGPD export", () => {
    expect(summarizePortalRequest({ type: "LGPD_EXPORT", payload: {} })).toContain("LGPD")
  })
})

describe("changesToPatientUpdate", () => {
  it("maps allow-listed fields to an update object", () => {
    const update = changesToPatientUpdate([
      { field: "phone", current: "a", requested: "11900000000" },
      { field: "email", current: "x@y.com", requested: null },
    ])
    expect(update).toEqual({ phone: "11900000000", email: null })
  })

  it("drops any non-allow-listed field that sneaks in", () => {
    const update = changesToPatientUpdate([
      { field: "sessionFee" as never, current: "1", requested: "9999" },
      { field: "addressCity", current: "SP", requested: "Rio" },
    ])
    expect(update).toEqual({ addressCity: "Rio" })
  })

  it("returns an empty object for no changes", () => {
    expect(changesToPatientUpdate(undefined)).toEqual({})
    expect(changesToPatientUpdate([])).toEqual({})
  })
})

describe("rescheduleTodoTitle", () => {
  it("formats DD/MM HH:mm in local time", () => {
    // Build with explicit local components so it is timezone-independent
    const scheduledAt = new Date(2026, 5, 9, 14, 30) // 09/06 14:30 local
    expect(rescheduleTodoTitle({ patientName: "Ana", scheduledAt })).toBe(
      "Reagendar: Ana — 09/06 14:30",
    )
  })
})
