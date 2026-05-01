import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock next/headers cookies
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}))

import {
  createSuperAdminToken,
  getSuperAdminSession,
  setSuperAdminCookie,
  clearSuperAdminCookie,
  type SuperAdminSession,
} from "./superadmin-auth"

describe("superadmin-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("SUPERADMIN_JWT_SECRET", "test-superadmin-secret-very-long-value-for-jwt")
  })

  const testAdmin: SuperAdminSession = {
    id: "sa_1",
    email: "admin@platform.com",
    name: "Platform Admin",
  }

  describe("createSuperAdminToken", () => {
    it("returns a non-empty JWT string", async () => {
      const token = await createSuperAdminToken(testAdmin)
      expect(typeof token).toBe("string")
      expect(token.length).toBeGreaterThan(0)
      // JWT has 3 parts separated by dots
      expect(token.split(".")).toHaveLength(3)
    })

    it("encodes the admin payload that can be verified", async () => {
      const token = await createSuperAdminToken(testAdmin)
      // Use the token with getSuperAdminSession to verify round-trip
      mockCookieStore.get.mockReturnValue({ value: token })
      const session = await getSuperAdminSession()
      expect(session).toEqual(testAdmin)
    })
  })

  describe("getSuperAdminSession", () => {
    it("returns null when no cookie is present", async () => {
      mockCookieStore.get.mockReturnValue(undefined)
      const session = await getSuperAdminSession()
      expect(session).toBeNull()
    })

    it("returns null for an invalid token", async () => {
      mockCookieStore.get.mockReturnValue({ value: "invalid-jwt-token" })
      const session = await getSuperAdminSession()
      expect(session).toBeNull()
    })

    it("returns null for a tampered token", async () => {
      const token = await createSuperAdminToken(testAdmin)
      // Tamper with the signature by flipping a character in the middle
      const parts = token.split(".")
      const sig = parts[2]
      const mid = Math.floor(sig.length / 2)
      const flipped = sig[mid] === "x" ? "y" : "x"
      parts[2] = sig.slice(0, mid) + flipped + sig.slice(mid + 1)
      const tampered = parts.join(".")
      mockCookieStore.get.mockReturnValue({ value: tampered })
      const session = await getSuperAdminSession()
      expect(session).toBeNull()
    })

    it("returns the session for a valid token", async () => {
      const token = await createSuperAdminToken(testAdmin)
      mockCookieStore.get.mockReturnValue({ value: token })
      const session = await getSuperAdminSession()
      expect(session).toEqual({
        id: "sa_1",
        email: "admin@platform.com",
        name: "Platform Admin",
      })
    })

    it("reads from the 'superadmin-token' cookie", async () => {
      mockCookieStore.get.mockReturnValue(undefined)
      await getSuperAdminSession()
      expect(mockCookieStore.get).toHaveBeenCalledWith("superadmin-token")
    })
  })

  describe("setSuperAdminCookie", () => {
    it("sets an httpOnly cookie with the token", async () => {
      await setSuperAdminCookie("test-token-value")
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        "superadmin-token",
        "test-token-value",
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 8 * 60 * 60,
        })
      )
    })
  })

  describe("clearSuperAdminCookie", () => {
    it("deletes the superadmin-token cookie", async () => {
      await clearSuperAdminCookie()
      expect(mockCookieStore.delete).toHaveBeenCalledWith("superadmin-token")
    })
  })
})
