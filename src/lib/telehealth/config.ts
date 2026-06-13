import type { TelehealthConfig, VideoProvider, VideoProviderId } from "./types"
import { jitsiProvider } from "./providers/jitsi"
import { mockProvider } from "./providers/mock"

/**
 * The single impure boundary of the telehealth module: reads environment
 * variables. Everything downstream consumes the resulting plain config object,
 * keeping the rest of the module pure and testable.
 */
export function getTelehealthConfig(): TelehealthConfig {
  const envProvider = process.env.TELEHEALTH_PROVIDER as VideoProviderId | undefined
  const provider: VideoProviderId =
    envProvider === "jitsi" || envProvider === "mock"
      ? envProvider
      : process.env.NODE_ENV === "test"
        ? "mock"
        : "jitsi"

  const jitsiDomain = process.env.TELEHEALTH_JITSI_DOMAIN || null
  const configured = provider === "mock" || jitsiDomain != null

  return { provider, jitsiDomain, configured }
}

export function getVideoProvider(config: TelehealthConfig): VideoProvider {
  return config.provider === "mock"
    ? mockProvider(config)
    : jitsiProvider(config)
}
