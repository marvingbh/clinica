import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { fetchPendingBookingCount } from "./usePendingBookingCount"

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}
function status(code: number, body: unknown = {}): Response {
  return { ok: code < 400, status: code, json: async () => body } as unknown as Response
}

describe("fetchPendingBookingCount", () => {
  it("returns the count from the endpoint payload on success", async () => {
    fetchMock.mockResolvedValueOnce(ok({ count: 4 }))
    const result = await fetchPendingBookingCount()
    expect(result).toEqual({ kind: "ok", count: 4 })
  })

  it("hits the canonical endpoint path", async () => {
    fetchMock.mockResolvedValueOnce(ok({ count: 0 }))
    await fetchPendingBookingCount()
    expect(fetchMock).toHaveBeenCalledWith("/api/booking-requests/pending-count")
  })

  it("flags 401 as unauthorized so the caller can stop polling", async () => {
    fetchMock.mockResolvedValueOnce(status(401))
    const result = await fetchPendingBookingCount()
    expect(result).toEqual({ kind: "unauthorized" })
  })

  it("treats other non-2xx responses as transient errors", async () => {
    fetchMock.mockResolvedValueOnce(status(500))
    const result = await fetchPendingBookingCount()
    expect(result).toEqual({ kind: "error" })
  })

  it("treats network failures as transient errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"))
    const result = await fetchPendingBookingCount()
    expect(result).toEqual({ kind: "error" })
  })

  it("treats malformed responses (missing count) as transient errors", async () => {
    fetchMock.mockResolvedValueOnce(ok({ wrong: "shape" }))
    const result = await fetchPendingBookingCount()
    expect(result).toEqual({ kind: "error" })
  })

  it("treats non-numeric count as transient error rather than passing it through", async () => {
    fetchMock.mockResolvedValueOnce(ok({ count: "3" }))
    const result = await fetchPendingBookingCount()
    expect(result).toEqual({ kind: "error" })
  })
})
