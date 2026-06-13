import { describe, it, expect } from "vitest"
import {
  checkStorageQuota,
  storageLimitBytes,
  formatBytes,
  usagePercent,
} from "./quota"

const MB = 1024 * 1024

describe("checkStorageQuota", () => {
  it("allows uploads below the quota", () => {
    const r = checkStorageQuota({
      maxStorageMb: 1024,
      usedBytes: 100 * MB,
      incomingBytes: 5 * MB,
    })
    expect(r.allowed).toBe(true)
  })

  it("rejects an upload that would exceed the quota, with pt-BR message", () => {
    const r = checkStorageQuota({
      maxStorageMb: 100,
      usedBytes: 99 * MB,
      incomingBytes: 5 * MB,
    })
    expect(r.allowed).toBe(false)
    expect(r.message).toMatch(/Limite de armazenamento do seu plano atingido/)
    expect(r.message).toMatch(/Faça upgrade/)
  })

  it("allows an upload exactly at the limit", () => {
    const r = checkStorageQuota({
      maxStorageMb: 10,
      usedBytes: 9 * MB,
      incomingBytes: 1 * MB,
    })
    expect(r.allowed).toBe(true)
  })

  it("treats -1 and null as unlimited", () => {
    expect(
      checkStorageQuota({ maxStorageMb: -1, usedBytes: 1e12, incomingBytes: 1e9 }).allowed
    ).toBe(true)
    expect(
      checkStorageQuota({ maxStorageMb: null, usedBytes: 1e12, incomingBytes: 1e9 }).allowed
    ).toBe(true)
  })
})

describe("storageLimitBytes", () => {
  it("converts MB to bytes", () => {
    expect(storageLimitBytes(1)).toBe(MB)
    expect(storageLimitBytes(1024)).toBe(1024 * MB)
  })

  it("returns null for unlimited (null / -1)", () => {
    expect(storageLimitBytes(null)).toBeNull()
    expect(storageLimitBytes(-1)).toBeNull()
  })
})

describe("formatBytes", () => {
  it("formats with pt-BR comma decimals", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(512 * 1024)).toBe("512 KB")
    expect(formatBytes(Math.round(1.4 * MB))).toBe("1,4 MB")
    expect(formatBytes(Math.round(2.1 * 1024 * MB))).toBe("2,1 GB")
  })

  it("renders whole numbers without decimals", () => {
    expect(formatBytes(MB)).toBe("1 MB")
    expect(formatBytes(1024 * MB)).toBe("1 GB")
  })

  it("clamps non-positive input to 0 B", () => {
    expect(formatBytes(-5)).toBe("0 B")
    expect(formatBytes(NaN)).toBe("0 B")
  })
})

describe("usagePercent", () => {
  it("computes a percentage", () => {
    expect(usagePercent(50 * MB, 100 * MB)).toBe(50)
  })

  it("clamps above 100%", () => {
    expect(usagePercent(150 * MB, 100 * MB)).toBe(100)
  })

  it("returns null when unlimited", () => {
    expect(usagePercent(50 * MB, null)).toBeNull()
  })

  it("returns 100 when the limit is zero", () => {
    expect(usagePercent(1, 0)).toBe(100)
  })
})
