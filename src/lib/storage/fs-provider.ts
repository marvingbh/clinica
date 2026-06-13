/**
 * Filesystem {@link StorageProvider} for local dev. Writes binaries under
 * `STORAGE_FS_DIR` (default `.storage/`, gitignored) plus a `.meta.json`
 * sidecar carrying the MIME type. Never used in production.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import type {
  DownloadStream,
  PutOptions,
  StorageProvider,
  StoredObject,
} from "./types"

function baseDir(): string {
  return process.env.STORAGE_FS_DIR || ".storage"
}

function resolvePath(key: string): string {
  // Keys are already sanitized (see keys.ts); join under the base dir.
  return path.join(baseDir(), key)
}

function metaPath(key: string): string {
  return `${resolvePath(key)}.meta.json`
}

function toStream(buffer: Buffer): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer))
      controller.close()
    },
  })
}

export class FsStorageProvider implements StorageProvider {
  async put(
    key: string,
    body: Buffer | Uint8Array,
    opts: PutOptions
  ): Promise<void> {
    const filePath = resolvePath(key)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body)
    await fs.writeFile(filePath, buffer)
    await fs.writeFile(
      metaPath(key),
      JSON.stringify({ mimeType: opts.mimeType, uploadedAt: new Date().toISOString() })
    )
  }

  async getDownloadStream(key: string): Promise<DownloadStream | null> {
    try {
      const buffer = await fs.readFile(resolvePath(key))
      let mimeType = "application/octet-stream"
      try {
        const meta = JSON.parse(await fs.readFile(metaPath(key), "utf8"))
        if (typeof meta?.mimeType === "string") mimeType = meta.mimeType
      } catch {
        // missing sidecar — fall back to octet-stream
      }
      return { body: toStream(buffer), mimeType, sizeBytes: buffer.byteLength }
    } catch {
      return null
    }
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const stat = await fs.stat(resolvePath(key))
      let uploadedAt = stat.mtime
      try {
        const meta = JSON.parse(await fs.readFile(metaPath(key), "utf8"))
        if (typeof meta?.uploadedAt === "string") uploadedAt = new Date(meta.uploadedAt)
      } catch {
        // ignore missing sidecar
      }
      return { key, sizeBytes: stat.size, uploadedAt }
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(resolvePath(key), { force: true })
    await fs.rm(metaPath(key), { force: true })
  }

  async list(prefix: string): Promise<StoredObject[]> {
    const root = baseDir()
    const results: StoredObject[] = []
    async function walk(dir: string): Promise<void> {
      let entries: import("node:fs").Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (!entry.name.endsWith(".meta.json")) {
          const key = path.relative(root, full).split(path.sep).join("/")
          if (key.startsWith(prefix)) {
            const stat = await fs.stat(full)
            results.push({ key, sizeBytes: stat.size, uploadedAt: stat.mtime })
          }
        }
      }
    }
    await walk(root)
    return results
  }
}
