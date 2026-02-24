"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  FAB,
  SkeletonPage,
  EmptyState,
  UsersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/shared/components/ui"
import { usePermission } from "@/shared/hooks/usePermission"
import {
  PatientsSearchFilters,
  PatientsTable,
  PatientDetailsView,
  PatientForm,
} from "./components"
import type { Patient, Professional, AdditionalPhone, Pagination, PatientFormData } from "./components"

// WhatsApp format validation
const phoneRegex = /^(\+?55)?(\d{2})(\d{8,9})$/

const patientSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  phone: z
    .string()
    .min(1, "Telefone é obrigatório")
    .regex(phoneRegex, "Telefone inválido. Use formato: 11999999999"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  birthDate: z.string().optional().or(z.literal("")),
  fatherName: z.string().max(200).optional().or(z.literal("")),
  motherName: z.string().max(200).optional().or(z.literal("")),
  schoolName: z.string().max(200).optional().or(z.literal("")),
  firstAppointmentDate: z.string().optional().or(z.literal("")),
  sessionFee: z.string().optional().or(z.literal("")),
  lastFeeAdjustmentDate: z.string().optional().or(z.literal("")),
  therapeuticProject: z.string().max(5000).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  referenceProfessionalId: z.string().optional().or(z.literal("")),
  consentWhatsApp: z.boolean(),
  consentEmail: z.boolean(),
})

