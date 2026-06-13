import { describe, it, expect } from "vitest"
import { jitsiProvider } from "./jitsi"
import type { TelehealthConfig } from "../types"

const config: TelehealthConfig = {
  provider: "jitsi",
  jitsiDomain: "meet.suaclinica.com.br",
  configured: true,
}

const room = { roomName: "clinica-abc123" }

describe("jitsiProvider", () => {
  it("marks the professional as moderator", () => {
    const info = jitsiProvider(config).professionalJoinInfo(room, "Dra. Maria")
    expect(info.isModerator).toBe(true)
    expect(info.displayName).toBe("Dra. Maria")
  })

  it("marks the patient as non-moderator", () => {
    const info = jitsiProvider(config).patientJoinInfo(room, "João")
    expect(info.isModerator).toBe(false)
  })

  it("uses the domain from config", () => {
    const info = jitsiProvider(config).patientJoinInfo(room, "João")
    expect(info.domain).toBe("meet.suaclinica.com.br")
    expect(info.provider).toBe("jitsi")
  })

  it("passes the room name through unchanged", () => {
    const info = jitsiProvider(config).patientJoinInfo(room, "João")
    expect(info.roomName).toBe("clinica-abc123")
  })

  it("uses a PII-free subject", () => {
    const info = jitsiProvider(config).patientJoinInfo(room, "João")
    expect(info.subject).toBe("Teleconsulta")
    expect(info.subject).not.toContain("João")
  })

  it("documents a participant cap", () => {
    expect(jitsiProvider(config).maxParticipants).toBe(25)
  })
})
