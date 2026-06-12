/**
 * Provider selection by env. Defaults to the deterministic mock in dev/tests
 * when no ANTHROPIC_API_KEY is present, and to the real Anthropic provider
 * otherwise. AI_PROVIDER forces a specific provider.
 */

import type { AiDraftProvider } from "./types"
import { mockProvider } from "./providers/mock"
import { createAnthropicProvider } from "./providers/anthropic"

export function getAiProvider(): AiDraftProvider {
  const explicit = process.env.AI_PROVIDER
  if (explicit === "mock") return mockProvider
  if (explicit === "anthropic") return createAnthropicProvider()

  // Default: anthropic when a key is configured, otherwise the mock.
  return process.env.ANTHROPIC_API_KEY ? createAnthropicProvider() : mockProvider
}
