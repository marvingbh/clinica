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
  EmptyState,
  UsersIcon,
  Input,
  SearchIcon,
} from "@/shared/components/ui"
import { ProfessionalCard, ProfessionalGridSkeleton } from "./components"
import { usePermission } from "@/shared/hooks/usePermission"

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
  bufferBetweenSlots: z
    .number()
    .int()
    .min(0, "Intervalo não pode ser negativo")
    .max(60, "Intervalo máximo é 60 minutos")
    .optional(),
  repassePercentage: z
    .number()
    .min(0, "Percentual não pode ser negativo")
    .max(100, "Percentual máximo é 100%")
    .optional(),
  isAdminRole: z.boolean().optional(),
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
    repassePercentage: number | string
  } | null
}

export default function ProfessionalsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [search, setSearch] = useState("")
  const [filterActive, setFilterActive] = useState<string>("all")
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null)
  const [viewingProfessional, setViewingProfessional] = useState<Professional | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  const { canRead, canWrite } = usePermission("professionals")

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfessionalFormData>({
    resolver: zodResolver(professionalSchema),
    defaultValues: {
      appointmentDuration: 50,
      bufferBetweenSlots: 0,
      repassePercentage: 0,
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
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated") {
      if (!canRead) {
        toast.error("Sem permissao para acessar esta pagina")
        router.push("/")
        return
      }
      fetchProfessionals()
    }
  }, [status, canRead, router, fetchProfessionals])

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
      bufferBetweenSlots: 0,
      repassePercentage: 0,
      isAdminRole: false,
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
      bufferBetweenSlots: professional.professionalProfile?.bufferBetweenSlots ?? 0,
      repassePercentage: Number(professional.professionalProfile?.repassePercentage ?? 0),
      isAdminRole: professional.role === "ADMIN",
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
        bufferBetweenSlots: data.bufferBetweenSlots,
        repassePercentage: data.repassePercentage,
      }

      // Only include password if creating or if password was provided
      if (!editingProfessional || (data.password && data.password.length > 0)) {
        payload.password = data.password
      }

      // Send role when editing
      if (editingProfessional) {
        payload.role = data.isAdminRole ? "ADMIN" : "PROFESSIONAL"
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
        {/* Header Skeleton */}
        <div className="bg-gradient-to-br from-primary/5 via-background to-background px-4 pt-12 pb-6">
          <div className="max-w-4xl mx-auto">
            <div className="h-4 w-16 bg-muted rounded animate-pulse mb-2" />
            <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4">
          {/* Search/Filter Skeleton */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 h-12 bg-muted rounded-lg animate-pulse" />
            <div className="w-full sm:w-40 h-12 bg-muted rounded-lg animate-pulse" />
          </div>

          {/* Grid Skeleton */}
          <ProfessionalGridSkeleton count={6} />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-primary/5 via-background to-background px-4 pt-12 pb-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            &larr; Voltar
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
            Profissionais
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie a equipe de profissionais da clínica
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4">
        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              label="Buscar"
              placeholder="Nome, email ou especialidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<SearchIcon className="w-5 h-5" />}
              inputSize="md"
            />
          </div>
          <div className="w-full sm:w-40">
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              className="w-full h-12 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-normal"
            >
              <option value="all">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
          </div>
        </div>

        {/* Professionals Grid */}
        {professionals.length === 0 ? (
          <EmptyState
            title={search || filterActive !== "all" ? "Nenhum profissional encontrado" : "Nenhum profissional cadastrado"}
            message={search || filterActive !== "all" ? "Tente ajustar os filtros de busca" : "Adicione seu primeiro profissional para começar"}
            action={canWrite && !search && filterActive === "all" ? { label: "Adicionar profissional", onClick: openCreateSheet } : undefined}
            icon={<UsersIcon className="w-8 h-8 text-muted-foreground" />}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {professionals.map((professional) => (
              <ProfessionalCard
                key={professional.id}
                professional={professional}
                onClick={() => openViewSheet(professional)}
                onEdit={() => openEditSheet(professional)}
                onDeactivate={() => handleDeactivate(professional)}
                onReactivate={() => handleReactivate(professional)}
                isAdmin={canWrite}
              />
            ))}
          </div>
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
              {viewingProfessional && !editingProfessional && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-foreground">
                      {viewingProfessional.name}
                    </h2>
                    {canWrite && (
                      <button
                        onClick={() => openEditSheet(viewingProfessional)}
                        className="h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
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
                        <div>
                          <label className="text-sm text-muted-foreground">Perfil</label>
                          <p className="text-foreground">
                            {viewingProfessional.role === "ADMIN" ? (
                              <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                Administrador
                              </span>
                            ) : (
                              "Profissional"
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
                            <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-xl p-4">
                              <div>
                                <p className="text-xs text-muted-foreground">Duração da sessão</p>
                                <p className="text-sm font-medium">{viewingProfessional.professionalProfile.appointmentDuration} min</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Intervalo entre sessões</p>
                                <p className="text-sm font-medium">{viewingProfessional.professionalProfile.bufferBetweenSlots} min</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Repasse (%)</p>
                                <p className="text-sm font-medium">{Number(viewingProfessional.professionalProfile.repassePercentage)}%</p>
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
                          className="w-full h-12 rounded-xl border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Create/Edit Mode */}
              {(editingProfessional || (!viewingProfessional && !isLoadingDetails)) && canWrite && (
                <>
                  <h2 className="text-xl font-semibold text-foreground mb-6">
                    {editingProfessional ? "Editar Profissional" : "Novo Profissional"}
                  </h2>

                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <Input
                      label="Nome"
                      required
                      {...register("name")}
                      error={errors.name?.message}
                    />

                    <Input
                      label="Email"
                      type="email"
                      required
                      {...register("email")}
                      error={errors.email?.message}
                    />

                    <Input
                      label={editingProfessional ? "Senha (deixe vazio para manter)" : "Senha"}
                      type="password"
                      required={!editingProfessional}
                      {...register("password")}
                      error={errors.password?.message}
                    />

                    <Input
                      label="Especialidade"
                      placeholder="Ex: Psicologia Clínica"
                      {...register("specialty")}
                      error={errors.specialty?.message}
                    />

                    <Input
                      label="Registro Profissional"
                      placeholder="Ex: CRP 06/123456"
                      {...register("registrationNumber")}
                      error={errors.registrationNumber?.message}
                    />

                    <div>
                      <Input
                        label="Duração padrão da sessão (minutos)"
                        type="number"
                        min={15}
                        max={180}
                        {...register("appointmentDuration", { valueAsNumber: true })}
                        error={errors.appointmentDuration?.message}
                        helperText="Tempo padrão para novos agendamentos (15-180 minutos)"
                      />
                    </div>

                    <div>
                      <Input
                        label="Intervalo entre sessões (minutos)"
                        type="number"
                        min={0}
                        max={60}
                        {...register("bufferBetweenSlots", { valueAsNumber: true })}
                        error={errors.bufferBetweenSlots?.message}
                        helperText="Tempo de intervalo entre consultas (0-60 minutos). Use 0 para permitir consultas consecutivas."
                      />
                    </div>

                    <div>
                      <Input
                        label="Repasse (%)"
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        {...register("repassePercentage", { valueAsNumber: true })}
                        error={errors.repassePercentage?.message}
                        helperText="Percentual pago ao profissional após imposto (0-100%)"
                      />
                    </div>

                    {editingProfessional && (
                      <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                        <div>
                          <p className="text-sm font-medium text-foreground">Administrador</p>
                          <p className="text-xs text-muted-foreground">
                            Concede acesso administrativo completo
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            {...register("isAdminRole")}
                          />
                          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-primary" />
                        </label>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-normal active:scale-[0.98] shadow-md hover:shadow-lg"
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
                        className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-xl border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
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

      {/* FAB for adding professionals */}
      {canWrite && (
        <FAB onClick={openCreateSheet} label="Novo profissional" />
      )}
    </main>
  )
}
