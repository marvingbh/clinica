import { Download } from "lucide-react"

/**
 * Downloads the current report tab as CSV by hitting the same API URL with
 * &format=csv. A plain anchor lets the browser handle the attachment download.
 */
export function ExportCsvButton({ apiUrl }: { apiUrl: string }) {
  const sep = apiUrl.includes("?") ? "&" : "?"
  const href = `${apiUrl}${sep}format=csv`
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
    >
      <Download className="w-4 h-4" strokeWidth={1.75} />
      Exportar CSV
    </a>
  )
}
