"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { PatientSearchFilters } from "@/shared/components/PatientSearchFilters"
import { SkeletonPage, ChevronLeftIcon, ChevronRightIcon } from "@/shared/components/ui"
import { getFeeLabelShort } from "@/lib/financeiro/billing-labels"

interface Professional {
  id: string
  name: string
  professionalProfile: { id: string } | null
}

interface Patient {
  id: string
  name: string
  sessionFee: number | string | null
  referenceProfessional: {
    id: string
    user: { name: string }
  } | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const ITEMS_PER_PAGE = 50

export default function PrecosPage() {
  const router = useRouter()
  const { status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [patients, setPatients] = useState<Patient[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: ITEMS_PER_PAGE,
    total: 0,
    totalPages: 0,
  })
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [filterActive, setFilterActive] = useState<string>("true")
  const [filterProfessional, setFilterProfessional] = useState<string>("")
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [dirtyRows, setDirtyRows] = useState<Map<string, number | null>>(new Map())
  const [isSaving, setIsSaving] = useState(false)
  const [billingMode, setBillingMode] = useState<string>("PER_SESSION")

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search)
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

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

  const fetchProfessionals = useCallback(async () => {
    try {
      const response = await fetch("/api/professionals")
      if (!response.ok) throw new Error("Failed to fetch professionals")
      const data = await response.json()
      setProfessionals(data.professionals || [])
    } catch {
      toast.error("Erro ao carregar profissionais")
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

  function handlePriceChange(patientId: string, value: string) {
    const patient = patients.find((p) => p.id === patientId)
    if (!patient) return

    const newMap = new Map(dirtyRows)

    if (value === "") {
      // User cleared the field
      const originalFee = patient.sessionFee
      if (originalFee === null || originalFee === "" || originalFee === undefined) {
        // Was already null, no change
        newMap.delete(patientId)
      } else {
        newMap.set(patientId, null)
      }
    } else {
      const numValue = parseFloat(value)
      if (isNaN(numValue)) return

      const originalFee = patient.sessionFee
      const originalNum = originalFee !== null && originalFee !== "" && originalFee !== undefined
        ? (typeof originalFee === "string" ? parseFloat(originalFee) : originalFee)
        : null

      if (originalNum === numValue) {
        newMap.delete(patientId)
      } else {
        newMap.set(patientId, numValue)
      }
    }

    setDirtyRows(newMap)
  }

  function getDisplayValue(patient: Patient): string {
    if (dirtyRows.has(patient.id)) {
      const val = dirtyRows.get(patient.id)
      return val !== null && val !== undefined ? String(val) : ""
    }
    if (patient.sessionFee === null || patient.sessionFee === "" || patient.sessionFee === undefined) return ""
    return typeof patient.sessionFee === "string" ? patient.sessionFee : String(patient.sessionFee)
  }

  async function handleSave() {
    if (dirtyRows.size === 0) return
    setIsSaving(true)

    let successCount = 0
    let errorCount = 0

    const entries = Array.from(dirtyRows.entries())

    await Promise.all(
      entries.map(async ([patientId, newFee]) => {
        try {
          const response = await fetch(`/api/patients/${patientId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionFee: newFee }),
          })
          if (!response.ok) throw new Error()
          successCount++
        } catch {
          errorCount++
        }
      })
    )

    if (successCount > 0) {
      toast.success(`${successCount} preço${successCount > 1 ? "s" : ""} atualizado${successCount > 1 ? "s" : ""} com sucesso`)
    }
    if (errorCount > 0) {
      toast.error(`Erro ao atualizar ${errorCount} paciente${errorCount > 1 ? "s" : ""}`)
    }

    setDirtyRows(new Map())
    fetchPatients()
    setIsSaving(false)
  }

  function goToPage(page: number) {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page }))
    }
  }

  if (status === "loading" || isLoading) {
    return <SkeletonPage />
  }

  return (
    <div>
      <PatientSearchFilters
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

      {patients.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {search || filterActive !== "all" || filterProfessional
            ? "Nenhum paciente encontrado"
            : "Nenhum paciente cadastrado"}
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3">Nome</th>
                  <th className="text-left text-sm font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Profissional Referência</th>
                  <th className="text-right text-sm font-medium text-muted-foreground px-4 py-3 w-48">{getFeeLabelShort(billingMode)}</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => {
                  const isDirty = dirtyRows.has(patient.id)
                  return (
                    <tr
                      key={patient.id}
                      className={`border-b border-border last:border-b-0 ${
                        isDirty ? "bg-yellow-50 dark:bg-yellow-900/20" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{patient.name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                        {patient.referenceProfessional?.user.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={getDisplayValue(patient)}
                          onChange={(e) => handlePriceChange(patient.id, e.target.value)}
                          placeholder="—"
                          className="w-32 h-9 px-3 text-right rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors text-sm"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-2">
              <p className="text-sm text-muted-foreground">
                Mostrando {(pagination.page - 1) * pagination.limit + 1} a{" "}
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

      {/* Sticky bottom save bar */}
      {dirtyRows.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 shadow-lg z-30">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {dirtyRows.size} alteração{dirtyRows.size > 1 ? "ões" : ""} pendente{dirtyRows.size > 1 ? "s" : ""}
            </p>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="h-10 px-6 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Salvando..." : `Salvar ${dirtyRows.size} alteração${dirtyRows.size > 1 ? "ões" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