// Convert ISO date (YYYY-MM-DD or full ISO) to DD/MM/YYYY for display in inputs
function isoToBrDate(dateString: string | null): string {
  if (!dateString) return ""
  const d = new Date(dateString)
  if (isNaN(d.getTime())) return ""
  const day = String(d.getUTCDate()).padStart(2, "0")
  const month = String(d.getUTCMonth() + 1).padStart(2, "0")
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

// Convert DD/MM/YYYY to YYYY-MM-DD for API
function brDateToIso(brDate: string): string {
  if (!brDate) return ""
  const parts = brDate.split("/")
  if (parts.length !== 3) return ""
  const [day, month, year] = parts
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

const ITEMS_PER_PAGE = 15

export default function PatientsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: ITEMS_PER_PAGE,
    total: 0,
    totalPages: 0,
  })
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [filterActive, setFilterActive] = useState<string>("all")
  const [filterProfessional, setFilterProfessional] = useState<string>("")
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [viewingPatient, setViewingPatient] = useState<Patient | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [isLoadingProfessionals, setIsLoadingProfessionals] = useState(false)
  const [additionalPhones, setAdditionalPhones] = useState<AdditionalPhone[]>([])
  // Appointment history pagination
  const [appointmentsTotal, setAppointmentsTotal] = useState(0)
  const [appointmentsStatusFilter, setAppointmentsStatusFilter] = useState("")
  const [isLoadingMoreAppointments, setIsLoadingMoreAppointments] = useState(false)
  const APPOINTMENTS_PER_PAGE = 10

  const { canWrite } = usePermission("patients")
  const { canRead: canReadAudit } = usePermission("audit_logs")
  const [patientTab, setPatientTab] = useState<"dados" | "historico" | "financeiro">("dados")
  const [billingMode, setBillingMode] = useState<string>("PER_SESSION")

  useEffect(() => {
    setPatientTab("dados")
  }, [viewingPatient?.id])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search)
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      consentWhatsApp: false,
      consentEmail: false,
    },
  })

  const fetchPatients = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchDebounced) params.set("search", searchDebounced)
      if (filterActive !== "all") params.set("isActive", filterActive)
      if (filterProfessional) params.set("referenceProfessionalId", filterProfessional)
      params.set("page", pagination.page.toString())
      params.set("limit", ITEMS_PER_PAGE.toString())

      const response = await fetch(`/api/patients?${params.toString()}`)
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/")
          return
        }
        throw new Error("Failed to fetch patients")
      }
      const data = await response.json()
      setPatients(data.patients)
      setPagination(data.pagination)
    } catch {
      toast.error("Erro ao carregar pacientes")
    } finally {
      setIsLoading(false)
    }
  }, [searchDebounced, filterActive, filterProfessional, pagination.page, router])

  const fetchPatientDetails = useCallback(async (patientId: string, statusFilter = "", skip = 0) => {
    if (skip === 0) setIsLoadingDetails(true)
    else setIsLoadingMoreAppointments(true)
    try {
      const params = new URLSearchParams({
        appointmentsLimit: APPOINTMENTS_PER_PAGE.toString(),
        appointmentsSkip: skip.toString(),
      })
      if (statusFilter) params.set("appointmentsStatus", statusFilter)

      const response = await fetch(`/api/patients/${patientId}?${params.toString()}`)
      if (!response.ok) {
        throw new Error("Failed to fetch patient details")
      }
      const data = await response.json()
      if (skip === 0) {
        setViewingPatient(data.patient)
      } else {
        // Append to existing appointments
        setViewingPatient(prev => prev ? {
          ...prev,
          appointments: [...(prev.appointments || []), ...(data.patient.appointments || [])],
        } : data.patient)
      }
      setAppointmentsTotal(data.appointmentsTotal)
    } catch {
      toast.error("Erro ao carregar detalhes do paciente")
    } finally {
      setIsLoadingDetails(false)
      setIsLoadingMoreAppointments(false)
    }
  }, [APPOINTMENTS_PER_PAGE])

  const fetchProfessionals = useCallback(async () => {
    setIsLoadingProfessionals(true)
    try {
      const response = await fetch("/api/professionals")
      if (!response.ok) {
        throw new Error("Failed to fetch professionals")
      }
      const data = await response.json()
      setProfessionals(data.professionals || [])
    } catch {
      toast.error("Erro ao carregar profissionais")
    } finally {
      setIsLoadingProfessionals(false)
    }
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated") {
      fetchPatients()
      fetchProfessionals()
      fetch("/api/admin/settings")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.settings?.billingMode) setBillingMode(data.settings.billingMode) })
        .catch(() => {})
    }
  }, [status, router, fetchPatients, fetchProfessionals])

  function openCreateSheet() {
    setEditingPatient(null)
    setViewingPatient(null)
    setAdditionalPhones([])
    reset({
      name: "",
      phone: "",
      email: "",
      birthDate: "",
      fatherName: "",
      motherName: "",
      schoolName: "",
      firstAppointmentDate: "",
      sessionFee: "",
      lastFeeAdjustmentDate: "",
      therapeuticProject: "",
      notes: "",
      referenceProfessionalId: "",
      consentWhatsApp: false,
      consentEmail: false,
    })
    setIsSheetOpen(true)
  }

  function openEditSheet(patient: Patient) {
    setEditingPatient(patient)
    setViewingPatient(null)
    setAdditionalPhones(patient.additionalPhones || [])
    reset({
      name: patient.name,
      phone: patient.phone,
      email: patient.email ?? "",
      birthDate: isoToBrDate(patient.birthDate),
      fatherName: patient.fatherName ?? "",
      motherName: patient.motherName ?? "",
      schoolName: patient.schoolName ?? "",
      firstAppointmentDate: isoToBrDate(patient.firstAppointmentDate),
      sessionFee: patient.sessionFee != null ? String(patient.sessionFee) : "",
      lastFeeAdjustmentDate: isoToBrDate(patient.lastFeeAdjustmentDate),
      therapeuticProject: patient.therapeuticProject ?? "",
      notes: patient.notes ?? "",
      referenceProfessionalId: patient.referenceProfessionalId ?? "",
      consentWhatsApp: patient.consentWhatsApp,
      consentEmail: patient.consentEmail,
    })
    setIsSheetOpen(true)
  }

  function openViewSheet(patient: Patient) {
    setEditingPatient(null)
    setAppointmentsStatusFilter("")
    setAppointmentsTotal(0)
    fetchPatientDetails(patient.id)
    setIsSheetOpen(true)
  }

  function closeSheet() {
    setIsSheetOpen(false)
    setEditingPatient(null)
    setViewingPatient(null)
    setAdditionalPhones([])
    setAppointmentsStatusFilter("")
    setAppointmentsTotal(0)
  }

  async function onSubmit(data: PatientFormData) {
    setIsSaving(true)
    try {
      const url = editingPatient
        ? `/api/patients/${editingPatient.id}`
        : "/api/patients"
      const method = editingPatient ? "PATCH" : "POST"

      const payload: Record<string, unknown> = {
        name: data.name,
        phone: data.phone.replace(/\D/g, ""),
        email: data.email || null,
        birthDate: brDateToIso(data.birthDate || "") || null,
        fatherName: data.fatherName || null,
        motherName: data.motherName || null,
        schoolName: data.schoolName || null,
        firstAppointmentDate: brDateToIso(data.firstAppointmentDate || "") || null,
        sessionFee: data.sessionFee ? parseFloat(data.sessionFee) : null,
        lastFeeAdjustmentDate: brDateToIso(data.lastFeeAdjustmentDate || "") || null,
        therapeuticProject: data.therapeuticProject || null,
        notes: data.notes || null,
        referenceProfessionalId: data.referenceProfessionalId || null,
        consentWhatsApp: data.consentWhatsApp,
        consentEmail: data.consentEmail,
        additionalPhones: additionalPhones
          .filter((p) => p.phone.trim() && p.label.trim())
          .map((p) => ({
            id: p.id,
            phone: p.phone.replace(/\D/g, ""),
            label: p.label.trim(),
          })),
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save patient")
      }

      toast.success(
        editingPatient
          ? "Paciente atualizado com sucesso"
          : "Paciente criado com sucesso"
      )
      closeSheet()
      fetchPatients()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar paciente")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeactivate(patient: Patient) {
    if (!confirm(`Deseja realmente desativar ${patient.name}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/patients/${patient.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to deactivate patient")
      }

      toast.success("Paciente desativado com sucesso")
      fetchPatients()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao desativar paciente")
    }
  }

  async function handleReactivate(patient: Patient) {
    try {
      const response = await fetch(`/api/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to reactivate patient")
      }

      toast.success("Paciente reativado com sucesso")
      fetchPatients()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao reativar paciente")
    }
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page }))
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <SkeletonPage />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Voltar
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Pacientes</h1>
          {canWrite && (
            <button
              onClick={openCreateSheet}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity"
            >
              + Novo Paciente
            </button>
          )}
        </div>

        {/* Search and Filter */}
        <PatientsSearchFilters
          search={search}
          filterActive={filterActive}
          filterProfessional={filterProfessional}
          professionals={professionals}
          onSearchChange={setSearch}
          onFilterActiveChange={(value) => {
            setFilterActive(value)
            setPagination((prev) => ({ ...prev, page: 1 }))
          }}
          onFilterProfessionalChange={(value) => {
            setFilterProfessional(value)
            setPagination((prev) => ({ ...prev, page: 1 }))
          }}
        />

        {/* Patients Table */}
        {patients.length === 0 ? (
          <EmptyState
            title={search || filterActive !== "all" || filterProfessional ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
            message={search || filterActive !== "all" || filterProfessional ? "Tente ajustar os filtros de busca" : "Adicione seu primeiro paciente para comecar"}
            action={canWrite && !search && filterActive === "all" && !filterProfessional ? { label: "Adicionar paciente", onClick: openCreateSheet } : undefined}
            icon={<UsersIcon className="w-8 h-8 text-muted-foreground" />}
          />
        ) : (
          <>
            <PatientsTable
              patients={patients}
              canWrite={canWrite}
              onView={openViewSheet}
              onEdit={openEditSheet}
              onDeactivate={handleDeactivate}
              onReactivate={handleReactivate}
            />

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-2">
                <p className="text-sm text-muted-foreground">
                  Mostrando {((pagination.page - 1) * pagination.limit) + 1} a{" "}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} de{" "}
                  {pagination.total} pacientes
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => goToPage(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="h-9 w-9 flex items-center justify-center rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      let pageNum: number
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1
                      } else if (pagination.page <= 3) {
                        pageNum = i + 1
                      } else if (pagination.page >= pagination.totalPages - 2) {
                        pageNum = pagination.totalPages - 4 + i
                      } else {
                        pageNum = pagination.page - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => goToPage(pageNum)}
                          className={`h-9 w-9 flex items-center justify-center rounded-md text-sm font-medium transition-colors ${
                            pagination.page === pageNum
                              ? "bg-primary text-primary-foreground"
                              : "border border-input bg-background hover:bg-muted"
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => goToPage(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="h-9 w-9 flex items-center justify-center rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Sheet */}
      {isSheetOpen && isMounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeSheet}
          />
          {/* Sheet Container - centered on larger screens */}
          <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center">
            {/* Sheet - full width on mobile, max-width on larger screens */}
            <div className="w-full max-w-4xl bg-background border-t border-border rounded-t-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden animate-slide-up">
              <div className="max-w-2xl mx-auto px-4 py-6">
                {/* Handle + Close */}
                <div className="flex items-center justify-between mb-4">
                  <div className="w-8" />
                  <div className="w-12 h-1.5 rounded-full bg-muted" />
                  <button
                    type="button"
                    onClick={closeSheet}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Fechar"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>

              {/* View Mode */}
              {viewingPatient && !editingPatient && (
                <PatientDetailsView
                  patient={viewingPatient}
                  canWrite={canWrite}
                  canReadAudit={canReadAudit}
                  patientTab={patientTab}
                  isLoadingDetails={isLoadingDetails}
                  appointmentsTotal={appointmentsTotal}
                  appointmentsStatusFilter={appointmentsStatusFilter}
                  isLoadingMoreAppointments={isLoadingMoreAppointments}
                  onEdit={() => openEditSheet(viewingPatient)}
                  onClose={closeSheet}
                  onTabChange={setPatientTab}
                  onAppointmentsStatusFilterChange={(value) => {
                    setAppointmentsStatusFilter(value)
                    if (viewingPatient) {
                      fetchPatientDetails(viewingPatient.id, value, 0)
                    }
                  }}
                  onLoadMoreAppointments={() => {
                    if (viewingPatient) {
                      fetchPatientDetails(
                        viewingPatient.id,
                        appointmentsStatusFilter,
                        viewingPatient.appointments?.length || 0
                      )
                    }
                  }}
                  billingMode={billingMode}
                />
              )}

              {/* Create/Edit Mode */}
              {(editingPatient || (!viewingPatient && !isLoadingDetails)) && canWrite && (
                <PatientForm
                  register={register}
                  errors={errors}
                  control={control}
                  professionals={professionals}
                  isLoadingProfessionals={isLoadingProfessionals}
                  additionalPhones={additionalPhones}
                  isSaving={isSaving}
                  isEditing={!!editingPatient}
                  onAddPhone={() =>
                    setAdditionalPhones((prev) => [
                      ...prev,
                      { phone: "", label: "", notify: true },
                    ])
                  }
                  onUpdatePhone={(index, field, value) => {
                    const updated = [...additionalPhones]
                    updated[index] = { ...updated[index], [field]: value }
                    setAdditionalPhones(updated)
                  }}
                  onRemovePhone={(index) =>
                    setAdditionalPhones((prev) =>
                      prev.filter((_, i) => i !== index)
                    )
                  }
                  onClose={closeSheet}
                  onSubmit={handleSubmit(onSubmit)}
                  billingMode={billingMode}
                />
              )}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* FAB for adding patients */}
      {canWrite && (
        <FAB onClick={openCreateSheet} label="Novo paciente" />
      )}
    </main>
  )
}
