/** Parsed, clamped pagination window for list endpoints. */
export interface PaginationWindow {
  /** Zero-based page index. */
  page: number
  /** Page size (clamped to [1, maxLimit]). */
  limit: number
  /** Number of rows to skip (page * limit). */
  offset: number
}

export interface PaginationOptions {
  defaultLimit?: number
  maxLimit?: number
}

/**
 * Parses ?page & ?limit query params into a safe, clamped window. Invalid,
 * negative, or out-of-range values fall back to sane defaults so a hand-edited
 * URL can never blow up a query. `page` is zero-based to match the shared
 * <Pagination /> component.
 */
export function parsePagination(
  params: URLSearchParams,
  { defaultLimit = 50, maxLimit = 200 }: PaginationOptions = {}
): PaginationWindow {
  const rawPage = Number(params.get("page"))
  const rawLimit = Number(params.get("limit"))

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 0
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), maxLimit)
      : defaultLimit

  return { page, limit, offset: page * limit }
}

/** Slices an in-memory list to a pagination window. */
export function paginate<T>(items: readonly T[], window: PaginationWindow): T[] {
  return items.slice(window.offset, window.offset + window.limit)
}
