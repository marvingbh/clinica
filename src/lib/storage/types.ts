/**
 * Generic blob storage abstraction. Patient documents (and, in the future,
 * NFS-e PDFs, clinic logos, etc.) keep only metadata + a `storageKey` in the
 * database; the binary lives behind a {@link StorageProvider}.
 *
 * The download route always proxies the binary through an authenticated
 * handler — the provider URL is never exposed. `getDownloadStream` returns a
 * stream so a future S3/R2 adapter can swap to a short-lived presigned URL
 * (changing the route to a 302) without breaking the contract.
 */

export interface PutOptions {
  mimeType: string
}

export interface StoredObject {
  key: string
  sizeBytes: number
  uploadedAt: Date
}

export interface DownloadStream {
  body: ReadableStream
  mimeType: string
  sizeBytes: number
}

export interface StorageProvider {
  /** Store a binary under `key`. Overwrites if the key already exists. */
  put(key: string, body: Buffer | Uint8Array, opts: PutOptions): Promise<void>
  /** Stream + metadata for the download proxy route. null if the key is absent. */
  getDownloadStream(key: string): Promise<DownloadStream | null>
  /** Metadata for an object, or null if absent. */
  head(key: string): Promise<StoredObject | null>
  /** Delete an object. Idempotent — never throws when the key is absent. */
  delete(key: string): Promise<void>
  /** List objects under a prefix (for orphan garbage collection). */
  list(prefix: string): Promise<StoredObject[]>
}

export type StorageProviderName = "vercel-blob" | "fs" | "memory"
