import { describe, it, expect } from "vitest"
import { buildSignaturePageData } from "./signature-page"

const TZ = "America/Sao_Paulo"

describe("buildSignaturePageData", () => {
  const data = buildSignaturePageData({
    clinicName: "Clínica Exemplo",
    documentTitle: "TCLE — 11/06/2026",
    verificationCode: "K7XF-2MQ9-PA4D",
    originalSha256: "deadbeef",
    tz: TZ,
    countersigned: true,
    signers: [
      { name: "Maria Silva", cpf: "52998224725", role: "PACIENTE", signedAtIso: "2026-06-11T13:00:00Z", ip: "1.1.1.1", channel: "EMAIL" },
      { name: "João Souza", cpf: null, role: "RESPONSAVEL", signedAtIso: "2026-06-11T13:30:00Z" },
    ],
  })

  it("includes pt-BR title and clinic/document lines", () => {
    expect(data.title).toBe("PÁGINA DE ASSINATURAS")
    expect(data.clinicLine).toContain("Clínica Exemplo")
    expect(data.documentLine).toContain("TCLE")
  })

  it("prints verification code and original sha256", () => {
    expect(data.verificationLine).toContain("K7XF-2MQ9-PA4D")
    expect(data.hashLine).toContain("deadbeef")
  })

  it("has one block per signer with masked CPF and formatted date", () => {
    expect(data.signerBlocks).toHaveLength(2)
    const first = data.signerBlocks[0].join("\n")
    expect(first).toContain("Maria Silva")
    expect(first).toContain("***.982.247-**")
    expect(first).toContain("Assinado em: 11/06/2026 10:00")
    expect(first).toContain("Paciente")
    const second = data.signerBlocks[1].join("\n")
    expect(second).toContain("Responsável")
  })

  it("flags the ICP-Brasil countersignature", () => {
    expect(data.countersignLine).toContain("Sim")
  })
})
