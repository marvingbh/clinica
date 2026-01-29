"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

const profileSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  specialty: z.string().max(100).optional().nullable(),
  appointmentDuration: z
    .number()
    .int()
    .min(15, "Duração mínima é 15 minutos")
    .max(180, "Duração máxima é 180 minutos")
    .optional(),
})

type ProfileFormData = z.infer<typeof profileSchema>

interface UserProfile {
  id: string
  email: string
  name: string
  role: string
  createdAt: string
  clinic: {
    id: string
    name: string
    phone: string | null
  }
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

export default function ProfilePage() {
  const router = useRouter()
  const { status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [user, setUser] = useState<UserProfile | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  const fetchProfile = useCallback(async () => {
    try {
      const response = await fetch("/api/me")
      if (!response.ok) {
        throw new Error("Failed to fetch profile")
      }
      const data = await response.json()
      setUser(data.user)
      reset({
        name: data.user.name,
        specialty: data.user.professionalProfile?.specialty ?? "",
        appointmentDuration: data.user.professionalProfile?.appointmentDuration ?? 50,
      })
    } catch {
      toast.error("Erro ao carregar perfil")
    } finally {
      setIsLoading(false)
    }
  }, [reset])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated") {
      fetchProfile()
    }
  }, [status, router, fetchProfile])

  async function onSubmit(data: ProfileFormData) {
    setIsSaving(true)
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          specialty: data.specialty || null,
          appointmentDuration: data.appointmentDuration,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to update profile")
      }

      const result = await response.json()
      setUser(result.user)
      reset({
        name: result.user.name,
        specialty: result.user.professionalProfile?.specialty ?? "",
        appointmentDuration: result.user.professionalProfile?.appointmentDuration ?? 50,
      })
      toast.success("Perfil atualizado com sucesso")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar perfil")
    } finally {
      setIsSaving(false)
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 bg-muted rounded" />
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-12 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-12 bg-muted rounded" />
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (!user) {
    return null
  }

  const isProfessional = user.role === "PROFESSIONAL" && user.professionalProfile

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Voltar
          </button>
        </div>

        <h1 className="text-2xl font-semibold text-foreground mb-6">Meu Perfil</h1>

        <div className="bg-card border border-border rounded-lg p-6 sm:p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="w-full h-12 px-4 rounded-md border border-input bg-muted text-muted-foreground cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">O email não pode ser alterado</p>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                Nome
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
              <label htmlFor="clinic" className="block text-sm font-medium text-foreground mb-2">
                Clínica
              </label>
              <input
                id="clinic"
                type="text"
                value={user.clinic.name}
                disabled
                className="w-full h-12 px-4 rounded-md border border-input bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>

            {isProfessional && (
              <>
                <hr className="border-border" />

                <h2 className="text-lg font-medium text-foreground">Perfil Profissional</h2>

                <div>
                  <label
                    htmlFor="specialty"
                    className="block text-sm font-medium text-foreground mb-2"
                  >
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
                    {...register("appointmentDuration")}
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

                {user.professionalProfile?.registrationNumber && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Registro Profissional
                    </label>
                    <input
                      type="text"
                      value={user.professionalProfile.registrationNumber}
                      disabled
                      className="w-full h-12 px-4 rounded-md border border-input bg-muted text-muted-foreground cursor-not-allowed"
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                type="submit"
                disabled={isSaving || !isDirty}
                className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isSaving ? "Salvando..." : "Salvar alterações"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>
            Membro desde{" "}
            {new Date(user.createdAt).toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
    </main>
  )
}
