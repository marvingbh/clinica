"use client"

import { useState } from "react"
import { ShieldCheck, XCircle, CheckCircle2 } from "lucide-react"
import { useMountEffect } from "@/shared/hooks"

interface Signatario {
  nome: string
  cpf: string
  role: string
  assinadoEm: string | null
}
interface Result {
  valido: boolean
  clinica?: string
  tituloDocumento?: string
  assinadoEm?: string | null
  signatarios?: Signatario[]
  sha256Final?: string | null
  contraAssinaturaICP?: boolean
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false })}`
}

async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function VerificationResult({ code }: { code: string }) {
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [fileCheck, setFileCheck] = useState<"idle" | "match" | "mismatch">("idle")

  useMountEffect(() => {
    fetch(`/api/public/verificacao/${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => setResult(d))
      .catch(() => setResult({ valido: false }))
      .finally(() => setLoading(false))
  })

  async function onFile(file: File | null) {
    if (!file || !result?.sha256Final) return
    const hash = await sha256OfFile(file)
    setFileCheck(hash.toLowerCase() === result.sha256Final.toLowerCase() ? "match" : "mismatch")
  }

  if (loading) return <div className="h-40 w-full animate-pulse rounded-md bg-muted" />

  if (!result?.valido) {
    return (
      <div className="text-center space-y-3 py-8">
        <XCircle className="h-12 w-12 text-red-600 mx-auto" />
        <p className="text-sm text-muted-foreground">Código não encontrado ou documento inválido.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-700">
        <ShieldCheck className="h-6 w-6" />
        <p className="font-semibold">Documento autêntico — assinado em {fmt(result.assinadoEm)}</p>
      </div>
      <dl className="text-sm space-y-1">
        <div><dt className="inline text-muted-foreground">Clínica: </dt><dd className="inline">{result.clinica}</dd></div>
        <div><dt className="inline text-muted-foreground">Documento: </dt><dd className="inline">{result.tituloDocumento}</dd></div>
        <div><dt className="inline text-muted-foreground">Contra-assinatura ICP-Brasil: </dt><dd className="inline">{result.contraAssinaturaICP ? "Sim" : "Não"}</dd></div>
      </dl>
      <div>
        <p className="text-sm font-medium mb-1">Signatários</p>
        <ul className="text-sm text-muted-foreground space-y-0.5">
          {result.signatarios?.map((s, i) => (
            <li key={i}>{s.nome} — {s.cpf} ({s.role === "PACIENTE" ? "Paciente" : "Responsável"}) — {fmt(s.assinadoEm)}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border border-input p-3 space-y-2">
        <p className="text-sm font-medium">Conferir meu arquivo PDF</p>
        <p className="text-xs text-muted-foreground">O arquivo é verificado no seu navegador e não é enviado a nenhum servidor.</p>
        <input type="file" accept="application/pdf" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="text-sm" />
        {fileCheck === "match" && (
          <p className="flex items-center gap-1.5 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" /> Íntegro: o arquivo corresponde ao documento assinado.</p>
        )}
        {fileCheck === "mismatch" && (
          <p className="flex items-center gap-1.5 text-sm text-red-700"><XCircle className="h-4 w-4" /> O arquivo NÃO corresponde ao documento assinado.</p>
        )}
      </div>
    </div>
  )
}
