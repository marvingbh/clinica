"use client"

import React, { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { formatCurrencyBRL, getMonthNameShort } from "@/lib/financeiro/format"
import { ArrowLeftIcon, SearchIcon, CheckIcon, LoaderIcon } from "@/shared/components/ui/icons"
import Link from "next/link"

interface Patient {
  id: string
  name: string
  sessionFee: string | null
  referenceProfessionalId: string | null
}

interface UnbilledAppointment {
  id: string
  scheduledAt: string
  status: string
  type: string
  title: string | null
  price: string | null
  professionalProfileId: string
  professionalProfile: { user: { name: string } }
}

type Step = "patient" | "value" | "confirm"
type Mode = "appointments" | "manual"

const STATUS_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  FINALIZADO: "Finalizado",
  CANCELADO_FALTA: "Falta",
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR")
}

export default function NovaFaturaPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("patient")
  const [mode, setMode] = useState<Mode>("appointments")

  // Patient search
  const [patientSearch, setPatientSearch] = useState("")
  const [patients, setPatients] = useState<Patient[]>([])
  const [searchingPatients, setSearchingPatients] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Appointments
  const [appointments, setAppointments] = useState<UnbilledAppointment[]>([])
  const [loadingAppointments, setLoadingAppointments] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Manual mode
  const [manualAmount, setManualAmount] = useState("")
  const [manualDescription, setManualDescription] = useState("")
  const [refMonth, setRefMonth] = useState(new Date().getMonth() + 1)
  const [refYear, setRefYear] = useState(new Date().getFullYear())

  // Submit
  const [markAsPaid, setMarkAsPaid] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const searchPatients = useCallback((query: string) => {
    if (query.length < 2) { setPatients([]); return }
    setSearchingPatients(true)
    fetch(`/api/patients?search=${encodeURIComponent(query)}&limit=10`)
      .then(r => r.json())
      .then(data => setPatients(data.patients || []))
      .catch(() => {})
      .finally(() => setSearchingPatients(false))
  }, [])

  function handlePatientSearchChange(value: string) {
    setPatientSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchPatients(value), 300)
  }

  async function handleSelectPatient(patient: Patient) {
    setSelectedPatient(patient)
    setStep("value")
    setLoadingAppointments(true)
    try {
      const res = await fetch(`/api/financeiro/faturas/appointments-unbilled?patientId=${patient.id}`)
      const data = await res.json()
      setAppointments(Array.isArray(data) ? data : [])
    } catch {
      toast.error("Erro ao buscar agendamentos")
    } finally {
      setLoadingAppointments(false)
    }
  }

  function toggleAppointment(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selectedIds.size === appointments.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(appointments.map(a => a.id)))
    }
  }

  const selectedAppointments = appointments.filter(a => selectedIds.has(a.id))
  const sessionFee = selectedPatient?.sessionFee ? Number(selectedPatient.sessionFee) : 0
  const appointmentTotal = selectedAppointments.reduce((sum, a) => {
    return sum + (a.price ? Number(a.price) : sessionFee)
  }, 0)
  const parsedManualAmount = parseFloat(manualAmount) || 0

  const effectiveTotal = mode === "manual" ? parsedManualAmount : appointmentTotal
  const canContinue = mode === "manual"
    ? parsedManualAmount > 0
    : selectedIds.size > 0

  const profId = selectedAppointments[0]?.professionalProfileId || ""

  async function handleSubmit() {
    if (!selectedPatient || !canContinue) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        patientId: selectedPatient.id,
        markAsPaid,
      }

      if (mode === "manual") {
        body.manualAmount = parsedManualAmount
        body.manualDescription = manualDescription || undefined
        body.referenceMonth = refMonth
        body.referenceYear = refYear
      } else {
        body.professionalProfileId = profId
        body.appointmentIds = Array.from(selectedIds)
      }

      const res = await fetch("/api/financeiro/faturas/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao criar fatura")
        return
      }
      toast.success("Fatura criada com sucesso")
      router.push(`/financeiro/faturas/${data.id}`)
    } catch {
      toast.error("Erro ao criar fatura")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/financeiro/faturas" className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-semibold">Nova Fatura Manual</h1>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {(["patient", "value", "confirm"] as const).map((s, i) => {
          const labels = ["Paciente", "Valor", "Confirmar"]
          const isCurrent = step === s
          const isPast = (step === "value" && i === 0) || (step === "confirm" && i < 2)
          return (
            <React.Fragment key={s}>
              {i > 0 && <span className="text-muted-foreground">—</span>}
              <span className={`px-3 py-1 rounded-full ${
                isCurrent ? "bg-primary text-primary-foreground" :
                isPast ? "bg-green-100 text-green-800" :
                "bg-muted text-muted-foreground"
              }`}>
                {labels[i]}
              </span>
            </React.Fragment>
          )
        })}
      </div>

      {/* Step 1: Select Patient */}
      {step === "patient" && (
        <div className="space-y-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar paciente por nome..."
              value={patientSearch}
              onChange={e => handlePatientSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>

          {searchingPatients && (
            <div className="text-sm text-muted-foreground animate-pulse">Buscando...</div>
          )}

          {patients.length > 0 && (
            <div className="border border-border rounded-lg divide-y divide-border">
              {patients.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPatient(p)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    {p.sessionFee && (
                      <div className="text-xs text-muted-foreground">
                        Sessão: {formatCurrencyBRL(Number(p.sessionFee))}
                      </div>
                    )}
                  </div>
                  <ArrowLeftIcon className="w-4 h-4 rotate-180 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {patientSearch.length >= 2 && !searchingPatients && patients.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              Nenhum paciente encontrado
            </div>
          )}
        </div>
      )}

      {/* Step 2: Value — appointments or manual */}
      {step === "value" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-muted-foreground">Paciente: </span>
              <span className="font-medium">{selectedPatient?.name}</span>
            </div>
            <button
              onClick={() => { setStep("patient"); setSelectedIds(new Set()); setMode("appointments") }}
              className="text-sm text-primary hover:underline"
            >
              Alterar
            </button>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setMode("appointments")}
              className={`flex-1 py-2 text-center transition-colors ${
                mode === "appointments"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              Agendamentos
            </button>
            <button
              onClick={() => setMode("manual")}
              className={`flex-1 py-2 text-center transition-colors ${
                mode === "manual"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              Valor avulso
            </button>
          </div>

          {mode === "appointments" && (
            <>
              {loadingAppointments ? (
                <div className="text-sm text-muted-foreground animate-pulse py-8 text-center">
                  Carregando agendamentos...
                </div>
              ) : appointments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum agendamento não faturado encontrado
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <button onClick={toggleAll} className="text-sm text-primary hover:underline">
                      {selectedIds.size === appointments.length ? "Desmarcar todos" : "Selecionar todos"}
                    </button>
                    <span className="text-sm text-muted-foreground">
                      {selectedIds.size} selecionado(s)
                    </span>
                  </div>

                  <div className="border border-border rounded-lg divide-y divide-border max-h-96 overflow-y-auto">
                    {appointments.map(apt => {
                      const isSelected = selectedIds.has(apt.id)
                      const price = apt.price ? Number(apt.price) : sessionFee
                      return (
                        <button
                          key={apt.id}
                          onClick={() => toggleAppointment(apt.id)}
                          className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 ${
                            isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? "bg-primary border-primary text-primary-foreground" : "border-border"
                          }`}>
                            {isSelected && <CheckIcon className="w-3.5 h-3.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{formatDate(apt.scheduledAt)}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {apt.type === "REUNIAO" ? apt.title || "Reunião" : "Sessão"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {STATUS_LABELS[apt.status] || apt.status}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {apt.professionalProfile.user.name}
                            </div>
                          </div>
                          <span className="text-sm font-medium">{formatCurrencyBRL(price)}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {mode === "manual" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Valor</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualAmount}
                    onChange={e => setManualAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <input
                  type="text"
                  value={manualDescription}
                  onChange={e => setManualDescription(e.target.value)}
                  placeholder="Ex: Sessão extra, Avaliação, Relatório..."
                  maxLength={200}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">Mês referência</label>
                  <select
                    value={refMonth}
                    onChange={e => setRefMonth(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{getMonthNameShort(i + 1)}</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-sm font-medium mb-1">Ano</label>
                  <input
                    type="number"
                    value={refYear}
                    onChange={e => setRefYear(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-medium">
              Total: {formatCurrencyBRL(effectiveTotal)}
            </span>
            <button
              onClick={() => setStep("confirm")}
              disabled={!canContinue}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === "confirm" && (
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paciente</span>
              <span className="font-medium">{selectedPatient?.name}</span>
            </div>
            {mode === "appointments" && selectedAppointments[0] && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profissional</span>
                <span className="font-medium">
                  {selectedAppointments[0].professionalProfile.user.name}
                </span>
              </div>
            )}
            {mode === "manual" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Referência</span>
                <span className="font-medium">{getMonthNameShort(refMonth)}/{refYear}</span>
              </div>
            )}
            <hr className="border-border" />
            {mode === "appointments" ? (
              selectedAppointments.map(apt => (
                <div key={apt.id} className="flex justify-between text-sm">
                  <span>
                    {formatDate(apt.scheduledAt)} — {apt.type === "REUNIAO" ? apt.title || "Reunião" : "Sessão"}
                  </span>
                  <span>{formatCurrencyBRL(apt.price ? Number(apt.price) : sessionFee)}</span>
                </div>
              ))
            ) : (
              <div className="flex justify-between text-sm">
                <span>{manualDescription || "Valor avulso"}</span>
                <span className="tabular-nums">{formatCurrencyBRL(parsedManualAmount)}</span>
              </div>
            )}
            <hr className="border-border" />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatCurrencyBRL(effectiveTotal)}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={markAsPaid}
              onChange={e => setMarkAsPaid(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm">Marcar como pago</span>
          </label>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setStep("value")}
              className="px-4 py-2 border border-input bg-background rounded-lg text-sm hover:bg-muted transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {submitting && <LoaderIcon className="w-4 h-4 animate-spin" />}
              {submitting ? "Criando..." : "Criar Fatura"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
