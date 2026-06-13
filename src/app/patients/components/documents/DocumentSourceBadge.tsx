"use client"

import { SOURCE_LABELS, type PatientDocumentSourceString } from "@/lib/patient-documents"

/** Origin badge — rendered only for system-generated (non-UPLOAD) documents. */
export function DocumentSourceBadge({
  source,
}: {
  source: PatientDocumentSourceString
}) {
  if (source === "UPLOAD") return null
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
      {SOURCE_LABELS[source]}
    </span>
  )
}
