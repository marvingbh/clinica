/**
 * In-memory {@link StorageProvider} for vitest and ephemeral dev use.
 * Backed by a Map; no filesystem or network access.
 */

import type {
  DownloadStream,
  PutOptions,
  StorageProvider,
  StoredObject,
} from "./types"

interface MemoryEntry {
  bytes: Uint8Array
  mimeType: string
  uploadedAt: Date
}

function toStream(bytes: Uint8Array): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

export class MemoryStorageProvider implements StorageProvider {
  private store = new Map<string, MemoryEntry>()

  async put(
    key: string,
    body: Buffer | Uint8Array,
    opts: PutOptions
  ): Promise<void> {
    const bytes = body instanceof Uint8Array ? Uint8Array.from(body) : new Uint8Array(body)
    this.store.set(key, {
      bytes,
      mimeType: opts.mimeType,
      uploadedAt: new Date(),
    })
  }

  async getDownloadStream(key: string): Promise<DownloadStream | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    return {
      body: toStream(entry.bytes),
      mimeType: entry.mimeType,
      sizeBytes: entry.bytes.byteLength,
    }
  }

  async head(key: string): Promise<StoredObject | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    return {
      key,
      sizeBytes: entry.bytes.byteLength,
      uploadedAt: entry.uploadedAt,
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const result: StoredObject[] = []
    for (const [key, entry] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        result.push({
          key,
          sizeBytes: entry.bytes.byteLength,
          uploadedAt: entry.uploadedAt,
        })
      }
    }
    return result
  }

  /** Test helper: wipe all stored objects. */
  clear(): void {
    this.store.clear()
  }
}
