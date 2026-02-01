"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

const professionalSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").optional().or(z.literal("")),
  specialty: z.string().max(100).optional().nullable(),
  registrationNumber: z.string().max(50).optional().nullable(),
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
    appointmentDuration: number
  } | null
}

export default function AdminProfessionalsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [search, setSearch] = useState("")
  const [filterActive, setFilterActive] = useState<string>("all")
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null)
  const [isSaving, setIsSaving] = useState(false)

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

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated") {
      // Check if user is ADMIN
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

  function closeSheet() {
    setIsSheetOpen(false)
    setEditingProfessional(null)
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
          <h1 className="text-2xl font-semibold text-foreground">Profissionais</h1>
          <button
            onClick={openCreateSheet}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity"
          >
            + Novo Profissional
          </button>
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
            <div className="text-center py-12 text-muted-foreground">
              {search || filterActive !== "all"
                ? "Nenhum profissional encontrado"
                : "Nenhum profissional cadastrado"}
            </div>
          ) : (
            professionals.map((professional) => (
              <div
                key={professional.id}
                className={`bg-card border border-border rounded-lg p-4 sm:p-6 ${
                  !professional.isActive ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
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
                  </div>
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
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bottom Sheet */}
      {isSheetOpen && isMounted && createPortal(
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
            </div>
          </div>
        </>,
        document.body
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
