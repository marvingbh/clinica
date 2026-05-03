"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "./icons"

interface Props {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}

/** Compact pagination footer for table-style list pages. Hides itself when
 *  total ≤ pageSize. Renders with a bottom-rounded container so it visually
 *  continues the table above it. */
export function Pagination({ page, pageSize, total, onPage }: Props) {
  if (total <= pageSize) return null

  const totalPages = Math.ceil(total / pageSize)
  const start = page * pageSize + 1
  const end = Math.min(total, (page + 1) * pageSize)

  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 bg-card border border-t-0 border-ink-200 rounded-b-[12px] text-[12px] text-ink-600">
      <div>
        Mostrando <span className="font-semibold text-ink-800">{start}</span>–
        <span className="font-semibold text-ink-800">{end}</span> de{" "}
        <span className="font-semibold text-ink-800">{total}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="w-7 h-7 grid place-items-center rounded-[6px] border border-ink-200 bg-card hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Página anterior"
        >
          <ChevronLeftIcon className="w-3.5 h-3.5" />
        </button>
        <span className="px-2 tabular-nums">
          {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="w-7 h-7 grid place-items-center rounded-[6px] border border-ink-200 bg-card hover:bg-ink-50 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Próxima página"
        >
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
