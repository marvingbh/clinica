import { describe, it, expect } from "vitest"
import {
  emptyEvidence,
  parseEvidence,
  appendViewEvent,
  appendOtpEvent,
  markSent,
  finalizeEvidence,
  buildEvidenceSummaryLines,
} from "./evidence"

const TZ = "America/Sao_Paulo"

describe("evidence", () => {
  it("emptyEvidence carries the original hash and empty arrays", () => {
    const ev = emptyEvidence("hash1")
    expect(ev.originalSha256).toBe("hash1")
    expect(ev.viewEvents).toEqual([])
    expect(ev.otpEvents).toEqual([])
    expect(ev.countersigned).toBe(false)
  })

  it("appends are immutable (do not mutate the input)", () => {
    const ev = emptyEvidence("h")
    const withView = appendViewEvent(ev, new Date("2026-06-11T12:00:00Z"), "1.2.3.4", "UA")
    expect(ev.viewEvents).toHaveLength(0)
    expect(withView.viewEvents).toHaveLength(1)
    expect(withView.viewEvents[0]).toMatchObject({ ip: "1.2.3.4", userAgent: "UA" })

    const withOtp = appendOtpEvent(withView, new Date("2026-06-11T12:01:00Z"), "EMAIL", "sent")
    expect(withView.otpEvents).toHaveLength(0)
    expect(withOtp.otpEvents[0]).toMatchObject({ channel: "EMAIL", outcome: "sent" })
  })

  it("parseEvidence tolerates {} and corrupted input", () => {
    expect(parseEvidence({}).viewEvents).toEqual([])
    expect(parseEvidence(null).countersigned).toBe(false)
    expect(parseEvidence("garbage").otpEvents).toEqual([])
    const good = parseEvidence({ viewEvents: [{ at: "x" }], originalSha256: "z", countersigned: true })
    expect(good.originalSha256).toBe("z")
    expect(good.countersigned).toBe(true)
  })

  it("finalizeEvidence records signing details", () => {
    const ev = finalizeEvidence(emptyEvidence("h"), {
      signedAt: new Date("2026-06-11T15:30:00Z"),
      ip: "9.9.9.9",
      countersigned: true,
    })
    expect(ev.signedAt).toBe("2026-06-11T15:30:00.000Z")
    expect(ev.signerIp).toBe("9.9.9.9")
    expect(ev.countersigned).toBe(true)
  })

  it("buildEvidenceSummaryLines formats dates DD/MM/YYYY HH:mm in the clinic tz", () => {
    let ev = markSent(emptyEvidence("h"), new Date("2026-06-11T13:00:00Z"), "EMAIL")
    ev = appendViewEvent(ev, new Date("2026-06-11T13:05:00Z"), "1.1.1.1")
    ev = appendOtpEvent(ev, new Date("2026-06-11T13:06:00Z"), "EMAIL", "verified")
    ev = finalizeEvidence(ev, { signedAt: new Date("2026-06-11T13:07:00Z"), countersigned: false })
    const lines = buildEvidenceSummaryLines(ev, { name: "Maria Silva", cpf: "52998224725", role: "PACIENTE" }, TZ)
    const joined = lines.join("\n")
    // 13:00 UTC = 10:00 in São Paulo (UTC-3)
    expect(joined).toContain("Enviado em: 11/06/2026 10:00")
    expect(joined).toContain("Assinado em: 11/06/2026 10:07")
    expect(joined).toContain("Signatário: Maria Silva (Paciente)")
    expect(joined).toContain("Contra-assinatura ICP-Brasil: Não")
  })
})
