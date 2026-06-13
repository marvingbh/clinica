"use client"

import { CATEGORY_LABELS, type PatientDocumentCategoryString } from "@/lib/patient-documents"

const CATEGORY_COLORS: Record<PatientDocumentCategoryString, string> = {
  EXAME: "bg-purple-100 text-purple-700",
  ENCAMINHAMENTO: "bg-blue-100 text-blue-700",
  DOCUMENTO: "bg-gray-100 text-gray-700",
  CONTRATO: "bg-amber-100 text-amber-700",
  OUTRO: "bg-slate-100 text-slate-600",
}

export function DocumentCategoryChip({
  category,
}: {
  category: PatientDocumentCategoryString
}) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        CATEGORY_COLORS[category] ?? CATEGORY_COLORS.OUTRO
      }`}
    >
      {CATEGORY_LABELS[category] ?? category}
    </span>
  )
}
