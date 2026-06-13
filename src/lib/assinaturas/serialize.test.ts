import { describe, it, expect } from "vitest"
import {
  toPublicSigningView,
  toVerificationResult,
  maskName,
  type EnvelopeRow,
  type RequestRow,
} from "./serialize"

function req(over: Partial<RequestRow>): RequestRow {
  return {
    id: "r1",
    signerName: "Maria Aparecida Silva",
    signerCpf: "52998224725",
    signerEmail: "maria@gmail.com",
    signerPhone: null,
    role: "PACIENTE",
    signingOrder: 1,
    status: "ASSINADO",
    expiresAt: new Date("2026-07-01T00:00:00Z"),
    viewedAt: null,
    signedAt: new Date("2026-06-11T13:00:00Z"),
    declinedAt: null,
    declineReason: null,
    otpChannel: "EMAIL",
    linkSentAt: new Date("2026-06-01T00:00:00Z"),
    evidence: {},
    ...over,
  }
}

describe("maskName", () => {
  it("keeps the first name and the last initial", () => {
    expect(maskName("Maria Aparecida Silva")).toBe("Maria S.")
    expect(maskName("João")).toBe("João")
  })
})

describe("toPublicSigningView", () => {
  it("does not leak request id or evidence and masks contacts", () => {
    const view = toPublicSigningView(req({}), { name: "Clínica X" }, "TCLE")
    expect(view).not.toHaveProperty("id")
    expect(view).not.toHaveProperty("evidence")
    expect(view.signerName).toBe("Maria Aparecida Silva")
    expect(view.hasCpfOnFile).toBe(true)
    expect(view.availableChannels).toEqual(["EMAIL"])
    expect(view.maskedEmail).toBe("m***a@g***l.com")
  })
})

describe("toVerificationResult", () => {
  it("masks names and CPFs and exposes only public fields", () => {
    const envelope: EnvelopeRow & { clinicName: string; documentTitle: string } = {
      id: "e1",
      status: "CONCLUIDO",
      documentId: "d1",
      patientId: "p1",
      verificationCode: "K7XF-2MQ9-PA4D",
      signedSha256: "finalhash",
      originalSha256: "orig",
      countersignedAt: new Date("2026-06-11T13:05:00Z"),
      completedAt: new Date("2026-06-11T13:05:00Z"),
      createdAt: new Date("2026-06-01T00:00:00Z"),
      clinicName: "Clínica X",
      documentTitle: "TCLE",
    }
    const result = toVerificationResult(envelope, [req({})])
    expect(result.valido).toBe(true)
    expect(result.signatarios?.[0].nome).toBe("Maria S.")
    expect(result.signatarios?.[0].cpf).toBe("***.982.247-**")
    expect(result.sha256Final).toBe("finalhash")
    expect(result.contraAssinaturaICP).toBe(true)
    // No internal ids leaked
    expect(JSON.stringify(result)).not.toContain("patientId")
  })
})
