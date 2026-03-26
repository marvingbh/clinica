"use client"

import type { ExpenseStatus } from "@prisma/client"

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "bg-gray-100 text-gray-700" },
  OPEN: { label: "Em aberto", className: "bg-blue-100 text-blue-700" },
  PAID: { label: "Pago", className: "bg-green-100 text-green-700" },
  OVERDUE: { label: "Vencido", className: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Cancelado", className: "bg-gray-100 text-gray-500 line-through" },
}

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
