"use client"

import { useCallback, useMemo, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/shared/components/ui"
import { Pagination } from "@/shared/components/ui/pagination"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import { ReciboPaymentsTable } from "./components/ReciboPaymentsTable"
import { ReciboBatchList } from "./components/ReciboBatchList"
import { SemOrigemCard } from "./components/SemOrigemCard"
import { downloadTextFile } from "./components/download"
import type { BatchView, FiscalIssueView, FiscalProfessionalView, ReciboRowView } from "./components/types"

const currentYear = new Date().getFullYear()
const PAGE_SIZE = 50

export default function ReciboSaudePage() {
  const [rows, setRows] = useState<ReciboRowView[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [issues, setIssues] = useState<FiscalIssueView[]>([])
  const [professionals, setProfessionals] = useState<FiscalProfessionalView[]>([])
  const [batches, setBatches] = useState<BatchView[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [professionalId, setProfessionalId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("from", `${currentYear}-01-01`)
      params.set("to", `${currentYear}-12-31`)
      params.set("page", String(page))
      params.set("limit", String(PAGE_SIZE))
      if (professionalId) params.set("professionalId", professionalId)
      const [payRes, batchRes] = await Promise.all([
        fetch(`/api/financeiro/fiscal/receita-saude/payments?${params}`),
        fetch(`/api/financeiro/fiscal/receita-saude/batches`),
      ])
      if (payRes.ok) {
        const data = await payRes.json()
        setRows(data.rows)
        setTotal(data.total ?? data.rows.length)
        setIssues(data.issues)
        setProfessionals(data.professionals)
      }
      if (batchRes.ok) setBatches((await batchRes.json()).batches)
    } finally {
      setLoading(false)
    }
  }, [professionalId, page])

  // Re-fetches when the professional filter or page changes.
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset to the first page whenever the professional filter changes so the
  // user never lands on an out-of-range page for a smaller result set.
  function handleProfessionalChange(value: string) {
    setProfessionalId(value)
    setPage(0)
  }

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.paymentKey)), [rows, selected])
  const exportProfessionalId =
    selectedRows.length > 0 ? selectedRows[0].professionalProfileId : null
  const mixedProfessionals = selectedRows.some((r) => r.professionalProfileId !== exportProfessionalId)
  const hasPfProfessionals = professionals.some((p) => p.fiscalRegime === "PF")

  async function handleExport() {
    if (!exportProfessionalId || mixedProfessionals) {
      toast.error("Selecione recibos de um único profissional por lote.")
      return
    }
    setExporting(true)
    try {
      const res = await fetch("/api/financeiro/fiscal/receita-saude/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalProfileId: exportProfessionalId,
          paymentKeys: [...selected],
          year: currentYear,
        }),
      })
      if (res.status === 422) {
        toast.error("Há pagamentos bloqueados na seleção.")
        return
      }
      if (!res.ok) throw new Error()
      const { fileName, fileContent, batchId } = await res.json()
      downloadTextFile(fileName, fileContent)
      const total = selectedRows.reduce((s, r) => s + r.amount, 0)
      toast.success(`Arquivo de lote gerado: ${selected.size} recibos, ${formatCurrencyBRL(total)}`)
      void batchId
      setSelected(new Set())
      fetchData()
    } catch {
      toast.error("Erro ao gerar o arquivo de lote.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Recibos Receita Saúde</h2>
          <p className="text-sm text-muted-foreground">
            Pagamentos recebidos sem recibo emitido no período ({currentYear})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={professionalId}
            onChange={(e) => handleProfessionalChange(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button onClick={handleExport} disabled={selected.size === 0 || exporting}>
            {exporting ? "Gerando..." : "Gerar arquivo de lote"}
          </Button>
        </div>
      </div>

      {!hasPfProfessionals && !loading && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Nenhum profissional com regime fiscal configurado. Configure em Profissionais.
        </div>
      )}

      {loading ? (
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      ) : (
        <>
          <div>
            <ReciboPaymentsTable rows={rows} selected={selected} onToggle={toggle} onCancel={() => {}} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
          </div>
          <SemOrigemCard issues={issues} />
          <section>
            <h3 className="mb-2 text-sm font-semibold">Lotes gerados</h3>
            <ReciboBatchList batches={batches} onChanged={fetchData} />
          </section>
        </>
      )}
    </div>
  )
}
