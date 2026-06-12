"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Input, Button } from "@/shared/components/ui"
import { formatPhoneDisplay } from "@/lib/phone"
import type { BookingRequestItem } from "./types"

interface PatientHit {
  id: string
  name: string
  phone: string
}

/**
 * Inline panel shown when approving a request without a resolved patient:
 * search to link an existing patient, or create a new one pre-filled from the
 * request (mirrors the intake approve-with-edit flow).
 */
export function LinkOrCreatePatient({
  request,
  onLink,
  onCreate,
}: {
  request: BookingRequestItem
  onLink: (patientId: string) => void
  onCreate: (data: { name: string; phone: string; email?: string; cpf?: string }) => void
}) {
  const [tab, setTab] = useState<"link" | "create">("link")
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<PatientHit[]>([])
  const [searching, setSearching] = useState(false)

  async function search() {
    if (query.trim().length < 2) return
    setSearching(true)
    try {
      const res = await fetch(`/api/patients?search=${encodeURIComponent(query)}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setHits((data.patients ?? []).map((p: PatientHit) => ({ id: p.id, name: p.name, phone: p.phone })))
      }
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setTab("link")}
          className={`flex-1 py-1.5 rounded text-sm ${tab === "link" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"}`}
        >
          Vincular a paciente existente
        </button>
        <button
          type="button"
          onClick={() => setTab("create")}
          className={`flex-1 py-1.5 rounded text-sm ${tab === "create" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"}`}
        >
          Criar novo paciente
        </button>
      </div>

      {tab === "link" ? (
        <div className="space-y-2">
          <div className="flex gap-2 items-end">
            <Input
              label="Buscar paciente"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button variant="secondary" size="sm" onClick={search} loading={searching}>
              <Search size={15} />
            </Button>
          </div>
          <ul className="space-y-1">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onLink(h.id)}
                  className="w-full flex justify-between items-center text-left text-sm p-2 rounded hover:bg-muted"
                >
                  <span className="text-foreground">{h.name}</span>
                  <span className="text-xs text-muted-foreground">{formatPhoneDisplay(h.phone)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <CreatePatientMini request={request} onCreate={onCreate} />
      )}
    </div>
  )
}

function CreatePatientMini({
  request,
  onCreate,
}: {
  request: BookingRequestItem
  onCreate: (data: { name: string; phone: string; email?: string; cpf?: string }) => void
}) {
  const [name, setName] = useState(request.name)
  const [phone, setPhone] = useState(formatPhoneDisplay(request.phone))
  const [email, setEmail] = useState(request.email)
  const [cpf, setCpf] = useState(request.cpf ?? "")

  return (
    <div className="space-y-2">
      <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Input label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input label="CPF (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} />
      <Button
        size="sm"
        onClick={() => onCreate({ name, phone, email: email || undefined, cpf: cpf || undefined })}
      >
        Criar e agendar
      </Button>
    </div>
  )
}
