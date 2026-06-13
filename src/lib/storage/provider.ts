/**
 * Storage provider factory. Selects an implementation from the environment and
 * caches a singleton (same pattern as src/lib/prisma.ts).
 *
 * STORAGE_PROVIDER: "vercel-blob" | "fs" | "memory"
 *   default: "vercel-blob" when BLOB_READ_WRITE_TOKEN is present, else "fs".
 *
 * The vercel-blob implementation is imported lazily so dev/test builds (and the
 * vitest suite) never load `@vercel/blob` or require any cloud credentials.
 */

import { FsStorageProvider } from "./fs-provider"
import { MemoryStorageProvider } from "./memory-provider"
import type { StorageProvider, StorageProviderName } from "./types"

let cached: StorageProvider | null = null

export function resolveProviderName(): StorageProviderName {
  const explicit = process.env.STORAGE_PROVIDER as StorageProviderName | undefined
  if (explicit === "vercel-blob" || explicit === "fs" || explicit === "memory") {
    return explicit
  }
  return process.env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "fs"
}

export function isClientUploadProvider(): boolean {
  return resolveProviderName() === "vercel-blob"
}

export function getStorageProvider(): StorageProvider {
  if (cached) return cached
  const name = resolveProviderName()
  if (name === "memory") {
    cached = new MemoryStorageProvider()
  } else if (name === "vercel-blob") {
    // Lazy load so the package is only required when actually selected.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VercelBlobStorageProvider } = require("./vercel-blob") as typeof import("./vercel-blob")
    cached = new VercelBlobStorageProvider()
  } else {
    cached = new FsStorageProvider()
  }
  return cached
}

/** Test/dev helper: replace the cached singleton (e.g. with an in-memory one). */
export function setStorageProvider(provider: StorageProvider | null): void {
  cached = provider
}
