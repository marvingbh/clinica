import type { Prisma } from "@prisma/client"

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export type NoteStatusFilter = "RASCUNHO" | "ASSINADA"

function toInt(value: string | null | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10)
  return Number.isFinite(n) ? n : fallback
}

/** Parse and clamp a 1-based page and page size from raw query strings. */
export function parsePageParams(
  raw: { page?: string | null; pageSize?: string | null },
  defaultPageSize: number = DEFAULT_PAGE_SIZE
): { page: number; pageSize: number } {
  const page = Math.max(1, toInt(raw.page, 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(raw.pageSize, defaultPageSize)))
  return { page, pageSize }
}

/** Map a raw status query value to a valid note status filter, or null (= all). */
export function parseNoteStatusFilter(
  value: string | null | undefined
): NoteStatusFilter | null {
  return value === "RASCUNHO" || value === "ASSINADA" ? value : null
}

/** Trim/collapse a free-text search term; returns null when effectively empty. */
export function normalizeSearch(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim().replace(/\s+/g, " ")
  return trimmed.length > 0 ? trimmed : null
}

export interface NoteListFilter {
  clinicId: string
  professionalProfileId?: string | null
  patientId?: string | null
  status?: NoteStatusFilter | null
  search?: string | null
  from?: string | null
  to?: string | null
}

/**
 * Build the Prisma where-clause for the clinical-note list/browse query.
 * Always clinic-scoped. Search matches the related patient's name
 * (case-insensitive), mirroring the appointments/pendencias convention.
 */
export function buildNoteListWhere(f: NoteListFilter): Prisma.ClinicalNoteWhereInput {
  const where: Prisma.ClinicalNoteWhereInput = { clinicId: f.clinicId }
  if (f.patientId) where.patientId = f.patientId
  if (f.professionalProfileId) where.professionalProfileId = f.professionalProfileId
  if (f.status) where.status = f.status
  if (f.search) where.patient = { name: { contains: f.search, mode: "insensitive" } }
  if (f.from || f.to) {
    const sessionDate: Prisma.DateTimeFilter = {}
    if (f.from) sessionDate.gte = new Date(`${f.from}T00:00:00.000Z`)
    if (f.to) sessionDate.lte = new Date(`${f.to}T23:59:59.999Z`)
    where.sessionDate = sessionDate
  }
  return where
}

export interface PaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Pagination metadata for a 1-based page. */
export function paginationMeta(total: number, page: number, pageSize: number): PaginationMeta {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)
  return { total, page, pageSize, totalPages }
}

/** Slice an in-memory array for a 1-based page (used by the pending list). */
export function paginateArray<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}
