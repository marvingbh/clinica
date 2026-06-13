"use client"

import { FileText, Image as ImageIcon, FileSpreadsheet, File as FileIcon } from "lucide-react"
import { iconNameForMime } from "./helpers"

/** Renders the lucide icon matching a document's MIME type. */
export function DocumentTypeIcon({
  mimeType,
  className,
}: {
  mimeType: string
  className?: string
}) {
  const name = iconNameForMime(mimeType)
  if (name === "pdf") return <FileText className={className} />
  if (name === "image") return <ImageIcon className={className} />
  if (name === "spreadsheet") return <FileSpreadsheet className={className} />
  return <FileIcon className={className} />
}
