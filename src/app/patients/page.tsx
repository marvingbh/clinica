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
  EyeIcon,
  PencilIcon,
  BanIcon,
  RotateCcwIcon,
} from "@/shared/components/ui"

// WhatsApp format validation
const phoneRegex = /^(\+?55)?(\d{2})(\d{8,9})$/

const patientSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  phone: z
    .string()
    .min(1, "Telefone é obrigatório")
    .regex(phoneRegex, "Telefone inválido. Use formato: 11999999999"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  fatherName: z.string().max(200).optional().or(z.literal("")),
  motherName: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  referenceProfessionalId: z.string().optional().or(z.literal("")),
  consentWhatsApp: z.boolean(),
  consentEmail: z.boolean(),
})

type PatientFormData = z.infer<typeof patientSchema>

interface Appointment {
  id: string
  scheduledAt: string
  endAt: string
  status: string
  modality: string
  notes: string | null
  professionalProfile: {
    id: string
    user: {
      name: string
    }
  }
}

interface ReferenceProfessional {
  id: string
  user: {
    name: string
  }
}

interface Professional {
  id: string
  name: string
  professionalProfile: {
    id: string
  } | null
}

interface AdditionalPhone {
  id?: string
  phone: string
  label: string
}

interface Patient {
  id: string
  name: string
  email: string | null
  phone: string
  birthDate: string | null
  fatherName: string | null
  motherName: string | null
  notes: string | null
  isActive: boolean
  lastVisitAt: string | null
  consentWhatsApp: boolean
  consentWhatsAppAt: string | null
  consentEmail: boolean
  consentEmailAt: string | null
  createdAt: string
  referenceProfessionalId: string | null
  referenceProfessional: ReferenceProfessional | null
  additionalPhones?: AdditionalPhone[]
  appointments?: Appointment[]
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-"
  return new Date(dateString).toLocaleDateString("pt-BR")
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const statusLabels: Record<string, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  CANCELADO_PACIENTE: "Cancelado (Paciente)",
  CANCELADO_PROFISSIONAL: "Cancelado (Profissional)",
  NAO_COMPARECEU: "Não compareceu",
  FINALIZADO: "Finalizado",
}

