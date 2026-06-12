import { describe, it, expect } from "vitest"
import {
  parsePageParams,
  parseNoteStatusFilter,
  normalizeSearch,
  buildNoteListWhere,
  paginationMeta,
  paginateArray,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./list"

describe("parsePageParams", () => {
  it("defaults to page 1 and the default page size", () => {
    expect(parsePageParams({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE })
  })

  it("honours an explicit default page size", () => {
    expect(parsePageParams({}, 50)).toEqual({ page: 1, pageSize: 50 })
  })

  it("clamps page to >= 1 and ignores garbage", () => {
    expect(parsePageParams({ page: "0" }).page).toBe(1)
    expect(parsePageParams({ page: "-3" }).page).toBe(1)
    expect(parsePageParams({ page: "abc" }).page).toBe(1)
    expect(parsePageParams({ page: "4" }).page).toBe(4)
  })

  it("clamps page size to [1, MAX_PAGE_SIZE]", () => {
    expect(parsePageParams({ pageSize: "0" }).pageSize).toBe(1)
    expect(parsePageParams({ pageSize: "9999" }).pageSize).toBe(MAX_PAGE_SIZE)
    expect(parsePageParams({ pageSize: "20" }).pageSize).toBe(20)
  })
})

describe("parseNoteStatusFilter", () => {
  it("accepts only valid statuses, else null", () => {
    expect(parseNoteStatusFilter("RASCUNHO")).toBe("RASCUNHO")
    expect(parseNoteStatusFilter("ASSINADA")).toBe("ASSINADA")
    expect(parseNoteStatusFilter("todas")).toBeNull()
    expect(parseNoteStatusFilter(null)).toBeNull()
  })
})

describe("normalizeSearch", () => {
  it("trims, collapses whitespace, and empties to null", () => {
    expect(normalizeSearch("  ana   maria ")).toBe("ana maria")
    expect(normalizeSearch("   ")).toBeNull()
    expect(normalizeSearch(null)).toBeNull()
  })
})

describe("buildNoteListWhere", () => {
  it("always scopes by clinic and omits optional filters when absent", () => {
    expect(buildNoteListWhere({ clinicId: "c1" })).toEqual({ clinicId: "c1" })
  })

  it("adds patient, professional, and status filters when present", () => {
    const where = buildNoteListWhere({
      clinicId: "c1",
      patientId: "p1",
      professionalProfileId: "prof1",
      status: "ASSINADA",
    })
    expect(where).toMatchObject({
      clinicId: "c1",
      patientId: "p1",
      professionalProfileId: "prof1",
      status: "ASSINADA",
    })
  })

  it("searches by related patient name, case-insensitive", () => {
    const where = buildNoteListWhere({ clinicId: "c1", search: "ana" })
    expect(where.patient).toEqual({ name: { contains: "ana", mode: "insensitive" } })
  })

  it("builds an inclusive session-date range from from/to", () => {
    const where = buildNoteListWhere({ clinicId: "c1", from: "2026-01-01", to: "2026-01-31" })
    const range = where.sessionDate as { gte: Date; lte: Date }
    expect(range.gte.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(range.lte.toISOString()).toBe("2026-01-31T23:59:59.999Z")
  })

  it("does not add a professional filter when id is null (director browse)", () => {
    const where = buildNoteListWhere({ clinicId: "c1", professionalProfileId: null })
    expect(where).not.toHaveProperty("professionalProfileId")
  })
})

describe("paginationMeta", () => {
  it("computes total pages (ceil) and is 0 for an empty set", () => {
    expect(paginationMeta(0, 1, 20)).toEqual({ total: 0, page: 1, pageSize: 20, totalPages: 0 })
    expect(paginationMeta(45, 2, 20)).toEqual({ total: 45, page: 2, pageSize: 20, totalPages: 3 })
    expect(paginationMeta(20, 1, 20).totalPages).toBe(1)
  })
})

describe("paginateArray", () => {
  const items = Array.from({ length: 25 }, (_, i) => i)
  it("slices a 1-based page", () => {
    expect(paginateArray(items, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(paginateArray(items, 3, 10)).toEqual([20, 21, 22, 23, 24])
    expect(paginateArray(items, 4, 10)).toEqual([])
  })
})
