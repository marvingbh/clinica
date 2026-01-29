"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  BottomNavigation,
  FAB,
  SkeletonPage,
  EmptyState,
} from "@/shared/components/ui"

const professionalSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").optional().or(z.literal("")),
  specialty: z.string().max(100).optional().or(z.literal("")),
  registrationNumber: z.string().max(50).optional().or(z.literal("")),
  appointmentDuration: z
    .number()
    .int()
    .min(15, "Duração mínima é 15 minutos")
    .max(180, "Duração máxima é 180 minutos")
    .optional(),
})

type ProfessionalFormData = z.infer<typeof professionalSchema>

interface Professional {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  professionalProfile: {
    id: string
    specialty: string | null
    registrationNumber: string | null
    bio: string | null
    appointmentDuration: number
    bufferBetweenSlots: number
    allowOnlineBooking: boolean
    maxAdvanceBookingDays: number
  } | null
}

export default function ProfessionalsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [search, setSearch] = useState("")
  const [filterActive, setFilterActive] = useState<string>("all")
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null)
  const [viewingProfessional, setViewingProfessional] = useState<Professional | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  const isAdmin = session?.user?.role === "ADMIN"

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfessionalFormData>({
    resolver: zodResolver(professionalSchema),
    defaultValues: {
      appointmentDuration: 50,
    },
  })

  const fetchProfessionals = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (filterActive !== "all") params.set("isActive", filterActive)

      const response = await fetch(`/api/professionals?${params.toString()}`)
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/")
          return
        }
        throw new Error("Failed to fetch professionals")
      }
      const data = await response.json()
      setProfessionals(data.professionals)
    } catch {
      toast.error("Erro ao carregar profissionais")
    } finally {
      setIsLoading(false)
    }
  }, [search, filterActive, router])

  const fetchProfessionalDetails = useCallback(async (professionalId: string) => {
    setIsLoadingDetails(true)
    try {
      const response = await fetch(`/api/professionals/${professionalId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch professional details")
      }
      const data = await response.json()
      setViewingProfessional(data.professional)
    } catch {
      toast.error("Erro ao carregar detalhes do profissional")
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
      // Only ADMIN can access
      if (session?.user?.role !== "ADMIN") {
        toast.error("Acesso restrito a administradores")
        router.push("/")
        return
      }
      fetchProfessionals()
    }
  }, [status, session, router, fetchProfessionals])

  function openCreateSheet() {
    setEditingProfessional(null)
    setViewingProfessional(null)
    reset({
      name: "",
      email: "",
      password: "",
      specialty: "",
      registrationNumber: "",
      appointmentDuration: 50,
    })
    setIsSheetOpen(true)
  }

  function openEditSheet(professional: Professional) {
    setEditingProfessional(professional)
    setViewingProfessional(null)
    reset({
      name: professional.name,
      email: professional.email,
      password: "",
      specialty: professional.professionalProfile?.specialty ?? "",
      registrationNumber: professional.professionalProfile?.registrationNumber ?? "",
      appointmentDuration: professional.professionalProfile?.appointmentDuration ?? 50,
    })
    setIsSheetOpen(true)
  }

  function openViewSheet(professional: Professional) {
    setEditingProfessional(null)
    fetchProfessionalDetails(professional.id)
    setIsSheetOpen(true)
  }

  function closeSheet() {
    setIsSheetOpen(false)
    setEditingProfessional(null)
    setViewingProfessional(null)
  }

  async function onSubmit(data: ProfessionalFormData) {
    setIsSaving(true)
    try {
      const url = editingProfessional
        ? `/api/professionals/${editingProfessional.id}`
        : "/api/professionals"
      const method = editingProfessional ? "PATCH" : "POST"

      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        specialty: data.specialty || null,
        registrationNumber: data.registrationNumber || null,
        appointmentDuration: data.appointmentDuration,
      }

      // Only include password if creating or if password was provided
      if (!editingProfessional || (data.password && data.password.length > 0)) {
        payload.password = data.password
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save professional")
      }

      toast.success(
        editingProfessional
          ? "Profissional atualizado com sucesso"
          : "Profissional criado com sucesso"
      )
      closeSheet()
      fetchProfessionals()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar profissional")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeactivate(professional: Professional) {
    if (!confirm(`Deseja realmente desativar ${professional.name}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/professionals/${professional.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to deactivate professional")
      }

      toast.success("Profissional desativado com sucesso")
      fetchProfessionals()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao desativar profissional")
    }
  }

  async function handleReactivate(professional: Professional) {
    try {
      const response = await fetch(`/api/professionals/${professional.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to reactivate professional")
      }

      toast.success("Profissional reativado com sucesso")
      fetchProfessionals()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao reativar profissional")
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <SkeletonPage />
        </div>
        <BottomNavigation />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background pb-20">
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
          <h1 className="text-2xl font-semibold text-foreground">Profissionais</h1>
          {isAdmin && (
            <button
              onClick={openCreateSheet}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity"
            >
              + Novo Profissional
            </button>
          )}
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por nome, email ou especialidade..."
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

        {/* Professionals List */}
        <div className="space-y-4">
          {professionals.length === 0 ? (
            <EmptyState
              title={search || filterActive !== "all" ? "Nenhum profissional encontrado" : "Nenhum profissional cadastrado"}
              message={search || filterActive !== "all" ? "Tente ajustar os filtros de busca" : "Adicione seu primeiro profissional para começar"}
              action={isAdmin && !search && filterActive === "all" ? { label: "Adicionar profissional", onClick: openCreateSheet } : undefined}
              icon={
                <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
            />
          ) : (
            professionals.map((professional) => (
              <div
                key={professional.id}
                className={`bg-card border border-border rounded-lg p-4 sm:p-6 ${
                  !professional.isActive ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => openViewSheet(professional)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground truncate">
                        {professional.name}
                      </h3>
                      {!professional.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          Inativo
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {professional.email}
                    </p>
                    {professional.professionalProfile?.specialty && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {professional.professionalProfile.specialty}
                        {professional.professionalProfile.registrationNumber && (
                          <span className="ml-2">
                            ({professional.professionalProfile.registrationNumber})
                          </span>
                        )}
                      </p>
                    )}
                    {professional.professionalProfile && (
                      <div className="flex gap-3 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                          {professional.professionalProfile.appointmentDuration} min
                        </span>
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditSheet(professional)}
                        className="h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                      >
                        Editar
                      </button>
                      {professional.isActive ? (
                        <button
                          onClick={() => handleDeactivate(professional)}
                          className="h-9 px-3 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(professional)}
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
              {viewingProfessional && !editingProfessional && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-foreground">
                      {viewingProfessional.name}
                    </h2>
                    {isAdmin && (
                      <button
                        onClick={() => openEditSheet(viewingProfessional)}
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
                          <label className="text-sm text-muted-foreground">Email</label>
                          <p className="text-foreground">{viewingProfessional.email}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Status</label>
                          <p className="text-foreground">
                            {viewingProfessional.isActive ? (
                              <span className="text-green-600">Ativo</span>
                            ) : (
                              <span className="text-red-600">Inativo</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Professional Info */}
                      {viewingProfessional.professionalProfile && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm text-muted-foreground">Especialidade</label>
                              <p className="text-foreground">
                                {viewingProfessional.professionalProfile.specialty || "-"}
                              </p>
                            </div>
                            <div>
                              <label className="text-sm text-muted-foreground">Registro Profissional</label>
                              <p className="text-foreground">
                                {viewingProfessional.professionalProfile.registrationNumber || "-"}
                              </p>
                            </div>
                          </div>

                          {viewingProfessional.professionalProfile.bio && (
                            <div>
                              <label className="text-sm text-muted-foreground">Bio</label>
                              <p className="text-foreground whitespace-pre-wrap">
                                {viewingProfessional.professionalProfile.bio}
                              </p>
                            </div>
                          )}

                          {/* Settings */}
                          <div>
                            <label className="text-sm text-muted-foreground mb-2 block">Configurações de Agenda</label>
                            <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-4">
                              <div>
                                <p className="text-xs text-muted-foreground">Duração da sessão</p>
                                <p className="text-sm font-medium">{viewingProfessional.professionalProfile.appointmentDuration} min</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Intervalo entre sessões</p>
                                <p className="text-sm font-medium">{viewingProfessional.professionalProfile.bufferBetweenSlots} min</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Agendamento online</p>
                                <p className="text-sm font-medium">
                                  {viewingProfessional.professionalProfile.allowOnlineBooking ? "Habilitado" : "Desabilitado"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Agendamento antecipado</p>
                                <p className="text-sm font-medium">{viewingProfessional.professionalProfile.maxAdvanceBookingDays} dias</p>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

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
              {(editingProfessional || (!viewingProfessional && !isLoadingDetails)) && isAdmin && (
                <>
                  <h2 className="text-xl font-semibold text-foreground mb-6">
                    {editingProfessional ? "Editar Profissional" : "Novo Profissional"}
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
                      <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                        Email *
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
                      <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                        Senha {editingProfessional ? "(deixe vazio para manter)" : "*"}
                      </label>
                      <input
                        id="password"
                        type="password"
                        {...register("password")}
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                      {errors.password && (
                        <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="specialty" className="block text-sm font-medium text-foreground mb-2">
                        Especialidade
                      </label>
                      <input
                        id="specialty"
                        type="text"
                        {...register("specialty")}
                        placeholder="Ex: Psicologia Clínica"
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                      {errors.specialty && (
                        <p className="text-sm text-destructive mt-1">{errors.specialty.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="registrationNumber" className="block text-sm font-medium text-foreground mb-2">
                        Registro Profissional
                      </label>
                      <input
                        id="registrationNumber"
                        type="text"
                        {...register("registrationNumber")}
                        placeholder="Ex: CRP 06/123456"
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                      {errors.registrationNumber && (
                        <p className="text-sm text-destructive mt-1">{errors.registrationNumber.message}</p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="appointmentDuration"
                        className="block text-sm font-medium text-foreground mb-2"
                      >
                        Duração padrão da sessão (minutos)
                      </label>
                      <input
                        id="appointmentDuration"
                        type="number"
                        min={15}
                        max={180}
                        {...register("appointmentDuration", { valueAsNumber: true })}
                        className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                      {errors.appointmentDuration && (
                        <p className="text-sm text-destructive mt-1">
                          {errors.appointmentDuration.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Tempo padrão para novos agendamentos (15-180 minutos)
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                      >
                        {isSaving
                          ? "Salvando..."
                          : editingProfessional
                          ? "Salvar alterações"
                          : "Criar profissional"}
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

      {/* FAB for adding professionals */}
      {isAdmin && (
        <FAB onClick={openCreateSheet} label="Novo profissional" />
      )}

      {/* Bottom Navigation */}
      <BottomNavigation />
    </main>
  )
}
