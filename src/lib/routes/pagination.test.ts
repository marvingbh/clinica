import { describe, it, expect } from "vitest"
import { parsePagination, paginate } from "./pagination"

function params(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj)
}

describe("parsePagination", () => {
  it("defaults to page 0 with the default limit", () => {
    expect(parsePagination(params({}))).toEqual({ page: 0, limit: 50, offset: 0 })
  })

  it("respects valid page and limit", () => {
    expect(parsePagination(params({ page: "2", limit: "20" }))).toEqual({
      page: 2,
      limit: 20,
      offset: 40,
    })
  })

  it("clamps limit to maxLimit", () => {
    expect(parsePagination(params({ limit: "5000" }), { maxLimit: 200 }).limit).toBe(200)
  })

  it("falls back to defaults for invalid or negative values", () => {
    expect(parsePagination(params({ page: "-3", limit: "abc" }))).toEqual({
      page: 0,
      limit: 50,
      offset: 0,
    })
    expect(parsePagination(params({ limit: "0" })).limit).toBe(50)
  })

  it("floors fractional values", () => {
    expect(parsePagination(params({ page: "1.9", limit: "10.7" }))).toEqual({
      page: 1,
      limit: 10,
      offset: 10,
    })
  })

  it("honors a custom default limit", () => {
    expect(parsePagination(params({}), { defaultLimit: 25 }).limit).toBe(25)
  })
})

describe("paginate", () => {
  const list = [1, 2, 3, 4, 5, 6, 7]

  it("slices the requested window", () => {
    expect(paginate(list, { page: 0, limit: 3, offset: 0 })).toEqual([1, 2, 3])
    expect(paginate(list, { page: 1, limit: 3, offset: 3 })).toEqual([4, 5, 6])
    expect(paginate(list, { page: 2, limit: 3, offset: 6 })).toEqual([7])
  })

  it("returns empty for an out-of-range window", () => {
    expect(paginate(list, { page: 9, limit: 3, offset: 27 })).toEqual([])
  })
})
