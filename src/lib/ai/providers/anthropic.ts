/**
 * Real Anthropic provider. Never throws to the route — failures are returned as
 * `{ ok: false, error }`. Uses structured output (`output_config.format` with a
 * json_schema) so the response is guaranteed to match the requested sections.
 *
 * Model default: claude-opus-4-8 (configurable via AI_MODEL; claude-sonnet-4-6
 * is a cheaper alternative). No temperature / no prefill (removed on these models).
 */

import Anthropic from "@anthropic-ai/sdk"
import type { AiDraftProvider, AssembledPrompt, ProviderResult, SectionMap } from "../types"

const DEFAULT_MODEL = "claude-opus-4-8"
const MAX_TOKENS = 4096

export function createAnthropicProvider(options?: { apiKey?: string; model?: string }): AiDraftProvider {
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY
  const model = options?.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL

  return {
    name: "anthropic",
    model,
    async generateNoteDraft(prompt: AssembledPrompt): Promise<ProviderResult> {
      if (!apiKey) {
        return { ok: false, tokensIn: 0, tokensOut: 0, error: "missing_api_key" }
      }

      try {
        const client = new Anthropic({ apiKey })
        // Cast to satisfy the SDK's typed surface — output_config.format with a
        // json_schema is the structured-output API (guarantees JSON matching schema).
        const response = await client.messages.create({
          model,
          max_tokens: MAX_TOKENS,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          output_config: {
            format: { type: "json_schema", schema: prompt.schema },
          },
        } as Anthropic.MessageCreateParamsNonStreaming)

        const tokensIn = response.usage?.input_tokens ?? 0
        const tokensOut = response.usage?.output_tokens ?? 0

        const textBlock = response.content.find((b) => b.type === "text")
        if (!textBlock || textBlock.type !== "text") {
          return { ok: false, tokensIn, tokensOut, error: "no_text_block" }
        }

        let sections: SectionMap
        try {
          sections = JSON.parse(textBlock.text) as SectionMap
        } catch {
          return { ok: false, tokensIn, tokensOut, error: "invalid_json" }
        }

        return { ok: true, sections, tokensIn, tokensOut }
      } catch (error) {
        return { ok: false, tokensIn: 0, tokensOut: 0, error: technicalMessage(error) }
      }
    },
  }
}

function technicalMessage(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) return "rate_limited"
  if (error instanceof Anthropic.APIError) return `api_error_${error.status ?? "unknown"}`
  if (error instanceof Error) return error.message
  return "unknown_error"
}
