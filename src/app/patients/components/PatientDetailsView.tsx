"use client"

import { HistoryTimeline } from "@/shared/components/HistoryTimeline"
import { Patient, formatPhone, formatDate, formatCurrency } from "./types"
import { AppointmentHistorySection } from "./AppointmentHistorySection"
import { getFeeLabel } from "@/lib/financeiro/billing-labels"
import { usePermission } from "@/shared/hooks"
import { ProntuarioTab } from "./prontuario/ProntuarioTab"
import { DocumentsTab } from "./DocumentsTab"
import { PatientFormsSection } from "./PatientFormsSection"
import { ScalesTab } from "./escalas/ScalesTab"
import { PatientFinanceTab } from "./PatientFinanceTab"
import { PatientDocumentsTab } from "./documents/PatientDocumentsTab"

type PatientTabKey =
  | "dados"
  | "historico"
  | "financeiro"
  | "prontuario"
  | "documentos"
  | "anexos"
  | "formularios"
  | "escalas"

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
  const { canRead: canReadProntuario } = usePermission("prontuario")
  const { canWrite: canManagePatients } = usePermission("patients")
  const { canRead: canReadDocuments, canWrite: canWriteDocuments } = usePermission("documents")
  const { canRead: canReadForms } = usePermission("forms")
  const { canRead: canReadEscalas, canWrite: canWriteEscalas } = usePermission("escalas")
  // The Prontuário tab appears for clinical readers (notes) and for staff who
  // manage the patient lifecycle (ADMIN), who still cannot read note content.
  const canSeeProntuarioTab = canReadProntuario || canManagePatients
  // Escalas: clinical readers see scores/trajectory; ADMIN (patients WRITE) sees
  // metadata only (status/dates, no scores) via the metadata endpoint.
  const canSeeEscalasTab = canReadEscalas || canManagePatients
  // The tab bar always shows: the Anexos (patient file attachments) tab rides on
  // the `patients` feature, so anyone who can open the patient detail panel
  // (patients READ) can see it alongside the conditional clinical tabs.
  const showTabs = true
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

      {showTabs && (
        <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-4">
          {(
            [
              { key: "dados", label: "Dados", visible: true },
              { key: "historico", label: "Historico", visible: canReadAudit },
              { key: "financeiro", label: "Financeiro", visible: canReadAudit },
              { key: "prontuario", label: "Prontuário", visible: canSeeProntuarioTab },
              { key: "documentos", label: "Documentos", visible: canReadDocuments },
              { key: "anexos", label: "Anexos", visible: true },
              { key: "formularios", label: "Formulários", visible: canReadForms },
              { key: "escalas", label: "Escalas", visible: canSeeEscalasTab },
            ] as { key: PatientTabKey; label: string; visible: boolean }[]
          )
            .filter((t) => t.visible)
            .map((t) => (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap flex-shrink-0 transition-colors ${
                  patientTab === t.key
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
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
                    {phone.notify === false && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                        Sem notificacao
                      </span>
                    )}
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

        {patientTab === "prontuario" && (
          <ProntuarioTab
            patientId={patient.id}
            recordClosedAt={patient.recordClosedAt ?? null}
          />
        )}

        {patientTab === "documentos" && (
          <DocumentsTab
            patientId={patient.id}
            patientEmail={patient.email}
            patientPhone={patient.phone}
            patientName={patient.name}
            patientCpf={patient.cpf ?? null}
            patientBirthDate={patient.birthDate ?? null}
            guardianName={patient.billingResponsibleName ?? patient.motherName ?? patient.fatherName ?? null}
            guardianCpf={patient.billingCpf ?? null}
            guardianPhone={patient.phone ?? null}
            canWrite={canWriteDocuments}
          />
        )}

        {patientTab === "anexos" && (
          <PatientDocumentsTab
            key={patient.id}
            patientId={patient.id}
            canWrite={canWrite}
          />
        )}

        {patientTab === "formularios" && (
          <PatientFormsSection patientId={patient.id} patientName={patient.name} />
        )}

        {patientTab === "escalas" && (
          <ScalesTab
            key={patient.id}
            patientId={patient.id}
            patientName={patient.name}
            birthDate={patient.birthDate ?? null}
            canReadContent={canReadEscalas}
            canWrite={canWriteEscalas}
            hasWhatsAppConsent={!!patient.consentWhatsApp && !!patient.phone}
            hasEmailConsent={!!patient.consentEmail && !!patient.email}
          />
        )}
        </>
      )}
    </>
  )
}
