import { describe, it, expect, vi } from "vitest"
import { generateDraft, type GenerateDraftInput } from "./generate-draft"
import { buildEntityMap } from "./pseudonymize"
import type { AiDraftProvider, AssembledPrompt, ProviderResult } from "./types"

const sections = [
  { key: "subjetivo", label: "Subjetivo" },
  { key: "plano", label: "Plano" },
]

function baseInput(overrides: Partial<GenerateDraftInput> = {}): GenerateDraftInput {
  return {
    clinic: { aiEnabled: true, aiHistoryContext: false },
    user: { aiOptOut: false },
    credit: { allowed: true, remaining: 5 },
    patientEntities: buildEntityMap({ name: "Mariana Costa" }),
    format: "SOAP",
    sections,
    roughInput: "Mariana Costa relatou melhora no sono.",
    ...overrides,
  }
}

/** A provider that echoes the prompt back so we can inspect what was sent. */
function makeSpyProvider(result?: Partial<ProviderResult>): {
  provider: AiDraftProvider
  calls: AssembledPrompt[]
} {
  const calls: AssembledPrompt[] = []
  const provider: AiDraftProvider = {
    name: "spy",
    model: "spy",
    async generateNoteDraft(prompt) {
      calls.push(prompt)
      return {
        ok: true,
        sections: { subjetivo: "[PACIENTE] dormiu bem", plano: "manter conduta" },
        tokensIn: 100,
        tokensOut: 50,
        ...result,
      }
    },
  }
  return { provider, calls }
}

describe("generateDraft", () => {
  it("blocks when the clinic has AI disabled (provider not called)", async () => {
    const { provider, calls } = makeSpyProvider()
    const out = await generateDraft(baseInput({ clinic: { aiEnabled: false, aiHistoryContext: false } }), provider)
    expect(out.kind).toBe("blocked")
    if (out.kind === "blocked") expect(out.reason).toBe("disabled")
    expect(calls).toHaveLength(0)
  })

  it("blocks when the user opted out (provider not called)", async () => {
    const { provider, calls } = makeSpyProvider()
    const out = await generateDraft(baseInput({ user: { aiOptOut: true } }), provider)
    expect(out.kind).toBe("blocked")
    if (out.kind === "blocked") expect(out.reason).toBe("opt_out")
    expect(calls).toHaveLength(0)
  })

  it("blocks when there are no credits (provider not called)", async () => {
    const generateSpy = vi.fn()
    const provider: AiDraftProvider = { name: "x", model: "x", generateNoteDraft: generateSpy }
    const out = await generateDraft(
      baseInput({ credit: { allowed: false, remaining: 0, message: "sem créditos" } }),
      provider
    )
    expect(out.kind).toBe("blocked")
    if (out.kind === "blocked") {
      expect(out.reason).toBe("no_credits")
      expect(out.message).toBe("sem créditos")
    }
    expect(generateSpy).not.toHaveBeenCalled()
  })

  it("returns failed with token counts when the provider returns ok:false", async () => {
    const { provider } = makeSpyProvider({ ok: false, sections: undefined, tokensIn: 7, tokensOut: 0 })
    const out = await generateDraft(baseInput(), provider)
    expect(out.kind).toBe("failed")
    if (out.kind === "failed") {
      expect(out.tokensIn).toBe(7)
      expect(out.message).toMatch(/preservado/)
    }
  })

  it("succeeds and re-identifies the patient's real name in the sections", async () => {
    const { provider } = makeSpyProvider()
    const out = await generateDraft(baseInput(), provider)
    expect(out.kind).toBe("success")
    if (out.kind === "success") {
      expect(out.sections.subjetivo).toContain("Mariana Costa")
      expect(out.sections.subjetivo).not.toContain("[PACIENTE]")
    }
  })

  it("propagates the truncated flag", async () => {
    const { provider } = makeSpyProvider()
    const longInput = "Mariana Costa " + "palavra ".repeat(5000)
    const out = await generateDraft(baseInput({ roughInput: longInput }), provider)
    expect(out.kind).toBe("success")
    if (out.kind === "success") expect(out.truncated).toBe(true)
  })

  it("never sends the patient's real name to the provider (pseudonymized prompt)", async () => {
    const { provider, calls } = makeSpyProvider()
    await generateDraft(baseInput(), provider)
    expect(calls).toHaveLength(1)
    expect(calls[0].user).not.toContain("Mariana Costa")
    expect(calls[0].user).toContain("[PACIENTE]")
  })

  it("pseudonymizes historyContext before the prompt when enabled", async () => {
    const { provider, calls } = makeSpyProvider()
    await generateDraft(
      baseInput({
        clinic: { aiEnabled: true, aiHistoryContext: true },
        historyContext: ["Mariana Costa esteve presente na sessão anterior."],
      }),
      provider
    )
    expect(calls[0].user).toMatch(/notas anteriores/)
    expect(calls[0].user).not.toContain("Mariana Costa")
  })

  it("omits historyContext when the clinic flag is off", async () => {
    const { provider, calls } = makeSpyProvider()
    await generateDraft(
      baseInput({
        clinic: { aiEnabled: true, aiHistoryContext: false },
        historyContext: ["alguma nota anterior"],
      }),
      provider
    )
    expect(calls[0].user).not.toMatch(/notas anteriores/)
  })
})
