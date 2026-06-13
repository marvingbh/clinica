/**
 * Pure storage-quota math + pt-BR byte formatting.
 *
 * Reuses the {@link LimitResult} shape from src/lib/subscription/limits so the
 * storage quota behaves like the professional-count limit: `null` / `-1`
 * mean unlimited.
 */

import type { LimitResult } from "@/lib/subscription/limits"

export interface StorageQuotaCheck {
  /** Plan quota in MB; null or -1 = unlimited. */
  maxStorageMb: number | null
  /** Bytes already used by the clinic (includes trash). */
  usedBytes: number
  /** Bytes the incoming upload would add. */
  incomingBytes: number
}

const BYTES_PER_MB = 1024 * 1024

/** Quota in bytes, or null when unlimited. */
export function storageLimitBytes(maxStorageMb: number | null): number | null {
  if (maxStorageMb === null || maxStorageMb === -1) return null
  return Math.max(0, Math.floor(maxStorageMb * BYTES_PER_MB))
}

/**
 * Check whether an incoming upload fits under the clinic quota. Returns the
 * same {@link LimitResult} shape as the subscription limits module.
 */
export function checkStorageQuota(c: StorageQuotaCheck): LimitResult {
  const limitBytes = storageLimitBytes(c.maxStorageMb)
  if (limitBytes === null) return { allowed: true }

  const projected = c.usedBytes + c.incomingBytes
  if (projected > limitBytes) {
    return {
      allowed: false,
      message: `Limite de armazenamento do seu plano atingido (${formatBytes(
        c.usedBytes
      )} de ${formatBytes(limitBytes)}). Faça upgrade para anexar mais documentos.`,
    }
  }
  return { allowed: true }
}

/**
 * Human-readable byte size in pt-BR (comma decimal separator).
 * "0 B", "512 KB", "1,4 MB", "2,1 GB".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  if (unit === 0) {
    // Bytes are always whole.
    return `${Math.round(value)} B`
  }
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace(".", ",")
  return `${text} ${units[unit]}`
}

/**
 * Usage as an integer percentage (0–100, clamped). Returns null when the
 * limit is unlimited.
 */
export function usagePercent(
  usedBytes: number,
  limitBytes: number | null
): number | null {
  if (limitBytes === null) return null
  if (limitBytes <= 0) return 100
  const pct = Math.round((usedBytes / limitBytes) * 100)
  return Math.max(0, Math.min(100, pct))
}
