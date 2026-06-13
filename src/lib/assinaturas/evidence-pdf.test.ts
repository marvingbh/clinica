import { describe, it, expect } from "vitest"
import { PDFDocument } from "pdf-lib"
import { appendSignaturePage } from "./evidence-pdf"
import { buildSignaturePageData } from "./signature-page"
import { sha256Hex } from "./hashing"

async function makeMinimalPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.addPage([200, 200])
  return pdf.save()
}

const data = buildSignaturePageData({
  clinicName: "Clínica Exemplo",
  documentTitle: "TCLE — 11/06/2026",
  verificationCode: "K7XF-2MQ9-PA4D",
  originalSha256: "a".repeat(64),
  tz: "America/Sao_Paulo",
  countersigned: false,
  signers: [
    { name: "Maria Silva", cpf: "52998224725", role: "PACIENTE", signedAtIso: "2026-06-11T13:00:00Z" },
  ],
})

describe("appendSignaturePage", () => {
  it("adds exactly one page to a single-page PDF", async () => {
    const original = await makeMinimalPdf()
    const before = await PDFDocument.load(original)
    const out = await appendSignaturePage(original, data)
    const after = await PDFDocument.load(out)
    expect(after.getPageCount()).toBe(before.getPageCount() + 1)
  })

  it("changes the bytes (hash differs) and does not mutate the original", async () => {
    const original = await makeMinimalPdf()
    const originalCopy = original.slice()
    const out = await appendSignaturePage(original, data)
    expect(sha256Hex(out)).not.toBe(sha256Hex(original))
    // original buffer unchanged
    expect(Buffer.from(original).equals(Buffer.from(originalCopy))).toBe(true)
  })
})
