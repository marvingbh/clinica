"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

// WhatsApp format validation
const phoneRegex = /^(\+?55)?(\d{2})(\d{8,9})$/

const patientSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  phone: z
    .string()
    .min(1, "Telefone é obrigatório")
    .regex(phoneRegex, "Telefone inválido. Use formato: 11999999999"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
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

interface Patient {
  id: string
  name: string
  email: string | null
  phone: string
  birthDate: string | null
  notes: string | null
  isActive: boolean
  lastVisitAt: string | null
  consentWhatsApp: boolean
  consentWhatsAppAt: string | null
  consentEmail: boolean
  consentEmailAt: string | null
  createdAt: string
  appointments?: Appointment[]
}

function formatPhone(phone: string): string {
  // Format: (11) 99999-9999
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

export default function PatientsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState("")
  const [filterActive, setFilterActive] = useState<string>("all")
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)
  const [viewingPatient, setViewingPatient] = useState<Patient | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  const isAdmin = session?.user?.role === "ADMIN"

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
      if (search) params.set("search", search)
      if (filterActive !== "all") params.set("isActive", filterActive)

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
    } catch {
      toast.error("Erro ao carregar pacientes")
    } finally {
      setIsLoading(false)
    }
  }, [search, filterActive, router])

  const fetchPatientDetails = useCallback(async (patientId: string) => {
    setIsLoadingDetails(true)
    try {
      const response = await fetch(`/api/patients/${patientId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch patient details")
      }
      const data = await response.json()
      setViewingPatient(data.patient)
    } catch {
      toast.error("Erro ao carregar detalhes do paciente")
    } finally {
      setIsLoadingDetails(false)
    }
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated") {
      fetchPatients()
    }
  }, [status, router, fetchPatients])

  function openCreateSheet() {
    setEditingPatient(null)
    setViewingPatient(null)
    reset({
      name: "",
      phone: "",
      email: "",
      notes: "",
      consentWhatsApp: false,
      consentEmail: false,
    })
    setIsSheetOpen(true)
  }

  function openEditSheet(patient: Patient) {
    setEditingPatient(patient)
    setViewingPatient(null)
    reset({
      name: patient.name,
      phone: patient.phone,
      email: patient.email ?? "",
      notes: patient.notes ?? "",
      consentWhatsApp: patient.consentWhatsApp,
      consentEmail: patient.consentEmail,
    })
    setIsSheetOpen(true)
  }

  function openViewSheet(patient: Patient) {
    setEditingPatient(null)
    fetchPatientDetails(patient.id)
    setIsSheetOpen(true)
  }

  function closeSheet() {
    setIsSheetOpen(false)
    setEditingPatient(null)
    setViewingPatient(null)
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
        notes: data.notes || null,
        consentWhatsApp: data.consentWhatsApp,
        consentEmail: data.consentEmail,
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

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="flex gap-4">
              <div className="h-12 flex-1 bg-muted rounded" />
              <div className="h-12 w-32 bg-muted rounded" />
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted rounded" />
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
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
            onChange={(e) => setFilterActive(e.target.value)}
            className="h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
          >
            <option value="all">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>

        {/* Patients List */}
        <div className="space-y-4">
          {patients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {search || filterActive !== "all"
                ? "Nenhum paciente encontrado"
                : "Nenhum paciente cadastrado"}
            </div>
          ) : (
            patients.map((patient) => (
              <div
                key={patient.id}
                className={`bg-card border border-border rounded-lg p-4 sm:p-6 ${
                  !patient.isActive ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => openViewSheet(patient)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground truncate">
                        {patient.name}
                      </h3>
                      {!patient.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatPhone(patient.phone)}
                    </p>
                    {patient.email && (
                      <p className="text-sm text-muted-foreground truncate">
                        {patient.email}
                      </p>
                    )}
                    <div className="flex gap-3 mt-2">
                      {patient.consentWhatsApp && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                          WhatsApp
                        </span>
                      )}
                      {patient.consentEmail && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                          Email
                        </span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditSheet(patient)}
                        className="h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                      >
                        Editar
                      </button>
                      {patient.isActive ? (
                        <button
                          onClick={() => handleDeactivate(patient)}
                          className="h-9 px-3 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(patient)}
                          className="h-9 px-3 rounded-md border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                        >
                          Reativar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bottom Sheet */}
      {isSheetOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeSheet}
          />
          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
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
                        <h3 className="text-lg font-medium text-foreground mb-4">
                          Historico de Consultas
                        </h3>
                        {viewingPatient.appointments && viewingPatient.appointments.length > 0 ? (
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
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            Nenhuma consulta registrada
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
        </>
      )}

      {/* Animation Styles */}
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </main>
  )
}
