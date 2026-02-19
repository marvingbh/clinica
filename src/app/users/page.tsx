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
import { UserCard, UserGridSkeleton } from "./components"
import { usePermission } from "@/shared/hooks/usePermission"

const userSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(100),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").optional().or(z.literal("")),
  role: z.enum(["ADMIN", "PROFESSIONAL"]),
})

type UserFormData = z.infer<typeof userSchema>

interface UserData {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  professionalProfile: { id: string } | null
}

export default function UsersPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [users, setUsers] = useState<UserData[]>([])
  const [search, setSearch] = useState("")
  const [filterRole, setFilterRole] = useState<string>("all")
  const [filterActive, setFilterActive] = useState<string>("all")
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserData | null>(null)
  const [viewingUser, setViewingUser] = useState<UserData | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const { canRead, canWrite } = usePermission("users")

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      role: "PROFESSIONAL",
    },
  })

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set("search", search)
      if (filterRole !== "all") params.set("role", filterRole)
      if (filterActive !== "all") params.set("isActive", filterActive)

      const response = await fetch(`/api/users?${params.toString()}`)
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/")
          return
        }
        throw new Error("Failed to fetch users")
      }
      const data = await response.json()
      setUsers(data.users)
    } catch {
      toast.error("Erro ao carregar usuários")
    } finally {
      setIsLoading(false)
    }
  }, [search, filterRole, filterActive, router])

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
      fetchUsers()
    }
  }, [status, canRead, router, fetchUsers])

  function openCreateSheet() {
    setEditingUser(null)
    setViewingUser(null)
    reset({
      name: "",
      email: "",
      password: "",
      role: "PROFESSIONAL",
    })
    setIsSheetOpen(true)
  }

  function openEditSheet(user: UserData) {
    setEditingUser(user)
    setViewingUser(null)
    reset({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role as "ADMIN" | "PROFESSIONAL",
    })
    setIsSheetOpen(true)
  }

  function openViewSheet(user: UserData) {
    setEditingUser(null)
    setViewingUser(user)
    setIsSheetOpen(true)
  }

  function closeSheet() {
    setIsSheetOpen(false)
    setEditingUser(null)
    setViewingUser(null)
  }

  async function onSubmit(data: UserFormData) {
    setIsSaving(true)
    try {
      const url = editingUser
        ? `/api/users/${editingUser.id}`
        : "/api/users"
      const method = editingUser ? "PATCH" : "POST"

      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        role: data.role,
      }

      // Only include password if creating or if password was provided
      if (!editingUser || (data.password && data.password.length > 0)) {
        payload.password = data.password
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erro ao salvar usuário")
      }

      toast.success(
        editingUser
          ? "Usuário atualizado com sucesso"
          : "Usuário criado com sucesso"
      )
      closeSheet()
      fetchUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar usuário")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeactivate(user: UserData) {
    if (!confirm(`Deseja realmente desativar ${user.name}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erro ao desativar usuário")
      }

      toast.success("Usuário desativado com sucesso")
      fetchUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao desativar usuário")
    }
  }

  async function handleReactivate(user: UserData) {
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Erro ao reativar usuário")
      }

      toast.success("Usuário reativado com sucesso")
      fetchUsers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao reativar usuário")
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
            <div className="w-full sm:w-40 h-12 bg-muted rounded-lg animate-pulse" />
          </div>

          {/* Grid Skeleton */}
          <UserGridSkeleton count={6} />
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
            Usuários
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerenciar contas de acesso ao sistema
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              label="Buscar"
              placeholder="Nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<SearchIcon className="w-5 h-5" />}
              inputSize="md"
            />
          </div>
          <div className="w-full sm:w-40">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full h-12 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-normal"
            >
              <option value="all">Todos perfis</option>
              <option value="ADMIN">Administrador</option>
              <option value="PROFESSIONAL">Profissional</option>
            </select>
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

        {/* Users Grid */}
        {users.length === 0 ? (
          <EmptyState
            title={search || filterRole !== "all" || filterActive !== "all" ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
            message={search || filterRole !== "all" || filterActive !== "all" ? "Tente ajustar os filtros de busca" : "Adicione seu primeiro usuário para começar"}
            action={canWrite && !search && filterRole === "all" && filterActive === "all" ? { label: "Adicionar usuário", onClick: openCreateSheet } : undefined}
            icon={<UsersIcon className="w-8 h-8 text-muted-foreground" />}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                onClick={() => openViewSheet(u)}
                onEdit={() => openEditSheet(u)}
                onDeactivate={() => handleDeactivate(u)}
                onReactivate={() => handleReactivate(u)}
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
          {/* Sheet Container */}
          <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center">
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
                {viewingUser && !editingUser && (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-semibold text-foreground">
                        {viewingUser.name}
                      </h2>
                      {canWrite && (
                        <button
                          onClick={() => openEditSheet(viewingUser)}
                          className="h-9 px-3 rounded-lg border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                        >
                          Editar
                        </button>
                      )}
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-muted-foreground">Email</label>
                          <p className="text-foreground">{viewingUser.email}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Status</label>
                          <p className="text-foreground">
                            {viewingUser.isActive ? (
                              <span className="text-green-600">Ativo</span>
                            ) : (
                              <span className="text-red-600">Inativo</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Perfil</label>
                          <p className="text-foreground">
                            {viewingUser.role === "ADMIN" ? (
                              <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                Administrador
                              </span>
                            ) : (
                              "Profissional"
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Perfil profissional</label>
                          <p className="text-foreground">
                            {viewingUser.professionalProfile ? (
                              <span className="text-green-600">Vinculado</span>
                            ) : (
                              <span className="text-muted-foreground">Não vinculado</span>
                            )}
                          </p>
                        </div>
                      </div>

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
                  </>
                )}

                {/* Create/Edit Mode */}
                {(editingUser || !viewingUser) && canWrite && (
                  <>
                    <h2 className="text-xl font-semibold text-foreground mb-6">
                      {editingUser ? "Editar Usuário" : "Novo Usuário"}
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
                        label={editingUser ? "Senha (deixe vazio para manter)" : "Senha"}
                        type="password"
                        required={!editingUser}
                        {...register("password")}
                        error={errors.password?.message}
                      />

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          Perfil <span className="text-destructive">*</span>
                        </label>
                        <select
                          {...register("role")}
                          className="w-full h-12 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-normal"
                        >
                          <option value="PROFESSIONAL">Profissional</option>
                          <option value="ADMIN">Administrador</option>
                        </select>
                        {errors.role?.message && (
                          <p className="text-sm text-destructive mt-1">{errors.role.message}</p>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <button
                          type="submit"
                          disabled={isSaving}
                          className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-normal active:scale-[0.98] shadow-md hover:shadow-lg"
                        >
                          {isSaving
                            ? "Salvando..."
                            : editingUser
                            ? "Salvar alterações"
                            : "Criar usuário"}
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

      {/* FAB for adding users */}
      {canWrite && (
        <FAB onClick={openCreateSheet} label="Novo usuário" />
      )}
    </main>
  )
}
