"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import { toast } from "sonner"
import { BottomSheet } from "@/shared/components/ui/bottom-sheet"
import { formatCurrencyBRL, getMonthNameShort } from "@/lib/financeiro/format"
import { SearchIcon, CheckIcon, Loader2Icon, ArrowLeftIcon } from "lucide-react"
import type { CreatedInvoiceInfo } from "./types"

interface Patient {
  id: string
  name: string
  motherName: string | null
  fatherName: string | null
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

interface CreateInvoiceSheetProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (invoice: CreatedInvoiceInfo) => void
  defaultAmount?: number
  defaultDate?: string // ISO date string from the transaction
  defaultSearch?: string // payer name from the transaction
}

export function CreateInvoiceSheet({ isOpen, onClose, onCreated, defaultAmount, defaultDate, defaultSearch }: CreateInvoiceSheetProps) {
  const [step, setStep] = useState<Step>("patient")
  const [mode, setMode] = useState<Mode>("appointments")

  // Patient search
  const [patientSearch, setPatientSearch] = useState("")
  const [patients, setPatients] = useState<Patient[]>([])
  const [searchingPatients, setSearchingPatients] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Appointments mode
  const [appointments, setAppointments] = useState<UnbilledAppointment[]>([])
  const [loadingAppointments, setLoadingAppointments] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Manual mode — default to transaction date month/year
  const defaultRefDate = defaultDate ? new Date(defaultDate) : new Date()
  const [manualAmount, setManualAmount] = useState(defaultAmount ? String(defaultAmount) : "")
  const [manualDescription, setManualDescription] = useState("")
  const [refMonth, setRefMonth] = useState(defaultRefDate.getMonth() + 1)
  const [refYear, setRefYear] = useState(defaultRefDate.getFullYear())

  // Submit
  const [submitting, setSubmitting] = useState(false)

  const reset = useCallback(() => {
    setStep("patient")
    setMode("appointments")
    setPatientSearch("")
    setPatients([])
    setSelectedPatient(null)
    setAppointments([])
    setSelectedIds(new Set())
    setManualAmount(defaultAmount ? String(defaultAmount) : "")
    setManualDescription("")
    const d = defaultDate ? new Date(defaultDate) : new Date()
    setRefMonth(d.getMonth() + 1)
    setRefYear(d.getFullYear())
  }, [defaultAmount, defaultDate])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const searchPatients = useCallback((query: string) => {
    if (query.length < 2) { setPatients([]); return }
    setSearchingPatients(true)
    fetch(`/api/patients?search=${encodeURIComponent(query)}&limit=10`)
      .then(r => r.json())
      .then(data => setPatients(data.patients || []))
      .catch(() => {})
      .finally(() => setSearchingPatients(false))
  }, [])

  useEffect(() => {
    if (isOpen && defaultSearch && step === "patient" && !selectedPatient) {
      setPatientSearch(defaultSearch)
      searchPatients(defaultSearch)
    }
  }, [isOpen, defaultSearch]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const dateParams = defaultDate ? `&month=${defaultRefDate.getMonth() + 1}&year=${defaultRefDate.getFullYear()}` : ""
      const res = await fetch(`/api/financeiro/faturas/appointments-unbilled?patientId=${patient.id}${dateParams}`)
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

  async function handleSubmit() {
    if (!selectedPatient || !canContinue) return
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        patientId: selectedPatient.id,
        markAsPaid: false,
      }

      if (mode === "manual") {
        body.manualAmount = parsedManualAmount
        body.manualDescription = manualDescription || undefined
        body.referenceMonth = refMonth
        body.referenceYear = refYear
      } else {
        const profId = selectedAppointments[0]?.professionalProfileId || ""
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
      toast.success("Fatura criada")
      const firstApt = selectedAppointments[0]
      const invoiceRefMonth = mode === "manual" ? refMonth : (firstApt ? new Date(firstApt.scheduledAt).getMonth() + 1 : refMonth)
      const invoiceRefYear = mode === "manual" ? refYear : (firstApt ? new Date(firstApt.scheduledAt).getFullYear() : refYear)
      onCreated({
        id: data.id,
        patientName: selectedPatient!.name,
        totalAmount: effectiveTotal,
        referenceMonth: invoiceRefMonth,
        referenceYear: invoiceRefYear,
        description: mode === "manual" ? (manualDescription || "Valor avulso") : `${selectedIds.size} agendamento(s)`,
      })
      reset()
      onClose()
    } catch {
      toast.error("Erro ao criar fatura")
    } finally {
      setSubmitting(false)
    }
  }

  const stepTitle = step === "patient" ? "Criar Fatura"
    : step === "value" ? "Criar Fatura"
    : "Confirmar Fatura"

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title={stepTitle}>
      <div className="p-4 space-y-4">
        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs">
          {(["patient", "value", "confirm"] as const).map((s, i) => {
            const labels = ["Paciente", "Valor", "Confirmar"]
            const isCurrent = step === s
            const isPast = (step === "value" && i === 0) || (step === "confirm" && i < 2)
            return (
              <React.Fragment key={s}>
                {i > 0 && <span className="text-muted-foreground">—</span>}
                <span className={`px-2.5 py-1 rounded-full ${
                  isCurrent ? "bg-primary text-primary-foreground" :
                  isPast ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {labels[i]}
                </span>
              </React.Fragment>
            )
          })}
        </div>

        {/* Step 1: Patient */}
        {step === "patient" && (
          <div className="space-y-3">
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
              <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                {patients.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPatient(p)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {p.motherName && <span>Mãe: {p.motherName}</span>}
                        {p.fatherName && <span>Pai: {p.fatherName}</span>}
                      </div>
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
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-muted-foreground">Paciente: </span>
                <span className="font-medium">{selectedPatient?.name}</span>
              </div>
              <button
                onClick={() => { setStep("patient"); setSelectedIds(new Set()); setMode("appointments") }}
                className="text-xs text-primary hover:underline"
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
                  <div className="text-sm text-muted-foreground animate-pulse py-6 text-center">
                    Carregando agendamentos...
                  </div>
                ) : appointments.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    Nenhum agendamento não faturado encontrado
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                        {selectedIds.size === appointments.length ? "Desmarcar todos" : "Selecionar todos"}
                      </button>
                      <span className="text-xs text-muted-foreground">{selectedIds.size} selecionado(s)</span>
                    </div>

                    <div className="border border-border rounded-lg divide-y divide-border max-h-52 overflow-y-auto">
                      {appointments.map(apt => {
                        const isSelected = selectedIds.has(apt.id)
                        const price = apt.price ? Number(apt.price) : sessionFee
                        return (
                          <button
                            key={apt.id}
                            onClick={() => toggleAppointment(apt.id)}
                            className={`w-full text-left px-4 py-2.5 transition-colors flex items-center gap-3 ${
                              isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? "bg-primary border-primary text-primary-foreground" : "border-border"
                            }`}>
                              {isSelected && <CheckIcon className="w-3 h-3" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{formatDate(apt.scheduledAt)}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  {apt.type === "REUNIAO" ? apt.title || "Reunião" : "Sessão"}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {STATUS_LABELS[apt.status] || apt.status}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {apt.professionalProfile.user.name}
                              </div>
                            </div>
                            <span className="text-sm font-medium tabular-nums">{formatCurrencyBRL(price)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {mode === "manual" && (
              <div className="space-y-3">
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
                className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div className="border border-border rounded-lg p-4 space-y-2.5">
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
                    <span>{formatDate(apt.scheduledAt)} — {apt.type === "REUNIAO" ? apt.title || "Reunião" : "Sessão"}</span>
                    <span className="tabular-nums">{formatCurrencyBRL(apt.price ? Number(apt.price) : sessionFee)}</span>
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
                <span className="tabular-nums">{formatCurrencyBRL(effectiveTotal)}</span>
              </div>
            </div>

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
                className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {submitting && <Loader2Icon className="w-4 h-4 animate-spin" />}
                {submitting ? "Criando..." : "Criar Fatura"}
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
