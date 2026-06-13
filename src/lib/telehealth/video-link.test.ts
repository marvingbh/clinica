import { describe, it, expect } from "vitest"
import {
  buildPatientVideoUrl,
  resolveVideoLinkForNotification,
  stripUnresolvedVideoLines,
  renderWithVideoLink,
} from "./video-link"
import { buildVideoToken } from "./video-tokens"

const SECRET = "test-secret"
const BASE = "https://app.clinica.com"

describe("buildPatientVideoUrl", () => {
  it("builds /teleconsulta/<token>", () => {
    const url = buildPatientVideoUrl(BASE, "appt-1", SECRET)
    expect(url).toBe(`${BASE}/teleconsulta/${buildVideoToken("appt-1", SECRET)}`)
  })
})

describe("resolveVideoLinkForNotification", () => {
  const base = {
    clinic: { telehealthEnabled: true },
    config: { configured: true },
    baseUrl: BASE,
    secret: SECRET,
  }

  it("returns null for PRESENCIAL", () => {
    expect(
      resolveVideoLinkForNotification({
        ...base,
        appointment: { id: "a", type: "CONSULTA", modality: "PRESENCIAL", meetingUrl: null },
      })
    ).toBeNull()
  })

  it("returns null for non-CONSULTA", () => {
    expect(
      resolveVideoLinkForNotification({
        ...base,
        appointment: { id: "a", type: "TAREFA", modality: "ONLINE", meetingUrl: null },
      })
    ).toBeNull()
  })

  it("returns null when toggle is off (no meetingUrl)", () => {
    expect(
      resolveVideoLinkForNotification({
        ...base,
        clinic: { telehealthEnabled: false },
        appointment: { id: "a", type: "CONSULTA", modality: "ONLINE", meetingUrl: null },
      })
    ).toBeNull()
  })

  it("returns null when platform not configured (no meetingUrl)", () => {
    expect(
      resolveVideoLinkForNotification({
        ...base,
        config: { configured: false },
        appointment: { id: "a", type: "CONSULTA", modality: "ONLINE", meetingUrl: null },
      })
    ).toBeNull()
  })

  it("external meetingUrl takes priority (RN-06) even when not configured", () => {
    expect(
      resolveVideoLinkForNotification({
        ...base,
        config: { configured: false },
        appointment: {
          id: "a",
          type: "CONSULTA",
          modality: "ONLINE",
          meetingUrl: "https://meet.example/abc",
        },
      })
    ).toBe("https://meet.example/abc")
  })

  it("builds embedded URL for ONLINE + enabled + configured", () => {
    const link = resolveVideoLinkForNotification({
      ...base,
      appointment: { id: "a", type: "CONSULTA", modality: "ONLINE", meetingUrl: null },
    })
    expect(link).toBe(buildPatientVideoUrl(BASE, "a", SECRET))
  })
})

describe("stripUnresolvedVideoLines", () => {
  it("removes only the line with the unresolved placeholder", () => {
    const content = "Olá!\n💻 Teleconsulta — acesse: {{videoLink}}\nAté logo."
    expect(stripUnresolvedVideoLines(content)).toBe("Olá!\nAté logo.")
  })

  it("preserves everything when no placeholder remains", () => {
    const content = "Olá!\nLinha dois.\n\nLinha quatro."
    expect(stripUnresolvedVideoLines(content)).toBe(content)
  })
})

describe("renderWithVideoLink", () => {
  it("substitutes videoLink when provided", () => {
    const tmpl = "Olá {{patientName}}!\n💻 Acesse: {{videoLink}}\nFim."
    const out = renderWithVideoLink(tmpl, { patientName: "Ana", videoLink: "https://x/y" })
    expect(out).toBe("Olá Ana!\n💻 Acesse: https://x/y\nFim.")
  })

  it("drops the line when videoLink is absent", () => {
    const tmpl = "Olá {{patientName}}!\n💻 Acesse: {{videoLink}}\nFim."
    const out = renderWithVideoLink(tmpl, { patientName: "Ana" })
    expect(out).toBe("Olá Ana!\nFim.")
  })
})
