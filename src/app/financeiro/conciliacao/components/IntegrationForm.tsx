"use client"

import { useState } from "react"
import { Button } from "@/shared/components/ui/button"
import { toast } from "sonner"
import { SaveIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react"

interface Integration {
  id: string
  clientId: string
  accountNumber: string | null
  isActive: boolean
}

interface IntegrationFormProps {
  existing: Integration | null
  onSaved: () => void
}

export function IntegrationForm({ existing, onSaved }: IntegrationFormProps) {
  const [clientId, setClientId] = useState(existing?.clientId || "")
  const [clientSecret, setClientSecret] = useState("")
  const [certificate, setCertificate] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [accountNumber, setAccountNumber] = useState(existing?.accountNumber || "")
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isOpen, setIsOpen] = useState(!existing)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/financeiro/conciliacao/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, certificate, privateKey, accountNumber: accountNumber || null }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erro ao salvar")
      }
      toast.success("Integração salva com sucesso")
      setIsOpen(false)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar integração")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Integração Banco Inter</h3>
        {existing && (
          <Button variant="text" size="sm" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? "Fechar" : "Editar"}
          </Button>
        )}
      </div>

      {existing && !isOpen && (
        <div className="text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Configurado
          </span>
          <span className="ml-3">Client ID: {existing.clientId}</span>
          {existing.accountNumber && <span className="ml-3">Conta: {existing.accountNumber}</span>}
        </div>
      )}

      {isOpen && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Client Secret</label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder={existing ? "••••••••" : ""}
                className="w-full px-3 py-2 pr-10 border border-border rounded-md bg-background text-sm"
                required={!existing}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showSecret ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Certificado (.crt / .pem)</label>
            <textarea
              value={certificate}
              onChange={e => setCertificate(e.target.value)}
              placeholder={existing ? "Cole o novo certificado para atualizar" : "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm font-mono"
              required={!existing}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Chave Privada (.key)</label>
            <textarea
              value={privateKey}
              onChange={e => setPrivateKey(e.target.value)}
              placeholder={existing ? "Cole a nova chave para atualizar" : "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"}
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm font-mono"
              required={!existing}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Número da Conta (opcional)</label>
            <input
              type="text"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
            />
          </div>

          <Button type="submit" disabled={saving} size="sm">
            {saving ? <Loader2Icon className="w-4 h-4 animate-spin mr-1" /> : <SaveIcon className="w-4 h-4 mr-1" />}
            {existing ? "Atualizar" : "Salvar"}
          </Button>
        </form>
      )}
    </div>
  )
}
