/**
 * Vercel Blob {@link StorageProvider}. The blob URL stays encapsulated here and
 * is never returned to callers — the download route always proxies the stream
 * via {@link getDownloadStream}. Production provider (token injected by the
 * Vercel Blob integration as `BLOB_READ_WRITE_TOKEN`).
 */

import { put, head, del, list } from "@vercel/blob"
import type {
  DownloadStream,
  PutOptions,
  StorageProvider,
  StoredObject,
} from "./types"

export class VercelBlobStorageProvider implements StorageProvider {
  async put(
    key: string,
    body: Buffer | Uint8Array,
    opts: PutOptions
  ): Promise<void> {
    await put(key, Buffer.isBuffer(body) ? body : Buffer.from(body), {
      access: "public",
      contentType: opts.mimeType,
      addRandomSuffix: false,
      allowOverwrite: true,
    })
  }

  async getDownloadStream(key: string): Promise<DownloadStream | null> {
    const meta = await this.head(key)
    if (!meta) return null
    const blob = await head(key)
    const res = await fetch(blob.url)
    if (!res.ok || !res.body) return null
    return {
      body: res.body,
      mimeType: blob.contentType || "application/octet-stream",
      sizeBytes: blob.size,
    }
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const blob = await head(key)
      return {
        key,
        sizeBytes: blob.size,
        uploadedAt: new Date(blob.uploadedAt),
      }
    } catch {
      // BlobNotFoundError (or any head failure) → treat as absent.
      return null
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await del(key)
    } catch {
      // Idempotent: never throw when the key is already gone.
    }
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const results: StoredObject[] = []
    let cursor: string | undefined
    do {
      const page = await list({ prefix, cursor, limit: 1000 })
      for (const blob of page.blobs) {
        results.push({
          key: blob.pathname,
          sizeBytes: blob.size,
          uploadedAt: new Date(blob.uploadedAt),
        })
      }
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
    return results
  }
}
