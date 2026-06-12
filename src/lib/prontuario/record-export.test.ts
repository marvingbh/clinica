import { describe, it, expect } from "vitest"
import { buildRecordExportEntries, type RecordExportSourceNote } from "./record-export"

const LABELS = {
  type: { EVOLUCAO: "Evolução", AVALIACAO: "Avaliação" },
  format: { SOAP: "SOAP", DAP: "DAP", LIVRE: "Livre" },
}

function note(over: Partial<RecordExportSourceNote>): RecordExportSourceNote {
  return {
    sessionDate: "2026-03-01T13:00:00.000Z",
    noteType: "EVOLUCAO",
    format: "DAP",
    signedByName: "Dra. Ana",
    signedAt: "2026-03-01T14:00:00.000Z",
    contentHash: "a".repeat(64),
    sections: { dados: "conteúdo", avaliacao: "", plano: "próximo passo" },
    sectionDefs: [
      { id: "dados", label: "Dados" },
      { id: "avaliacao", label: "Avaliação" },
      { id: "plano", label: "Plano" },
    ],
    addenda: [],
    ...over,
  }
}

describe("buildRecordExportEntries", () => {
  it("orders notes chronologically (oldest first)", () => {
    const entries = buildRecordExportEntries(
      [
        note({ sessionDate: "2026-03-10T10:00:00Z" }),
        note({ sessionDate: "2026-01-05T10:00:00Z" }),
        note({ sessionDate: "2026-02-20T10:00:00Z" }),
      ],
      LABELS
    )
    expect(entries.map((e) => new Date(e.sessionDate).getMonth())).toEqual([0, 1, 2])
  })

  it("keeps only non-empty sections, in template order, with labels", () => {
    const [entry] = buildRecordExportEntries([note({})], LABELS)
    expect(entry.sections).toEqual([
      { label: "Dados", text: "conteúdo" },
      { label: "Plano", text: "próximo passo" },
    ])
  })

  it("trims whitespace-only sections out", () => {
    const [entry] = buildRecordExportEntries(
      [note({ sections: { dados: "   ", avaliacao: "ok", plano: "" } })],
      LABELS
    )
    expect(entry.sections).toEqual([{ label: "Avaliação", text: "ok" }])
  })

  it("resolves type/format labels, falling back to the raw value", () => {
    const [entry] = buildRecordExportEntries(
      [note({ noteType: "ENCERRAMENTO" as never, format: "SOAP" })],
      LABELS
    )
    expect(entry.typeLabel).toBe("ENCERRAMENTO") // not in label map → raw
    expect(entry.formatLabel).toBe("SOAP")
  })

  it("preserves addenda", () => {
    const [entry] = buildRecordExportEntries(
      [note({ addenda: [{ createdAt: "2026-03-02T10:00:00Z", authorName: "Dra. Ana", content: "retificação" }] })],
      LABELS
    )
    expect(entry.addenda).toHaveLength(1)
    expect(entry.addenda[0].content).toBe("retificação")
  })
})
