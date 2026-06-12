import { describe, it, expect, vi, beforeEach } from "vitest"
import Anthropic from "@anthropic-ai/sdk"
import { createAnthropicProvider } from "./anthropic"
import { buildNoteDraftPrompt } from "../prompt"
import type { DraftRequest } from "../types"

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

// Mock the Anthropic SDK: default export is a constructor whose instances have
// `messages.create`, plus the typed error classes used by the provider. Both
// the classes and the mock fn must be created INSIDE the hoisted factory.
vi.mock("@anthropic-ai/sdk", () => {
  class FakeAPIError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  class FakeRateLimitError extends FakeAPIError {}

  function FakeAnthropic(this: { messages: { create: typeof createMock } }) {
    this.messages = { create: createMock }
  }
  ;(FakeAnthropic as unknown as { APIError: unknown }).APIError = FakeAPIError
  ;(FakeAnthropic as unknown as { RateLimitError: unknown }).RateLimitError = FakeRateLimitError
  return { default: FakeAnthropic }
})

// Re-read the mocked error classes off the (mocked) default export.
const FakeAPIError = (Anthropic as unknown as { APIError: new (s: number, m: string) => Error }).APIError
const FakeRateLimitError = (
  Anthropic as unknown as { RateLimitError: new (s: number, m: string) => Error }
).RateLimitError

const req: DraftRequest = {
  format: "SOAP",
  sections: [
    { key: "subjetivo", label: "Subjetivo" },
    { key: "plano", label: "Plano" },
  ],
  roughInput: "paciente relatou melhora",
}

describe("createAnthropicProvider", () => {
  beforeEach(() => {
    createMock.mockReset()
  })

  it("returns ok:false with missing_api_key when no key is configured", async () => {
    const provider = createAnthropicProvider({ apiKey: undefined })
    const r = await provider.generateNoteDraft(buildNoteDraftPrompt(req))
    expect(r.ok).toBe(false)
    expect(r.error).toBe("missing_api_key")
  })

  it("parses a happy-path structured response", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({ subjetivo: "ok", plano: "manter" }) }],
      usage: { input_tokens: 120, output_tokens: 40 },
    })
    const provider = createAnthropicProvider({ apiKey: "sk-test" })
    const r = await provider.generateNoteDraft(buildNoteDraftPrompt(req))
    expect(r.ok).toBe(true)
    expect(r.sections).toEqual({ subjetivo: "ok", plano: "manter" })
    expect(r.tokensIn).toBe(120)
    expect(r.tokensOut).toBe(40)
  })

  it("maps RateLimitError to a rate_limited error (never throws)", async () => {
    createMock.mockRejectedValueOnce(new FakeRateLimitError(429, "slow down"))
    const provider = createAnthropicProvider({ apiKey: "sk-test" })
    const r = await provider.generateNoteDraft(buildNoteDraftPrompt(req))
    expect(r.ok).toBe(false)
    expect(r.error).toBe("rate_limited")
  })

  it("maps a generic APIError to api_error_<status> (never throws)", async () => {
    createMock.mockRejectedValueOnce(new FakeAPIError(500, "boom"))
    const provider = createAnthropicProvider({ apiKey: "sk-test" })
    const r = await provider.generateNoteDraft(buildNoteDraftPrompt(req))
    expect(r.ok).toBe(false)
    expect(r.error).toBe("api_error_500")
  })

  it("returns no_text_block when the response has no text content", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
      usage: { input_tokens: 10, output_tokens: 0 },
    })
    const provider = createAnthropicProvider({ apiKey: "sk-test" })
    const r = await provider.generateNoteDraft(buildNoteDraftPrompt(req))
    expect(r.ok).toBe(false)
    expect(r.error).toBe("no_text_block")
  })

  it("returns invalid_json when the text block is not JSON", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "not json at all" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })
    const provider = createAnthropicProvider({ apiKey: "sk-test" })
    const r = await provider.generateNoteDraft(buildNoteDraftPrompt(req))
    expect(r.ok).toBe(false)
    expect(r.error).toBe("invalid_json")
  })
})
