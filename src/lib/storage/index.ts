// Pure, browser-safe exports only. Server-only provider code (filesystem,
// @vercel/blob) lives in "@/lib/storage/server" so client bundles never pull in
// node:fs or the blob SDK.

export type {
  StorageProvider,
  StorageProviderName,
  StoredObject,
  DownloadStream,
  PutOptions,
} from "./types"

export {
  sanitizeFilename,
  buildStorageKey,
  clinicPrefix,
  patientPrefix,
  keyBelongsTo,
} from "./keys"

export {
  ALLOWED_MIME_TYPES,
  PREVIEWABLE_MIME_TYPES,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  getMaxFileSizeBytes,
  validateUpload,
  isPreviewable,
  type ValidateUploadInput,
  type ValidateUploadResult,
} from "./validation"

export {
  checkStorageQuota,
  storageLimitBytes,
  formatBytes,
  usagePercent,
  type StorageQuotaCheck,
} from "./quota"