const statusColors: Record<string, string> = {
  AGENDADO: "bg-blue-100 text-blue-800",
  CONFIRMADO: "bg-green-100 text-green-800",
  CANCELADO_PACIENTE: "bg-red-100 text-red-800",
  CANCELADO_PROFISSIONAL: "bg-red-100 text-red-800",
  NAO_COMPARECEU: "bg-yellow-100 text-yellow-800",
  FINALIZADO: "bg-gray-100 text-gray-800",
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

  const isAdmin = session?.user?.role === "ADMIN"

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
  }, [searchDebounced, filterActive, pagination.page, router])

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
      fatherName: "",
      motherName: "",
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
      fatherName: patient.fatherName ?? "",
      motherName: patient.motherName ?? "",
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
        fatherName: data.fatherName || null,
        motherName: data.motherName || null,
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
          {isAdmin && (
            <button
              onClick={openCreateSheet}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity"
            >
              + Novo Paciente
            </button>
          )}
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por nome, email ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            />
          </div>
          <select
            value={filterActive}
            onChange={(e) => {
              setFilterActive(e.target.value)
              setPagination((prev) => ({ ...prev, page: 1 }))
            }}
            className="h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
          >
            <option value="all">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>

        {/* Patients Table */}
        {patients.length === 0 ? (
          <EmptyState
            title={search || filterActive !== "all" ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
            message={search || filterActive !== "all" ? "Tente ajustar os filtros de busca" : "Adicione seu primeiro paciente para comecar"}
            action={isAdmin && !search && filterActive === "all" ? { label: "Adicionar paciente", onClick: openCreateSheet } : undefined}
            icon={<UsersIcon className="w-8 h-8 text-muted-foreground" />}
          />
        ) : (
          <>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Nome</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground hidden sm:table-cell">Telefone</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground hidden md:table-cell">Profissional</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground hidden lg:table-cell">Ultima Visita</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-muted-foreground">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {patients.map((patient) => (
                      <tr
                        key={patient.id}
                        className={`hover:bg-muted/30 transition-colors ${!patient.isActive ? "opacity-60" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openViewSheet(patient)}
                              className="font-medium text-foreground hover:text-primary transition-colors text-left"
                            >
                              {patient.name}
                            </button>
                            <div className="flex gap-1">
                              {patient.consentWhatsApp && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  WA
                                </span>
                              )}
                              {patient.consentEmail && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  Email
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Mobile: show phone below name */}
                          <p className="text-sm text-muted-foreground sm:hidden mt-1">
                            {formatPhone(patient.phone)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                          {formatPhone(patient.phone)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                          {patient.referenceProfessional?.user.name || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden lg:table-cell">
                          {formatDate(patient.lastVisitAt)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex text-xs px-2 py-1 rounded-full ${
                              patient.isActive
                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            }`}
                          >
                            {patient.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openViewSheet(patient)}
                              title="Ver detalhes"
                              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => openEditSheet(patient)}
                                  title="Editar"
                                  className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                                {patient.isActive ? (
                                  <button
                                    onClick={() => handleDeactivate(patient)}
                                    title="Desativar"
                                    className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  >
                                    <BanIcon className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleReactivate(patient)}
                                    title="Reativar"
                                    className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                  >
                                    <RotateCcwIcon className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

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
            <div className="w-full max-w-4xl bg-background border-t border-border rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
              <div className="max-w-2xl mx-auto px-4 py-6">
                {/* Handle */}
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-1.5 rounded-full bg-muted" />
                </div>

              {/* View Mode */}
              {viewingPatient && !editingPatient && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-foreground">
                      {viewingPatient.name}
                    </h2>
                    {isAdmin && (
                      <button
                        onClick={() => openEditSheet(viewingPatient)}
                        className="h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                      >
                        Editar
                      </button>
                    )}
                  </div>

                  {isLoadingDetails ? (
                    <div className="animate-pulse space-y-4">
                      <div className="h-6 w-32 bg-muted rounded" />
                      <div className="h-4 w-48 bg-muted rounded" />
                      <div className="h-4 w-40 bg-muted rounded" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Reference Professional */}
                      {viewingPatient.referenceProfessional && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                          <label className="text-sm text-muted-foreground">Profissional de Referencia</label>
                          <p className="text-foreground font-medium">{viewingPatient.referenceProfessional.user.name}</p>
                        </div>
                      )}

                      {/* Contact Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-muted-foreground">Telefone</label>
                          <p className="text-foreground">{formatPhone(viewingPatient.phone)}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Email</label>
                          <p className="text-foreground">{viewingPatient.email || "-"}</p>
                        </div>
                      </div>

                      {/* Additional Phones */}
                      {viewingPatient.additionalPhones && viewingPatient.additionalPhones.length > 0 && (
                        <div>
                          <label className="text-sm text-muted-foreground mb-2 block">Telefones adicionais</label>
                          <div className="space-y-2">
                            {viewingPatient.additionalPhones.map((phone, index) => (
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

                      {/* Parents Info */}
                      {(viewingPatient.fatherName || viewingPatient.motherName) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-muted-foreground">Nome do Pai</label>
                            <p className="text-foreground">{viewingPatient.fatherName || "-"}</p>
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground">Nome da Mae</label>
                            <p className="text-foreground">{viewingPatient.motherName || "-"}</p>
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {viewingPatient.notes && (
                        <div>
                          <label className="text-sm text-muted-foreground">Observacoes</label>
                          <p className="text-foreground whitespace-pre-wrap">{viewingPatient.notes}</p>
                        </div>
                      )}

                      {/* Consent Info */}
                      <div>
                        <label className="text-sm text-muted-foreground mb-2 block">Consentimentos LGPD</label>
                        <div className="flex gap-4">
                          <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${viewingPatient.consentWhatsApp ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span className="text-sm">WhatsApp</span>
                            {viewingPatient.consentWhatsAppAt && (
                              <span className="text-xs text-muted-foreground">
                                ({formatDate(viewingPatient.consentWhatsAppAt)})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full ${viewingPatient.consentEmail ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span className="text-sm">Email</span>
                            {viewingPatient.consentEmailAt && (
                              <span className="text-xs text-muted-foreground">
                                ({formatDate(viewingPatient.consentEmailAt)})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Appointment History */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-medium text-foreground">
                            Historico de Consultas
                          </h3>
                          {appointmentsTotal > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {viewingPatient.appointments?.length || 0} de {appointmentsTotal}
                            </span>
                          )}
                        </div>

                        {/* Status filter chips */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          {[
                            { value: "", label: "Todos" },
                            { value: "AGENDADO", label: "Agendado" },
                            { value: "CONFIRMADO", label: "Confirmado" },
                            { value: "FINALIZADO", label: "Finalizado" },
                            { value: "CANCELADO_PACIENTE", label: "Canc. Paciente" },
                            { value: "CANCELADO_PROFISSIONAL", label: "Canc. Profissional" },
                            { value: "NAO_COMPARECEU", label: "Faltou" },
                          ].map((filter) => (
                            <button
                              key={filter.value}
                              type="button"
                              onClick={() => {
                                setAppointmentsStatusFilter(filter.value)
                                if (viewingPatient) {
                                  fetchPatientDetails(viewingPatient.id, filter.value, 0)
                                }
                              }}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                                appointmentsStatusFilter === filter.value
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background text-muted-foreground border-input hover:bg-muted"
                              }`}
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>

                        {viewingPatient.appointments && viewingPatient.appointments.length > 0 ? (
                          <>
                            <div className="space-y-3">
                              {viewingPatient.appointments.map((appointment) => (
                                <div
                                  key={appointment.id}
                                  className="bg-muted/50 rounded-lg p-4"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium">
                                      {formatDateTime(appointment.scheduledAt)}
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded-full ${statusColors[appointment.status] || 'bg-gray-100 text-gray-800'}`}>
                                      {statusLabels[appointment.status] || appointment.status}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {appointment.professionalProfile.user.name}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {appointment.modality === "ONLINE" ? "Online" : "Presencial"}
                                  </p>
                                </div>
                              ))}
                            </div>

                            {/* Load more button */}
                            {viewingPatient.appointments.length < appointmentsTotal && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (viewingPatient) {
                                    fetchPatientDetails(
                                      viewingPatient.id,
                                      appointmentsStatusFilter,
                                      viewingPatient.appointments?.length || 0
                                    )
                                  }
                                }}
                                disabled={isLoadingMoreAppointments}
                                className="w-full mt-4 h-10 rounded-lg border border-input bg-background text-sm text-muted-foreground font-medium hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
                              >
                                {isLoadingMoreAppointments
                                  ? "Carregando..."
                                  : `Carregar mais (${appointmentsTotal - viewingPatient.appointments.length} restantes)`}
                              </button>
                            )}
                          </>
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            {appointmentsStatusFilter
                              ? "Nenhuma consulta com este filtro"
                              : "Nenhuma consulta registrada"}
                          </p>
                        )}
                      </div>

                      <div className="pt-4">
                        <button
                          type="button"
                          onClick={closeSheet}
                          className="w-full h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Create/Edit Mode */}
              {(editingPatient || (!viewingPatient && !isLoadingDetails)) && isAdmin && (
                <>
                  <h2 className="text-xl font-semibold text-foreground mb-6">
                    {editingPatient ? "Editar Paciente" : "Novo Paciente"}
                  </h2>

                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                        Nome *
                      </label>
                      <input
                        id="name"
                        type="text"
                        {...register("name")}
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                      {errors.name && (
                        <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-2">
                        Telefone (WhatsApp) *
                      </label>
                      <input
                        id="phone"
                        type="tel"
                        {...register("phone")}
                        placeholder="11999999999"
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                      {errors.phone && (
                        <p className="text-sm text-destructive mt-1">{errors.phone.message}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Formato: DDD + numero (ex: 11999999999)
                      </p>
                    </div>

                    {/* Additional Phones Section */}
                    <div className="border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-medium text-foreground">
                          Telefones adicionais
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setAdditionalPhones((prev) => [
                              ...prev,
                              { phone: "", label: "" },
                            ])
                          }
                          disabled={additionalPhones.length >= 4}
                          className="text-sm text-primary hover:text-primary/80 disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
                        >
                          + Adicionar telefone
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        Contatos adicionais que receberao notificacoes (mae, pai, responsavel, etc.)
                      </p>
                      {additionalPhones.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                          Nenhum telefone adicional
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {additionalPhones.map((phone, index) => (
                            <div key={index} className="flex gap-2 items-start">
                              <div className="flex-1 min-w-0">
                                <input
                                  type="text"
                                  placeholder="Rotulo (ex: Mae, Trabalho)"
                                  value={phone.label}
                                  onChange={(e) => {
                                    const updated = [...additionalPhones]
                                    updated[index] = { ...updated[index], label: e.target.value }
                                    setAdditionalPhones(updated)
                                  }}
                                  maxLength={30}
                                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <input
                                  type="tel"
                                  placeholder="11999999999"
                                  value={phone.phone}
                                  onChange={(e) => {
                                    const updated = [...additionalPhones]
                                    updated[index] = { ...updated[index], phone: e.target.value }
                                    setAdditionalPhones(updated)
                                  }}
                                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setAdditionalPhones((prev) =>
                                    prev.filter((_, i) => i !== index)
                                  )
                                }
                                className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Remover telefone"
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {additionalPhones.length >= 4 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Maximo de 4 telefones adicionais atingido
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        {...register("email")}
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                      {errors.email && (
                        <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="fatherName" className="block text-sm font-medium text-foreground mb-2">
                          Nome do Pai
                        </label>
                        <input
                          id="fatherName"
                          type="text"
                          {...register("fatherName")}
                          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                        />
                        {errors.fatherName && (
                          <p className="text-sm text-destructive mt-1">{errors.fatherName.message}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="motherName" className="block text-sm font-medium text-foreground mb-2">
                          Nome da Mae
                        </label>
                        <input
                          id="motherName"
                          type="text"
                          {...register("motherName")}
                          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                        />
                        {errors.motherName && (
                          <p className="text-sm text-destructive mt-1">{errors.motherName.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-2">
                        Observacoes administrativas
                      </label>
                      <textarea
                        id="notes"
                        rows={3}
                        {...register("notes")}
                        placeholder="Observacoes internas sobre o paciente..."
                        className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none"
                      />
                      {errors.notes && (
                        <p className="text-sm text-destructive mt-1">{errors.notes.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="referenceProfessionalId" className="block text-sm font-medium text-foreground mb-2">
                        Profissional de Referencia
                      </label>
                      <select
                        id="referenceProfessionalId"
                        {...register("referenceProfessionalId")}
                        disabled={isLoadingProfessionals}
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors disabled:opacity-50"
                      >
                        <option value="">Nenhum selecionado</option>
                        {professionals
                          .filter((prof) => prof.professionalProfile)
                          .map((prof) => (
                            <option key={prof.professionalProfile!.id} value={prof.professionalProfile!.id}>
                              {prof.name}
                            </option>
                          ))}
                      </select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Profissional responsavel principal pelo paciente
                      </p>
                    </div>

                    {/* LGPD Consent Section */}
                    <div className="border border-border rounded-lg p-4">
                      <h3 className="text-sm font-medium text-foreground mb-4">
                        Consentimentos LGPD
                      </h3>
                      <div className="space-y-4">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            {...register("consentWhatsApp")}
                            className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                          />
                          <div>
                            <span className="text-sm text-foreground">
                              Autorizo receber mensagens via WhatsApp
                            </span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Lembretes de consulta, confirmacoes e comunicacoes da clinica
                            </p>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            {...register("consentEmail")}
                            className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                          />
                          <div>
                            <span className="text-sm text-foreground">
                              Autorizo receber comunicacoes por email
                            </span>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Lembretes de consulta, confirmacoes e comunicacoes da clinica
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                      >
                        {isSaving
                          ? "Salvando..."
                          : editingPatient
                          ? "Salvar alteracoes"
                          : "Criar paciente"}
                      </button>
                      <button
                        type="button"
                        onClick={closeSheet}
                        className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                </>
              )}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* FAB for adding patients */}
      {isAdmin && (
        <FAB onClick={openCreateSheet} label="Novo paciente" />
      )}
    </main>
  )
}
