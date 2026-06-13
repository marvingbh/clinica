import { describe, it, expect } from "vitest"
import { mockProvider } from "./mock"
import type { TelehealthConfig } from "../types"

const config: TelehealthConfig = { provider: "mock", jitsiDomain: null, configured: true }
const room = { roomName: "clinica-mock1" }

describe("mockProvider", () => {
  it("returns a deterministic shape on mock.local", () => {
    const prof = mockProvider(config).professionalJoinInfo(room, "Dra. Maria")
    expect(prof).toEqual({
      provider: "mock",
      domain: "mock.local",
      roomName: "clinica-mock1",
      displayName: "Dra. Maria",
      isModerator: true,
      subject: "Teleconsulta",
    })
  })

  it("patient is not a moderator", () => {
    expect(mockProvider(config).patientJoinInfo(room, "João").isModerator).toBe(false)
  })

  it("id is mock", () => {
    expect(mockProvider(config).id).toBe("mock")
  })
})
