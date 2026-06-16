"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"

interface DnsRecord {
  record?: string
  name: string
  type: string
  value: string
  ttl?: string
  priority?: number
  status?: string
}

interface DomainState {
  domain: string | null
  status: string | null
  records: DnsRecord[] | null
  fromAddress: string | null
  sharedDomain: string | null
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verificado", cls: "bg-emerald-100 text-emerald-700" },
  pending: { label: "Aguardando verificação", cls: "bg-amber-100 text-amber-700" },
  not_started: { label: "Aguardando verificação", cls: "bg-amber-100 text-amber-700" },
  temporary_failure: { label: "Falha temporária — tente novamente", cls: "bg-amber-100 text-amber-700" },
  failed: { label: "Falha na verificação", cls: "bg-red-100 text-red-700" },
}

/** Settings → E-mail: optional per-clinic white-label sending domain (Resend). */
export default function EmailDomainSection() {
  const [state, setState] = useState<DomainState | null>(null)
  const [domainInput, setDomainInput] = useState("")
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      const res = await fetch("/api/clinic/email-domain")
      if (res.ok) setState(await res.json())
    } catch {
      /* keep null; section just won't render */
    }
  }
  useMountEffect(() => {
    load()
  })

  async function addDomain() {
    if (!domainInput.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/clinic/email-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erro ao adicionar domínio")
      setState((s) => ({ ...(s as DomainState), ...data }))
      setDomainInput("")
      toast.success("Domínio adicionado. Configure o DNS e clique em Verificar.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar domínio")
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true)
    try {
      const res = await fetch("/api/clinic/email-domain/verify", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erro ao verificar")
      setState((s) => ({ ...(s as DomainState), status: data.status, records: data.records }))
      if (data.status === "verified") toast.success("Domínio verificado! Os e-mails agora saem do seu domínio.")
      else toast.info("Ainda não verificado. A propagação de DNS pode levar até 48h — tente de novo mais tarde.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao verificar")
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      const res = await fetch("/api/clinic/email-domain", { method: "DELETE" })
      if (!res.ok) throw new Error()
      setState((s) => ({ ...(s as DomainState), domain: null, status: null, records: null, fromAddress: null }))
      toast.success("Domínio removido. Voltamos a usar o domínio do sistema.")
    } catch {
      toast.error("Erro ao remover domínio")
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null
  const meta = state.status ? STATUS_META[state.status] ?? STATUS_META.pending : null

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Domínio de envio</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Por padrão, os e-mails saem do domínio do sistema
          {state.sharedDomain ? ` (notificacao@${state.sharedDomain})` : ""} com o nome da sua clínica e
          resposta para o seu e-mail. Para enviar pelo <b>seu próprio domínio</b> (white-label), adicione-o
          abaixo e verifique o DNS.
        </p>
      </div>

      {!state.domain ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-foreground">Usar meu próprio domínio</label>
            <input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="suaclinica.com.br"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={addDomain}
            disabled={busy}
            className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Adicionar domínio
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{state.domain}</span>
            {meta && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}>{meta.label}</span>}
            {state.fromAddress && (
              <span className="text-xs text-muted-foreground">remetente: {state.fromAddress}</span>
            )}
          </div>

          {state.status !== "verified" && (
            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
              <p className="text-sm text-foreground">
                Adicione os registros abaixo no painel de <b>DNS</b> do seu domínio (no seu registrador, ex.:
                Registro.br, GoDaddy, Cloudflare). Depois clique em <b>Verificar domínio</b>. A propagação do
                DNS pode levar de minutos a 48 horas.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">Tipo</th>
                      <th className="py-1 pr-3">Nome / Host</th>
                      <th className="py-1 pr-3">Valor</th>
                      <th className="py-1">Prioridade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(state.records ?? []).map((r, i) => (
                      <tr key={i} className="align-top">
                        <td className="py-1.5 pr-3 font-mono">{r.type}</td>
                        <td className="py-1.5 pr-3 font-mono break-all">{r.name}</td>
                        <td className="py-1.5 pr-3 font-mono break-all">{r.value}</td>
                        <td className="py-1.5 font-mono">{r.priority ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {state.status !== "verified" && (
              <button
                onClick={verify}
                disabled={busy}
                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Verificar domínio
              </button>
            )}
            <button
              onClick={remove}
              disabled={busy}
              className="h-10 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground disabled:opacity-50"
            >
              Remover domínio
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
