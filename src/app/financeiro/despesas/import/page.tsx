"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Upload, FileText, Check } from "lucide-react"
import { ImportReviewTable } from "./components/ImportReviewTable"

interface Transaction {
  externalId: string
  date: string
  amount: number
  type: string
  description: string
}

interface Suggestion {
  categoryId: string | null
  categoryName: string | null
  supplierName: string | null
  confidence: string
}

interface ParsedResult {
  transaction: Transaction
  suggestion: Suggestion | null
}

export default function ImportPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<"ofx" | "csv">("ofx")
  const [parsing, setParsing] = useState(false)
  const [results, setResults] = useState<ParsedResult[] | null>(null)
  const [stats, setStats] = useState<{ duplicatesSkipped: number; totalParsed: number } | null>(null)

  async function handleUpload() {
    if (!file) return
    setParsing(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("format", format)

      const res = await fetch("/api/financeiro/despesas/import", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao processar arquivo")
      }

      const data = await res.json()
      setResults(data.suggestions)
      setStats({ duplicatesSkipped: data.duplicatesSkipped, totalParsed: data.totalParsed })
      toast.success(`${data.transactions.length} transações encontradas`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar")
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirm(confirmed: { externalId: string; date: string; amount: number; description: string; categoryId: string | null; supplierName: string | null }[]) {
    try {
      const res = await fetch("/api/financeiro/despesas/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: confirmed }),
      })

      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      toast.success(`${data.created} despesas criadas`)
      router.push("/financeiro/despesas")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar")
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Importar Extrato Bancário</h2>

      {!results ? (
        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              Selecione um arquivo OFX ou CSV do seu banco
            </p>
            <input
              type="file"
              accept=".ofx,.csv,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block mx-auto text-sm"
            />
          </div>

          {file && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <div className="flex gap-2 items-center">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as "ofx" | "csv")}
                  className="rounded-md border border-input px-3 py-1.5 text-sm"
                >
                  <option value="ofx">OFX</option>
                  <option value="csv">CSV</option>
                </select>
                <button
                  onClick={handleUpload}
                  disabled={parsing}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {parsing ? "Processando..." : "Processar"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {stats && (
            <p className="text-sm text-muted-foreground">
              {results.length} novas transações encontradas
              {stats.duplicatesSkipped > 0 && ` (${stats.duplicatesSkipped} duplicatas ignoradas)`}
            </p>
          )}
          <ImportReviewTable
            results={results}
            onConfirm={handleConfirm}
            onCancel={() => { setResults(null); setFile(null) }}
          />
        </div>
      )}
    </div>
  )
}
