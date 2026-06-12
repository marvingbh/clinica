"use client"

import { useCallback, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/shared/components/ui"
import { DmedYearPicker } from "./components/DmedYearPicker"
import { DmedConferenceTable } from "./components/DmedConferenceTable"
import { DmedIssuesCard } from "./components/DmedIssuesCard"
import type { DmedIssueView, DmedReportView } from "./components/types"

export default function DmedPage() {
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const [report, setReport] = useState<DmedReportView | null>(null)
  const [issues, setIssues] = useState<DmedIssueView[]>([])
  const [configErrors, setConfigErrors] = useState<string[]>([])
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/financeiro/fiscal/dmed?year=${year}`)
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      if (!res.ok) throw new Error()
      const data = await res.json()
      setReport(data.report)
      setIssues(data.issues)
      setConfigErrors(data.configErrors)
    } finally {
      setLoading(false)
    }
  }, [year])

  // Re-fetches when the selected year changes.
  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  function downloadFile() {
    window.location.href = `/api/financeiro/fiscal/dmed/file?year=${year}`
  }
  function downloadCsv() {
    window.location.href = `/api/financeiro/fiscal/dmed/csv?year=${year}`
  }

  if (forbidden) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        A conferência DMED é restrita a administradores.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">DMED — Conferência {year}</h2>
        <div className="flex items-center gap-2">
          <DmedYearPicker year={year} onChange={setYear} />
          <Button
            variant="outlined"
            onClick={() => {
              if (configErrors.length > 0) {
                toast.error("Configuração fiscal incompleta. Verifique a aba Fiscal das configurações.")
                return
              }
              downloadFile()
            }}
          >
            Baixar arquivo DMED
          </Button>
          <Button variant="outlined" onClick={downloadCsv}>
            Exportar CSV de conferência
          </Button>
        </div>
      </div>

      {configErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">Configuração fiscal incompleta:</p>
          <ul className="list-inside list-disc">
            {configErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      ) : report ? (
        <>
          <DmedConferenceTable payers={report.payers} grandTotal={report.grandTotal} />
          <DmedIssuesCard issues={issues} unexplainedDiff={report.unexplainedDiff} />
        </>
      ) : null}
    </div>
  )
}
