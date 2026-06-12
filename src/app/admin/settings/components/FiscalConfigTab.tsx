"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { useMountEffect } from "@/shared/hooks"
import { Button, Input } from "@/shared/components/ui"

interface FiscalConfigForm {
  dmedEnabled: boolean
  cnpj: string
  nomeEmpresarial: string
  responsavelCpf: string
  responsavelNome: string
  responsavelDdd: string
  responsavelTelefone: string
}

const EMPTY: FiscalConfigForm = {
  dmedEnabled: false,
  cnpj: "",
  nomeEmpresarial: "",
  responsavelCpf: "",
  responsavelNome: "",
  responsavelDdd: "",
  responsavelTelefone: "",
}

export default function FiscalConfigTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [nfseCnpj, setNfseCnpj] = useState<string | null>(null)
  const { register, handleSubmit, reset, watch, setValue } = useForm<FiscalConfigForm>({ defaultValues: EMPTY })

  useMountEffect(() => {
    fetch("/api/financeiro/fiscal/config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setNfseCnpj(data.nfseCnpj ?? null)
        if (data.config) {
          reset({
            dmedEnabled: data.config.dmedEnabled,
            cnpj: data.config.cnpj ?? "",
            nomeEmpresarial: data.config.nomeEmpresarial ?? "",
            responsavelCpf: data.config.responsavelCpf ?? "",
            responsavelNome: data.config.responsavelNome ?? "",
            responsavelDdd: data.config.responsavelDdd ?? "",
            responsavelTelefone: data.config.responsavelTelefone ?? "",
          })
        } else if (data.nfseCnpj) {
          setValue("cnpj", data.nfseCnpj)
        }
      })
      .catch(() => toast.error("Erro ao carregar configuração fiscal"))
      .finally(() => setLoading(false))
  })

  async function onSubmit(values: FiscalConfigForm) {
    setSaving(true)
    try {
      const res = await fetch("/api/financeiro/fiscal/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Erro ao salvar")
        return
      }
      toast.success("Configuração fiscal salva")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("dmedEnabled")} />
        Gerar DMED para esta clínica
      </label>

      <div>
        <label className="mb-1 block text-sm font-medium">CNPJ</label>
        <Input {...register("cnpj")} placeholder="00.000.000/0000-00" />
        {nfseCnpj && !watch("cnpj") && (
          <p className="mt-1 text-xs text-muted-foreground">CNPJ da NFS-e disponível: {nfseCnpj}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Nome empresarial</label>
        <Input {...register("nomeEmpresarial")} />
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Responsável pela DMED</legend>
        <div>
          <label className="mb-1 block text-sm font-medium">CPF</label>
          <Input {...register("responsavelCpf")} placeholder="000.000.000-00" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Nome</label>
          <Input {...register("responsavelNome")} />
        </div>
        <div className="flex gap-3">
          <div className="w-24">
            <label className="mb-1 block text-sm font-medium">DDD</label>
            <Input {...register("responsavelDdd")} placeholder="11" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">Telefone</label>
            <Input {...register("responsavelTelefone")} />
          </div>
        </div>
      </fieldset>

      <Button type="submit" disabled={saving}>
        {saving ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  )
}
