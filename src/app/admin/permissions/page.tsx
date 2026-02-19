"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { usePermission } from "@/shared/hooks/usePermission"
import { SearchIcon } from "@/shared/components/ui/icons"

// Types matching the API response
interface PermissionUser {
  id: string
  name: string
  email: string
  role: "ADMIN" | "PROFESSIONAL"
  isActive: boolean
  resolvedPermissions: Record<string, string>
  overrides: Record<string, string>
}

interface PermissionsData {
  users: PermissionUser[]
  features: string[]
  featureLabels: Record<string, string>
  roleDefaults: Record<string, Record<string, string>>
}

const ACCESS_LABELS: Record<string, string> = {
  NONE: "Nenhum",
  READ: "Leitura",
  WRITE: "Escrita",
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  PROFESSIONAL: "Profissional",
}

export default function AdminPermissionsPage() {
  const router = useRouter()
  const { status } = useSession()
  const { canWrite } = usePermission("users")

  const [data, setData] = useState<PermissionsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set())

  // Access gate: redirect if user doesn't have users:WRITE
  useEffect(() => {
    if (status === "authenticated" && !canWrite) {
      toast.error("Sem permissao para acessar esta pagina")
      router.push("/")
    }
  }, [canWrite, status, router])

  // Redirect unauthenticated users
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  const fetchPermissions = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/permissions")
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/")
          return
        }
        throw new Error("Failed to fetch permissions")
      }
      const json = await response.json()
      setData(json)
    } catch {
      toast.error("Erro ao carregar permissoes")
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (status === "authenticated" && canWrite) {
      fetchPermissions()
    }
  }, [status, canWrite, fetchPermissions])

  // Filter users by search term
  const filteredUsers = useMemo(() => {
    if (!data) return []
    if (!search.trim()) return data.users
    const term = search.toLowerCase()
    return data.users.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term)
    )
  }, [data, search])

  // Handle permission change
  async function handlePermissionChange(
    userId: string,
    feature: string,
    selectedAccess: string
  ) {
    if (!data) return

    const user = data.users.find((u) => u.id === userId)
    if (!user) return

    const roleDefault = data.roleDefaults[user.role]?.[feature]
    // If selected value matches role default, send null to remove override
    const access = selectedAccess === roleDefault ? null : selectedAccess

    const cellKey = `${userId}:${feature}`
    setSavingCells((prev) => new Set(prev).add(cellKey))

    try {
      const response = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, feature, access }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error || "Erro ao salvar permissao")
      }

      const result = await response.json()

      // Update local state optimistically
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  resolvedPermissions: result.resolvedPermissions,
                  overrides: result.overrides,
                }
              : u
          ),
        }
      })

      toast.success("Permissao atualizada")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao salvar permissao"
      )
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev)
        next.delete(cellKey)
        return next
      })
    }
  }

  // Check if a cell has an override (differs from role default)
  function isOverride(user: PermissionUser, feature: string): boolean {
    return feature in user.overrides
  }

  // Get the role default for a user's feature
  function getRoleDefault(user: PermissionUser, feature: string): string {
    return data?.roleDefaults[user.role]?.[feature] ?? "NONE"
  }

  // Loading state
  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-12 w-64 bg-muted rounded" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 bg-muted rounded" />
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (!data) return null

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Back link */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Inicio
          </button>
        </div>

        {/* Page title */}
        <h1 className="text-2xl font-semibold text-foreground mb-6">
          Permissoes
        </h1>

        {/* Search filter */}
        <div className="mb-6 max-w-sm">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors text-sm"
            />
          </div>
        </div>

        {/* Permissions table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground sticky left-0 bg-muted/50 z-10 min-w-[200px]">
                    Usuario
                  </th>
                  {data.features.map((feature) => (
                    <th
                      key={feature}
                      className="px-2 py-3 text-center text-xs font-medium text-foreground min-w-[120px]"
                    >
                      <span className="whitespace-nowrap">
                        {data.featureLabels[feature] || feature}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={data.features.length + 1}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Nenhum usuario encontrado
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`hover:bg-muted/30 transition-colors ${
                        !user.isActive ? "opacity-50" : ""
                      }`}
                    >
                      {/* User name + role badge */}
                      <td className="px-4 py-3 sticky left-0 bg-card z-10">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-sm font-medium text-foreground">
                              {user.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                              user.role === "ADMIN"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            }`}
                          >
                            {ROLE_LABELS[user.role]}
                          </span>
                        </div>
                      </td>

                      {/* Permission cells */}
                      {data.features.map((feature) => {
                        const cellKey = `${user.id}:${feature}`
                        const isSaving = savingCells.has(cellKey)
                        const hasOverride = isOverride(user, feature)
                        const roleDefault = getRoleDefault(user, feature)
                        const currentValue =
                          user.resolvedPermissions[feature] ?? "NONE"

                        return (
                          <td key={feature} className="px-2 py-2 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <select
                                value={currentValue}
                                onChange={(e) =>
                                  handlePermissionChange(
                                    user.id,
                                    feature,
                                    e.target.value
                                  )
                                }
                                disabled={isSaving || !user.isActive}
                                className={`w-full max-w-[110px] h-8 px-2 text-xs rounded-md border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                  hasOverride
                                    ? "border-primary ring-1 ring-primary/30 bg-primary/5"
                                    : "border-input"
                                }`}
                              >
                                <option value="NONE">
                                  {ACCESS_LABELS.NONE}
                                </option>
                                <option value="READ">
                                  {ACCESS_LABELS.READ}
                                </option>
                                <option value="WRITE">
                                  {ACCESS_LABELS.WRITE}
                                </option>
                              </select>
                              <span
                                className="text-[10px] text-muted-foreground leading-tight"
                                title={`Padrao da role: ${ACCESS_LABELS[roleDefault] || roleDefault}`}
                              >
                                Padrao: {ACCESS_LABELS[roleDefault] || roleDefault}
                              </span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded border border-primary ring-1 ring-primary/30 bg-primary/5" />
            <span>Permissao personalizada (diferente do padrao)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded border border-input bg-background" />
            <span>Padrao da role</span>
          </div>
        </div>
      </div>
    </main>
  )
}
