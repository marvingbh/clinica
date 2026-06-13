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

export {
  getStorageProvider,
  setStorageProvider,
  resolveProviderName,
  isClientUploadProvider,
} from "./provider"

export { MemoryStorageProvider } from "./memory-provider"
export { FsStorageProvider } from "./fs-provider"
