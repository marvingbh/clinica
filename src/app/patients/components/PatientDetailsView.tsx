"use client"

import { useState, useEffect } from "react"
import { HistoryTimeline } from "@/shared/components/HistoryTimeline"
import { Patient, formatPhone, formatDate, formatCurrency } from "./types"
import { AppointmentHistorySection } from "./AppointmentHistorySection"
import { getFeeLabel } from "@/lib/financeiro/billing-labels"

type PatientTabKey = "dados" | "historico" | "financeiro"

interface PatientDetailsViewProps {
  patient: Patient
  canWrite: boolean
  canReadAudit: boolean
  patientTab: PatientTabKey
  isLoadingDetails: boolean
  appointmentsTotal: number
  appointmentsStatusFilter: string
  isLoadingMoreAppointments: boolean
  onEdit: () => void
  onClose: () => void
  onTabChange: (tab: PatientTabKey) => void
  onAppointmentsStatusFilterChange: (value: string) => void
  onLoadMoreAppointments: () => void
  billingMode?: string
}

export function PatientDetailsView({
  patient,
  canWrite,
  canReadAudit,
  patientTab,
  isLoadingDetails,
  appointmentsTotal,
  appointmentsStatusFilter,
  isLoadingMoreAppointments,
  onEdit,
  onClose,
  onTabChange,
  onAppointmentsStatusFilterChange,
  onLoadMoreAppointments,
  billingMode = "PER_SESSION",
}: PatientDetailsViewProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">
          {patient.name}
        </h2>
        {canWrite && (
          <button
            onClick={onEdit}
            className="h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
          >
            Editar
          </button>
        )}
      </div>

      {canReadAudit && (
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-4">
          <button
            onClick={() => onTabChange("dados")}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              patientTab === "dados"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Dados
          </button>
          <button
            onClick={() => onTabChange("historico")}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              patientTab === "historico"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Historico
          </button>
          <button
            onClick={() => onTabChange("financeiro")}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              patientTab === "financeiro"
                ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Financeiro
          </button>
        </div>
      )}

      {isLoadingDetails ? (
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-4 w-48 bg-muted rounded" />
          <div className="h-4 w-40 bg-muted rounded" />
        </div>
      ) : (
        <>
        {patientTab === "dados" && (
        <div className="space-y-6">
          {/* Reference Professional */}
          {patient.referenceProfessional && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <label className="text-sm text-muted-foreground">Profissional de Referencia</label>
              <p className="text-foreground font-medium">{patient.referenceProfessional.user.name}</p>
            </div>
          )}

          {/* Contact Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Telefone</label>
              <p className="text-foreground">{formatPhone(patient.phone)}</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Email</label>
              <p className="text-foreground">{patient.email || "-"}</p>
            </div>
          </div>

          {/* Additional Phones */}
          {patient.additionalPhones && patient.additionalPhones.length > 0 && (
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Telefones adicionais</label>
              <div className="space-y-2">
                {patient.additionalPhones.map((phone, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-foreground">{formatPhone(phone.phone)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {phone.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Birth Date & First Appointment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Data de Nascimento</label>
              <p className="text-foreground">{formatDate(patient.birthDate)}</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Data Primeiro Atendimento</label>
              <p className="text-foreground">{formatDate(patient.firstAppointmentDate)}</p>
            </div>
          </div>

          {/* Parents Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Nome do Pai</label>
              <p className="text-foreground">{patient.fatherName || "-"}</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Nome da Mae</label>
              <p className="text-foreground">{patient.motherName || "-"}</p>
            </div>
          </div>

          {/* School */}
          <div>
            <label className="text-sm text-muted-foreground">Escola</label>
            <p className="text-foreground">{patient.schoolName || "-"}</p>
          </div>

          {/* Session Fee & Adjustment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">{getFeeLabel(billingMode)}</label>
              <p className="text-foreground">{formatCurrency(patient.sessionFee)}</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Ultimo Reajuste</label>
              <p className="text-foreground">{formatDate(patient.lastFeeAdjustmentDate)}</p>
            </div>
          </div>

          {/* Therapeutic Project */}
          {patient.therapeuticProject && (
            <div>
              <label className="text-sm text-muted-foreground">Projeto Terapeutico</label>
              <p className="text-foreground whitespace-pre-wrap">{patient.therapeuticProject}</p>
            </div>
          )}

          {/* Notes */}
          {patient.notes && (
            <div>
              <label className="text-sm text-muted-foreground">Observacoes</label>
              <p className="text-foreground whitespace-pre-wrap">{patient.notes}</p>
            </div>
          )}

          {/* Consent Info */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Consentimentos LGPD</label>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${patient.consentWhatsApp ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-sm">WhatsApp</span>
                {patient.consentWhatsAppAt && (
                  <span className="text-xs text-muted-foreground">
                    ({formatDate(patient.consentWhatsAppAt)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${patient.consentEmail ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-sm">Email</span>
                {patient.consentEmailAt && (
                  <span className="text-xs text-muted-foreground">
                    ({formatDate(patient.consentEmailAt)})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Appointment History */}
          <AppointmentHistorySection
            appointments={patient.appointments || []}
            total={appointmentsTotal}
            statusFilter={appointmentsStatusFilter}
            isLoadingMore={isLoadingMoreAppointments}
            onStatusFilterChange={onAppointmentsStatusFilterChange}
            onLoadMore={onLoadMoreAppointments}
          />

          <div className="pt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
        )}

        {patientTab === "historico" && (
          <HistoryTimeline entityType="Patient" entityId={patient.id} />
        )}

        {patientTab === "financeiro" && (
          <PatientFinanceTab patient={patient} billingMode={billingMode} />
        )}
        </>
      )}
    </>
  )
}

// ============================================================================
// PatientFinanceTab
// ============================================================================

interface InvoiceSummary {
  id: string
  month: number
  year: number
  totalAmount: string | number
  status: string
}

interface CreditSummary {
  id: string
  amount: string | number
  reason: string | null
  createdAt: string
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviada",
  PAID: "Paga",
  OVERDUE: "Atrasada",
  CANCELLED: "Cancelada",
}

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  SENT: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  PAID: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  OVERDUE: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
}

const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]

function PatientFinanceTab({ patient, billingMode = "PER_SESSION" }: { patient: Patient; billingMode?: string }) {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [credits, setCredits] = useState<CreditSummary[]>([])
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true)
  const [isLoadingCredits, setIsLoadingCredits] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchInvoices() {
      try {
        const res = await fetch(`/api/financeiro/faturas?patientId=${patient.id}`)
        if (!res.ok) throw new Error("Failed to fetch invoices")
        const data = await res.json()
        if (!cancelled) setInvoices(data.invoices || [])
      } catch {
        // silently fail - empty state will show
      } finally {
        if (!cancelled) setIsLoadingInvoices(false)
      }
    }

    async function fetchCredits() {
      try {
        const res = await fetch(`/api/financeiro/creditos?patientId=${patient.id}&status=available`)
        if (!res.ok) throw new Error("Failed to fetch credits")
        const data = await res.json()
        if (!cancelled) setCredits(data.credits || [])
      } catch {
        // silently fail - empty state will show
      } finally {
        if (!cancelled) setIsLoadingCredits(false)
      }
    }

    fetchInvoices()
    fetchCredits()

    return () => { cancelled = true }
  }, [patient.id])

  return (
    <div className="space-y-6">
      {/* Session Fee */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <label className="text-sm text-muted-foreground">{getFeeLabel(billingMode)}</label>
        <p className="text-foreground font-semibold text-lg">{formatCurrency(patient.sessionFee)}</p>
      </div>

      {/* Credits */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Creditos Disponiveis</h3>
        {isLoadingCredits ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
        ) : credits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum credito disponivel.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">
              {credits.length} credito{credits.length !== 1 ? "s" : ""} disponivel{credits.length !== 1 ? "is" : ""}
            </p>
            {credits.map((credit) => (
              <div
                key={credit.id}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-background text-sm"
              >
                <div>
                  <span className="font-medium text-foreground">{formatCurrency(credit.amount)}</span>
                  {credit.reason && (
                    <span className="text-muted-foreground ml-2 text-xs">{credit.reason}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(credit.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoices */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Faturas Recentes</h3>
        {isLoadingInvoices ? (
          <div className="animate-pulse space-y-2">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma fatura encontrada.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Periodo</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Valor</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">
                      {MONTH_NAMES[inv.month - 1]}/{inv.year}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground font-medium">
                      {formatCurrency(inv.totalAmount)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        INVOICE_STATUS_COLORS[inv.status] || "bg-gray-100 text-gray-700"
                      }`}>
                        {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
