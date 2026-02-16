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
  ClockIcon,
} from "@/shared/components/ui"
import { CalendarIcon } from "@/shared/components/ui/icons"

const DAY_OF_WEEK_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
]

const RECURRENCE_TYPE_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
}

// Date helper for native date picker default value
function getTodayISO(): string {
  return new Date().toISOString().split("T")[0]
}

const groupSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(200),
  professionalProfileId: z.string().min(1, "Selecione um profissional"),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Horário inválido"),
  duration: z.number().int().min(15).max(480),
  recurrenceType: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
})

type GroupFormData = z.infer<typeof groupSchema>

interface Professional {
  id: string
  name: string
  professionalProfile: {
    id: string
    specialty: string | null
  } | null
}

interface TherapyGroup {
  id: string
  name: string
  dayOfWeek: number
  startTime: string
  duration: number
  recurrenceType: string
  isActive: boolean
  createdAt: string
  activeMemberCount?: number
  professionalProfile: {
    id: string
    user: {
      name: string
    }
  }
}

interface GroupDetails extends TherapyGroup {
  memberships: Array<{
    id: string
    joinDate: string
    leaveDate: string | null
    patient: {
      id: string
      name: string
      phone: string
    }
  }>
}

interface GroupSessionItem {
  groupId: string
  groupName: string
  scheduledAt: string
  endAt: string
  professionalProfileId: string
  professionalName: string
  participants: Array<{
    appointmentId: string
    patientId: string
    patientName: string
    status: string
  }>
}

type ViewTab = "members" | "sessions"

export default function GroupsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [groups, setGroups] = useState<TherapyGroup[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<TherapyGroup | null>(null)
  const [viewingGroup, setViewingGroup] = useState<GroupDetails | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  // View tab state
  const [viewTab, setViewTab] = useState<ViewTab>("members")
  const [groupSessions, setGroupSessions] = useState<GroupSessionItem[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [sessionFilter, setSessionFilter] = useState<"upcoming" | "past">("upcoming")
  const [sessionPage, setSessionPage] = useState(1)
  const [sessionTotal, setSessionTotal] = useState(0)
  const SESSION_PAGE_SIZE = 10

  // Session generation state
  const [isGeneratingOpen, setIsGeneratingOpen] = useState(false)
  const [generateStartDate, setGenerateStartDate] = useState("")
  const [generateEndDate, setGenerateEndDate] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateMode, setGenerateMode] = useState<"generate" | "regenerate" | "reschedule">("generate")

  // Member management state
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [patientSearch, setPatientSearch] = useState("")
  const [patientSearchResults, setPatientSearchResults] = useState<Array<{ id: string; name: string; phone: string }>>([])
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; name: string } | null>(null)
  const [isSearchingPatients, setIsSearchingPatients] = useState(false)
  const [isSavingMember, setIsSavingMember] = useState(false)
  const [memberJoinDate, setMemberJoinDate] = useState("")

  const isAdmin = session?.user?.role === "ADMIN"

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<GroupFormData>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      dayOfWeek: 1, // Monday
      duration: 90,
      recurrenceType: "WEEKLY",
    },
  })

  const fetchGroups = useCallback(async () => {
    try {
      const response = await fetch("/api/groups")
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/")
          return
        }
        throw new Error("Failed to fetch groups")
      }
      const data = await response.json()
      setGroups(data.groups)
    } catch {
      toast.error("Erro ao carregar grupos")
    } finally {
      setIsLoading(false)
    }
  }, [router])

  const fetchProfessionals = useCallback(async () => {
    try {
      const response = await fetch("/api/professionals")
      if (!response.ok) return
      const data = await response.json()
      setProfessionals(data.professionals)
    } catch {
      // Silently fail
    }
  }, [])

  const fetchGroupDetails = useCallback(async (groupId: string) => {
    setIsLoadingDetails(true)
    try {
      const response = await fetch(`/api/groups/${groupId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch group details")
      }
      const data = await response.json()
      setViewingGroup(data.group)
    } catch {
      toast.error("Erro ao carregar detalhes do grupo")
    } finally {
      setIsLoadingDetails(false)
    }
  }, [])

  const fetchGroupSessions = useCallback(async (groupId: string, filter: string, page: number) => {
    setIsLoadingSessions(true)
    try {
      const response = await fetch(
        `/api/group-sessions?groupId=${groupId}&filter=${filter}&page=${page}&limit=${SESSION_PAGE_SIZE}`
      )
      if (!response.ok) {
        throw new Error("Failed to fetch sessions")
      }
      const data = await response.json()
      setGroupSessions(data.groupSessions)
      setSessionTotal(data.total ?? 0)
    } catch {
      toast.error("Erro ao carregar sessões")
    } finally {
      setIsLoadingSessions(false)
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
      fetchGroups()
      fetchProfessionals()
    }
  }, [status, router, fetchGroups, fetchProfessionals])

  function openCreateSheet() {
    setEditingGroup(null)
    setViewingGroup(null)
    reset({
      name: "",
      professionalProfileId: "",
      dayOfWeek: 1,
      startTime: "",
      duration: 90,
      recurrenceType: "WEEKLY",
    })
    setIsSheetOpen(true)
  }

  function openEditSheet(group: TherapyGroup) {
    setEditingGroup(group)
    // Also fetch group details to show members in edit mode
    fetchGroupDetails(group.id)
    reset({
      name: group.name,
      professionalProfileId: group.professionalProfile.id,
      dayOfWeek: group.dayOfWeek,
      startTime: group.startTime,
      duration: group.duration,
      recurrenceType: group.recurrenceType as "WEEKLY" | "BIWEEKLY" | "MONTHLY",
    })
    setIsSheetOpen(true)
  }

  function openViewSheet(group: TherapyGroup) {
    setEditingGroup(null)
    setViewTab("members")
    setGroupSessions([])
    fetchGroupDetails(group.id)
    setIsSheetOpen(true)
  }

  function closeSheet() {
    setIsSheetOpen(false)
    setEditingGroup(null)
    setViewingGroup(null)
    setIsGeneratingOpen(false)
    setViewTab("members")
    setGroupSessions([])
    setSessionFilter("upcoming")
    setSessionPage(1)
    setSessionTotal(0)
    resetAddMemberState()
  }

  async function onSubmit(data: GroupFormData) {
    setIsSaving(true)
    try {
      const url = editingGroup
        ? `/api/groups/${editingGroup.id}`
        : "/api/groups"
      const method = editingGroup ? "PATCH" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to save group")
      }

      toast.success(
        editingGroup
          ? "Grupo atualizado com sucesso"
          : "Grupo criado com sucesso"
      )
      closeSheet()
      fetchGroups()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar grupo")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeactivate(group: TherapyGroup) {
    if (!confirm(`Deseja realmente desativar o grupo "${group.name}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to deactivate group")
      }

      toast.success("Grupo desativado com sucesso")
      fetchGroups()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao desativar grupo")
    }
  }

  async function handleReactivate(group: TherapyGroup) {
    try {
      const response = await fetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to reactivate group")
      }

      toast.success("Grupo reativado com sucesso")
      fetchGroups()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao reativar grupo")
    }
  }

  async function handleGenerateSessions() {
    if (!viewingGroup) return

    let startDateISO: string
    let endDateISO: string

    if (generateMode === "regenerate") {
      // For regenerate mode, API will query actual date range from database
      // Just send a wide range - API will handle it efficiently
      startDateISO = getTodayISO()
      const farFuture = new Date()
      farFuture.setFullYear(farFuture.getFullYear() + 5)
      endDateISO = farFuture.toISOString().split("T")[0]
    } else {
      // For generate and reschedule modes, require date inputs
      if (!generateStartDate || !generateEndDate) {
        toast.error("Selecione as datas de início e fim")
        return
      }
      startDateISO = generateStartDate
      endDateISO = generateEndDate
    }

    setIsGenerating(true)
    try {
      const response = await fetch(`/api/groups/${viewingGroup.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: startDateISO,
          endDate: endDateISO,
          mode: generateMode,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to generate sessions")
      }

      if (generateMode === "regenerate") {
        const added = result.regeneratedCount || 0
        const cancelled = result.cancelledCount || 0
        if (added > 0 || cancelled > 0) {
          toast.success(result.message)
        } else {
          toast.info("Todas as sessões já estão atualizadas")
        }
      } else if (generateMode === "reschedule") {
        toast.success(result.message)
      } else {
        toast.success(`${result.sessionsCreated} sessões geradas com ${result.appointmentsCreated} agendamentos`)
      }
      setIsGeneratingOpen(false)
      setGenerateStartDate("")
      setGenerateEndDate("")
      setGenerateMode("generate")
      // Refresh sessions tab if it's active
      if (viewTab === "sessions") {
        setSessionPage(1)
        fetchGroupSessions(viewingGroup.id, sessionFilter, 1)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao gerar sessões")
    } finally {
      setIsGenerating(false)
    }
  }

  // Patient search for adding members
  useEffect(() => {
    if (!patientSearch || patientSearch.length < 2) {
      setPatientSearchResults([])
      return
    }

    const searchTimeout = setTimeout(async () => {
      setIsSearchingPatients(true)
      try {
        const response = await fetch(`/api/patients?search=${encodeURIComponent(patientSearch)}&limit=10`)
        if (response.ok) {
          const data = await response.json()
          // Filter out patients that are already members of this group
          const existingPatientIds = viewingGroup?.memberships
            .filter(m => !m.leaveDate)
            .map(m => m.patient.id) || []
          const filteredPatients = data.patients.filter(
            (p: { id: string }) => !existingPatientIds.includes(p.id)
          )
          setPatientSearchResults(filteredPatients)
        }
      } catch {
        // Silent fail
      } finally {
        setIsSearchingPatients(false)
      }
    }, 300)

    return () => clearTimeout(searchTimeout)
  }, [patientSearch, viewingGroup?.memberships])

  function handleSelectPatient(patient: { id: string; name: string }) {
    setSelectedPatient(patient)
    setPatientSearch(patient.name)
    setPatientSearchResults([])
  }

  function handleClearPatient() {
    setSelectedPatient(null)
    setPatientSearch("")
    setPatientSearchResults([])
  }

  function resetAddMemberState() {
    setIsAddingMember(false)
    setPatientSearch("")
    setPatientSearchResults([])
    setSelectedPatient(null)
    setMemberJoinDate("")
  }

  async function handleAddMember() {
    if (!viewingGroup || !selectedPatient) return
    if (!memberJoinDate) {
      toast.error("Selecione a data de entrada")
      return
    }

    // Native date input already returns ISO format (YYYY-MM-DD)
    setIsSavingMember(true)
    try {
      const response = await fetch(`/api/groups/${viewingGroup.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          joinDate: memberJoinDate,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to add member")
      }

      toast.success("Membro adicionado com sucesso")
      resetAddMemberState()
      // Refresh group details to show new member
      fetchGroupDetails(viewingGroup.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao adicionar membro")
    } finally {
      setIsSavingMember(false)
    }
  }

  async function handleRemoveMember(membershipId: string, patientName: string) {
    if (!viewingGroup) return
    if (!confirm(`Deseja remover ${patientName} do grupo? Todas as sessões futuras deste paciente serão canceladas.`)) return

    try {
      const response = await fetch(`/api/groups/${viewingGroup.id}/members/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveDate: new Date().toISOString().split("T")[0],
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to remove member")
      }

      if (result.cancelledAppointmentsCount > 0) {
        toast.success(`Membro removido. ${result.cancelledAppointmentsCount} sessão(ões) futura(s) cancelada(s).`)
      } else {
        toast.success("Membro removido com sucesso")
      }
      // Refresh group details
      fetchGroupDetails(viewingGroup.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao remover membro")
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <SkeletonPage />
        </div>
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
          <h1 className="text-2xl font-semibold text-foreground">Grupos de Terapia</h1>
          {isAdmin && (
            <button
              onClick={openCreateSheet}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-opacity"
            >
              + Novo Grupo
            </button>
          )}
        </div>

        {/* Groups List */}
        <div className="space-y-4">
          {groups.length === 0 ? (
            <EmptyState
              title="Nenhum grupo cadastrado"
              message="Crie seu primeiro grupo de terapia para começar"
              action={isAdmin ? { label: "Criar grupo", onClick: openCreateSheet } : undefined}
              icon={<UsersIcon className="w-8 h-8 text-muted-foreground" />}
            />
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                className={`bg-card border border-border rounded-lg p-4 sm:p-6 ${
                  !group.isActive ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => openViewSheet(group)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <UsersIcon className="w-5 h-5 text-purple-600" />
                      <h3 className="font-medium text-foreground truncate">
                        {group.name}
                      </h3>
                      {!group.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <ClockIcon className="w-4 h-4" />
                      <span>
                        {DAY_OF_WEEK_LABELS[group.dayOfWeek]} às {group.startTime}
                      </span>
                      <span className="text-muted-foreground/50">•</span>
                      <span>{RECURRENCE_TYPE_LABELS[group.recurrenceType]}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {group.professionalProfile.user.name}
                    </p>
                    <div className="flex gap-3 mt-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200">
                        {group.activeMemberCount ?? 0} membro{(group.activeMemberCount ?? 0) !== 1 ? "s" : ""}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {group.duration} min
                      </span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditSheet(group)}
                        className="h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                      >
                        Editar
                      </button>
                      {group.isActive ? (
                        <button
                          onClick={() => handleDeactivate(group)}
                          className="h-9 px-3 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(group)}
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
      {isSheetOpen && isMounted && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeSheet}
          />
          {/* Sheet Container */}
          <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center">
            <div className="w-full max-w-4xl bg-background border-t border-border rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
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
                {viewingGroup && !editingGroup && (
                  <>
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-xl font-semibold text-foreground">
                          {viewingGroup.name}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {viewingGroup.professionalProfile.user.name}
                        </p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => openEditSheet(viewingGroup)}
                          className="h-9 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted"
                        >
                          Editar
                        </button>
                      )}
                    </div>

                    {isLoadingDetails ? (
                      <div className="animate-pulse space-y-4">
                        <div className="h-6 w-32 bg-muted rounded" />
                        <div className="h-4 w-48 bg-muted rounded" />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Schedule Info */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-muted-foreground">Dia</label>
                            <p className="text-foreground">{DAY_OF_WEEK_LABELS[viewingGroup.dayOfWeek]}</p>
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground">Horário</label>
                            <p className="text-foreground">{viewingGroup.startTime}</p>
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground">Duração</label>
                            <p className="text-foreground">{viewingGroup.duration} minutos</p>
                          </div>
                          <div>
                            <label className="text-sm text-muted-foreground">Recorrência</label>
                            <p className="text-foreground">{RECURRENCE_TYPE_LABELS[viewingGroup.recurrenceType]}</p>
                          </div>
                        </div>

                        {/* Session Generation */}
                        {isAdmin && viewingGroup.isActive && (
                          <div className="border border-purple-200 dark:border-purple-800 rounded-lg p-4 bg-purple-50/50 dark:bg-purple-950/30">
                            {isGeneratingOpen ? (
                              <div className="space-y-4">
                                <h4 className="font-medium text-foreground">Gerar Sessões</h4>

                                {/* Mode selector */}
                                <div className="flex rounded-lg border border-input overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => setGenerateMode("generate")}
                                    className={`flex-1 h-10 text-sm font-medium transition-colors ${
                                      generateMode === "generate"
                                        ? "bg-purple-600 text-white"
                                        : "bg-background text-foreground hover:bg-muted"
                                    }`}
                                  >
                                    Criar Novas
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setGenerateMode("regenerate")}
                                    className={`flex-1 h-10 text-sm font-medium transition-colors ${
                                      generateMode === "regenerate"
                                        ? "bg-purple-600 text-white"
                                        : "bg-background text-foreground hover:bg-muted"
                                    }`}
                                  >
                                    Atualizar Membros
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setGenerateMode("reschedule")}
                                    className={`flex-1 h-10 text-sm font-medium transition-colors ${
                                      generateMode === "reschedule"
                                        ? "bg-purple-600 text-white"
                                        : "bg-background text-foreground hover:bg-muted"
                                    }`}
                                  >
                                    Reagendar
                                  </button>
                                </div>

                                <p className="text-xs text-muted-foreground">
                                  {generateMode === "generate"
                                    ? "Cria novas sessões no período selecionado."
                                    : generateMode === "regenerate"
                                    ? "Adiciona novos membros a todas as sessões futuras já existentes."
                                    : "Cancela todas as sessões futuras e recria com as configurações atuais do grupo."}
                                </p>

                                {generateMode === "reschedule" && (
                                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                    Todas as sessões futuras serão canceladas e recriadas com as configurações atuais do grupo.
                                  </p>
                                )}

                                {(generateMode === "generate" || generateMode === "reschedule") && (
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="block text-sm text-muted-foreground mb-1">Data Início</label>
                                      <input
                                        type="date"
                                        value={generateStartDate}
                                        onChange={(e) => setGenerateStartDate(e.target.value)}
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-sm text-muted-foreground mb-1">Data Fim</label>
                                      <input
                                        type="date"
                                        value={generateEndDate}
                                        onChange={(e) => setGenerateEndDate(e.target.value)}
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground"
                                      />
                                    </div>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    onClick={handleGenerateSessions}
                                    disabled={isGenerating}
                                    className="h-10 px-4 rounded-md bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50"
                                  >
                                    {isGenerating
                                      ? "Processando..."
                                      : generateMode === "generate"
                                      ? "Gerar Sessões"
                                      : generateMode === "regenerate"
                                      ? "Atualizar Sessões"
                                      : "Reagendar Sessões"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setIsGeneratingOpen(false)
                                      setGenerateMode("generate")
                                    }}
                                    className="h-10 px-4 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setIsGeneratingOpen(true)}
                                className="w-full h-10 rounded-md bg-purple-600 text-white font-medium hover:bg-purple-700"
                              >
                                Gerar / Atualizar Sessões
                              </button>
                            )}
                          </div>
                        )}

                        {/* Tabs */}
                        <div className="flex rounded-lg border border-input overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setViewTab("members")}
                            className={`flex-1 h-10 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                              viewTab === "members"
                                ? "bg-purple-600 text-white"
                                : "bg-background text-foreground hover:bg-muted"
                            }`}
                          >
                            <UsersIcon className="w-4 h-4" />
                            Membros ({viewingGroup.memberships.filter(m => !m.leaveDate).length})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setViewTab("sessions")
                              if (groupSessions.length === 0 && !isLoadingSessions) {
                                fetchGroupSessions(viewingGroup.id, sessionFilter, sessionPage)
                              }
                            }}
                            className={`flex-1 h-10 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                              viewTab === "sessions"
                                ? "bg-purple-600 text-white"
                                : "bg-background text-foreground hover:bg-muted"
                            }`}
                          >
                            <CalendarIcon className="w-4 h-4" />
                            Sessões
                          </button>
                        </div>

                        {/* Members Tab */}
                        {viewTab === "members" && (
                          <div>
                            <div className="flex items-center justify-end mb-4">
                              {isAdmin && viewingGroup.isActive && !isAddingMember && (
                                <button
                                  onClick={() => {
                                    setIsAddingMember(true)
                                    setMemberJoinDate(getTodayISO())
                                  }}
                                  className="h-8 px-3 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
                                >
                                  + Adicionar Membro
                                </button>
                              )}
                            </div>

                            {/* Add Member Form */}
                            {isAddingMember && (
                              <div className="mb-4 p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50/50 dark:bg-purple-950/30">
                                <h4 className="font-medium text-foreground mb-3">Adicionar Novo Membro</h4>

                                {/* Patient Search */}
                                <div className="relative mb-3">
                                  <label className="block text-sm text-muted-foreground mb-1">Paciente *</label>
                                  {selectedPatient ? (
                                    <div className="flex items-center justify-between h-10 px-3 rounded-md border border-input bg-background">
                                      <span className="text-foreground">{selectedPatient.name}</span>
                                      <button
                                        type="button"
                                        onClick={handleClearPatient}
                                        className="text-muted-foreground hover:text-foreground"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <input
                                        type="text"
                                        value={patientSearch}
                                        onChange={(e) => setPatientSearch(e.target.value)}
                                        placeholder="Buscar paciente por nome..."
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                      />
                                      {/* Search Results Dropdown */}
                                      {(patientSearchResults.length > 0 || isSearchingPatients) && (
                                        <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                          {isSearchingPatients ? (
                                            <div className="p-3 text-sm text-muted-foreground">Buscando...</div>
                                          ) : (
                                            patientSearchResults.map((patient) => (
                                              <button
                                                key={patient.id}
                                                type="button"
                                                onClick={() => handleSelectPatient(patient)}
                                                className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                                              >
                                                <p className="font-medium text-foreground">{patient.name}</p>
                                                <p className="text-xs text-muted-foreground">{patient.phone}</p>
                                              </button>
                                            ))
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>

                                {/* Join Date */}
                                <div className="mb-3">
                                  <label className="block text-sm text-muted-foreground mb-1">Data de Entrada *</label>
                                  <input
                                    type="date"
                                    value={memberJoinDate}
                                    onChange={(e) => setMemberJoinDate(e.target.value)}
                                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground"
                                  />
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2">
                                  <button
                                    onClick={handleAddMember}
                                    disabled={isSavingMember || !selectedPatient || !memberJoinDate}
                                    className="h-9 px-4 rounded-md bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSavingMember ? "Salvando..." : "Adicionar"}
                                  </button>
                                  <button
                                    onClick={resetAddMemberState}
                                    className="h-9 px-4 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            )}

                            {viewingGroup.memberships.length > 0 ? (
                              <div className="space-y-3">
                                {viewingGroup.memberships.map((membership) => {
                                  const isActive = !membership.leaveDate
                                  return (
                                    <div
                                      key={membership.id}
                                      className={`bg-muted/50 rounded-lg p-4 ${!isActive ? "opacity-60" : ""}`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <p className="font-medium text-foreground">{membership.patient.name}</p>
                                          <p className="text-sm text-muted-foreground">{membership.patient.phone}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <div className="text-right">
                                            <span className={`text-xs px-2 py-1 rounded-full ${isActive ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}>
                                              {isActive ? "Ativo" : "Saiu"}
                                            </span>
                                            <p className="text-xs text-muted-foreground mt-1">
                                              Desde {new Date(membership.joinDate).toLocaleDateString("pt-BR")}
                                            </p>
                                          </div>
                                          {isAdmin && isActive && (
                                            <button
                                              onClick={() => handleRemoveMember(membership.id, membership.patient.name)}
                                              className="h-7 px-2 text-xs rounded border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                            >
                                              Remover
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <p className="text-muted-foreground text-sm">
                                Nenhum membro cadastrado. {isAdmin && viewingGroup.isActive && "Clique em \"+ Adicionar Membro\" para começar."}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Sessions Tab */}
                        {viewTab === "sessions" && (
                          <div>
                            {/* Filter Toggle */}
                            <div className="flex rounded-lg border border-input overflow-hidden mb-4">
                              <button
                                type="button"
                                onClick={() => {
                                  if (sessionFilter !== "upcoming") {
                                    setSessionFilter("upcoming")
                                    setSessionPage(1)
                                    if (viewingGroup) {
                                      fetchGroupSessions(viewingGroup.id, "upcoming", 1)
                                    }
                                  }
                                }}
                                className={`flex-1 h-9 text-sm font-medium transition-colors ${
                                  sessionFilter === "upcoming"
                                    ? "bg-purple-600 text-white"
                                    : "bg-background text-foreground hover:bg-muted"
                                }`}
                              >
                                Próximas
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (sessionFilter !== "past") {
                                    setSessionFilter("past")
                                    setSessionPage(1)
                                    if (viewingGroup) {
                                      fetchGroupSessions(viewingGroup.id, "past", 1)
                                    }
                                  }
                                }}
                                className={`flex-1 h-9 text-sm font-medium transition-colors ${
                                  sessionFilter === "past"
                                    ? "bg-purple-600 text-white"
                                    : "bg-background text-foreground hover:bg-muted"
                                }`}
                              >
                                Passadas
                              </button>
                            </div>

                            {isLoadingSessions ? (
                              <div className="animate-pulse space-y-3">
                                <div className="h-16 bg-muted rounded-lg" />
                                <div className="h-16 bg-muted rounded-lg" />
                                <div className="h-16 bg-muted rounded-lg" />
                              </div>
                            ) : groupSessions.length > 0 ? (
                              <div className="space-y-2">
                                {groupSessions.map((session) => {
                                  const sessionDate = new Date(session.scheduledAt)
                                  const endDate = new Date(session.endAt)
                                  const isPast = sessionDate < new Date()
                                  const dateStr = sessionDate.toLocaleDateString("pt-BR", {
                                    weekday: "short",
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    timeZone: "America/Sao_Paulo",
                                  })
                                  const startTime = sessionDate.toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "America/Sao_Paulo",
                                  })
                                  const endTime = endDate.toLocaleTimeString("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "America/Sao_Paulo",
                                  })

                                  return (
                                    <div
                                      key={`${session.groupId}-${session.scheduledAt}`}
                                      className={`bg-muted/50 rounded-lg p-4 ${isPast ? "opacity-60" : ""}`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <p className="font-medium text-foreground capitalize">{dateStr}</p>
                                          <p className="text-sm text-muted-foreground">
                                            {startTime} - {endTime}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs px-2 py-1 rounded-full ${
                                            isPast
                                              ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                                              : "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"
                                          }`}>
                                            {session.participants.length} participante{session.participants.length !== 1 ? "s" : ""}
                                          </span>
                                          {isPast && (
                                            <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                                              Realizada
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {session.participants.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          {session.participants.map((p) => (
                                            <span
                                              key={p.appointmentId}
                                              className="text-xs px-2 py-0.5 rounded-full bg-background border border-border text-muted-foreground"
                                            >
                                              {p.patientName}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <EmptyState
                                title={sessionFilter === "upcoming" ? "Nenhuma sessão próxima" : "Nenhuma sessão passada"}
                                message={isAdmin && viewingGroup.isActive && sessionFilter === "upcoming" ? "Use \"Gerar / Atualizar Sessões\" para criar sessões" : sessionFilter === "past" ? "Nenhuma sessão passada encontrada" : "Ainda não há sessões para este grupo"}
                                icon={<CalendarIcon className="w-8 h-8 text-muted-foreground" />}
                              />
                            )}

                            {/* Pagination */}
                            {sessionTotal > SESSION_PAGE_SIZE && (
                              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const prev = sessionPage - 1
                                    setSessionPage(prev)
                                    if (viewingGroup) fetchGroupSessions(viewingGroup.id, sessionFilter, prev)
                                  }}
                                  disabled={sessionPage <= 1}
                                  className="h-8 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  &larr; Anterior
                                </button>
                                <span className="text-sm text-muted-foreground">
                                  Página {sessionPage} de {Math.ceil(sessionTotal / SESSION_PAGE_SIZE)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = sessionPage + 1
                                    setSessionPage(next)
                                    if (viewingGroup) fetchGroupSessions(viewingGroup.id, sessionFilter, next)
                                  }}
                                  disabled={sessionPage >= Math.ceil(sessionTotal / SESSION_PAGE_SIZE)}
                                  className="h-8 px-3 rounded-md border border-input bg-background text-foreground text-sm font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Próxima &rarr;
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="pt-4">
                          <button
                            type="button"
                            onClick={closeSheet}
                            className="w-full h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted"
                          >
                            Fechar
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Create/Edit Mode */}
                {(editingGroup || (!viewingGroup && !isLoadingDetails)) && isAdmin && (
                  <>
                    <h2 className="text-xl font-semibold text-foreground mb-6">
                      {editingGroup ? "Editar Grupo" : "Novo Grupo"}
                    </h2>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                          Nome do Grupo *
                        </label>
                        <input
                          id="name"
                          type="text"
                          {...register("name")}
                          placeholder="Ex: Grupo de Ansiedade - Quinta"
                          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {errors.name && (
                          <p className="text-sm text-destructive mt-1">{errors.name.message}</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="professionalProfileId" className="block text-sm font-medium text-foreground mb-2">
                          Profissional *
                        </label>
                        <select
                          id="professionalProfileId"
                          {...register("professionalProfileId")}
                          className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">Selecione um profissional</option>
                          {professionals.map((prof) => (
                            <option key={prof.id} value={prof.professionalProfile?.id || ""}>
                              {prof.name}
                              {prof.professionalProfile?.specialty && ` - ${prof.professionalProfile.specialty}`}
                            </option>
                          ))}
                        </select>
                        {errors.professionalProfileId && (
                          <p className="text-sm text-destructive mt-1">{errors.professionalProfileId.message}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="dayOfWeek" className="block text-sm font-medium text-foreground mb-2">
                            Dia da Semana *
                          </label>
                          <select
                            id="dayOfWeek"
                            {...register("dayOfWeek", { valueAsNumber: true })}
                            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {DAY_OF_WEEK_LABELS.map((label, index) => (
                              <option key={index} value={index}>{label}</option>
                            ))}
                          </select>
                          {errors.dayOfWeek && (
                            <p className="text-sm text-destructive mt-1">{errors.dayOfWeek.message}</p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-2">
                            Horário *
                          </label>
                          <input
                            id="startTime"
                            type="text"
                            placeholder="Ex: 14:00"
                            {...register("startTime")}
                            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          {errors.startTime && (
                            <p className="text-sm text-destructive mt-1">{errors.startTime.message}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-2">
                            Duração (minutos) *
                          </label>
                          <input
                            id="duration"
                            type="number"
                            {...register("duration", { valueAsNumber: true })}
                            min={15}
                            max={480}
                            step={5}
                            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          {errors.duration && (
                            <p className="text-sm text-destructive mt-1">{errors.duration.message}</p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="recurrenceType" className="block text-sm font-medium text-foreground mb-2">
                            Recorrência *
                          </label>
                          <select
                            id="recurrenceType"
                            {...register("recurrenceType")}
                            className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="WEEKLY">Semanal</option>
                            <option value="BIWEEKLY">Quinzenal</option>
                            <option value="MONTHLY">Mensal</option>
                          </select>
                          {errors.recurrenceType && (
                            <p className="text-sm text-destructive mt-1">{errors.recurrenceType.message}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <button
                          type="submit"
                          disabled={isSaving}
                          className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSaving
                            ? "Salvando..."
                            : editingGroup
                            ? "Salvar alterações"
                            : "Criar grupo"}
                        </button>
                        <button
                          type="button"
                          onClick={closeSheet}
                          className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>

                    {/* Members Section in Edit Mode (only for existing groups) */}
                    {editingGroup && viewingGroup && (
                      <div className="mt-8 pt-6 border-t border-border">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-medium text-foreground">
                            Membros ({viewingGroup.memberships.filter(m => !m.leaveDate).length})
                          </h3>
                          {!isAddingMember && editingGroup.isActive && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingMember(true)
                                setMemberJoinDate(getTodayISO())
                              }}
                              className="h-8 px-3 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
                            >
                              + Adicionar Membro
                            </button>
                          )}
                        </div>

                        {/* Add Member Form */}
                        {isAddingMember && (
                          <div className="mb-4 p-4 border border-purple-200 dark:border-purple-800 rounded-lg bg-purple-50/50 dark:bg-purple-950/30">
                            <h4 className="font-medium text-foreground mb-3">Adicionar Novo Membro</h4>

                            {/* Patient Search */}
                            <div className="relative mb-3">
                              <label className="block text-sm text-muted-foreground mb-1">Paciente *</label>
                              {selectedPatient ? (
                                <div className="flex items-center justify-between h-10 px-3 rounded-md border border-input bg-background">
                                  <span className="text-foreground">{selectedPatient.name}</span>
                                  <button
                                    type="button"
                                    onClick={handleClearPatient}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <input
                                    type="text"
                                    value={patientSearch}
                                    onChange={(e) => setPatientSearch(e.target.value)}
                                    placeholder="Buscar paciente por nome..."
                                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                  {/* Search Results Dropdown */}
                                  {(patientSearchResults.length > 0 || isSearchingPatients) && (
                                    <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                      {isSearchingPatients ? (
                                        <div className="p-3 text-sm text-muted-foreground">Buscando...</div>
                                      ) : (
                                        patientSearchResults.map((patient) => (
                                          <button
                                            key={patient.id}
                                            type="button"
                                            onClick={() => handleSelectPatient(patient)}
                                            className="w-full px-3 py-2 text-left hover:bg-muted transition-colors"
                                          >
                                            <p className="font-medium text-foreground">{patient.name}</p>
                                            <p className="text-xs text-muted-foreground">{patient.phone}</p>
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Join Date */}
                            <div className="mb-3">
                              <label className="block text-sm text-muted-foreground mb-1">Data de Entrada *</label>
                              <input
                                type="date"
                                value={memberJoinDate}
                                onChange={(e) => setMemberJoinDate(e.target.value)}
                                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground"
                              />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleAddMember}
                                disabled={isSavingMember || !selectedPatient || !memberJoinDate}
                                className="h-9 px-4 rounded-md bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isSavingMember ? "Salvando..." : "Adicionar"}
                              </button>
                              <button
                                type="button"
                                onClick={resetAddMemberState}
                                className="h-9 px-4 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Members List */}
                        {isLoadingDetails ? (
                          <div className="animate-pulse space-y-3">
                            <div className="h-16 bg-muted rounded-lg" />
                            <div className="h-16 bg-muted rounded-lg" />
                          </div>
                        ) : viewingGroup.memberships.length > 0 ? (
                          <div className="space-y-3">
                            {viewingGroup.memberships.map((membership) => {
                              const isActive = !membership.leaveDate
                              return (
                                <div
                                  key={membership.id}
                                  className={`bg-muted/50 rounded-lg p-4 ${!isActive ? "opacity-60" : ""}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-medium text-foreground">{membership.patient.name}</p>
                                      <p className="text-sm text-muted-foreground">{membership.patient.phone}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-right">
                                        <span className={`text-xs px-2 py-1 rounded-full ${isActive ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}>
                                          {isActive ? "Ativo" : "Saiu"}
                                        </span>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Desde {new Date(membership.joinDate).toLocaleDateString("pt-BR")}
                                        </p>
                                      </div>
                                      {isActive && (
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveMember(membership.id, membership.patient.name)}
                                          className="h-7 px-2 text-xs rounded border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                        >
                                          Remover
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            Nenhum membro cadastrado. {editingGroup.isActive && "Clique em \"+ Adicionar Membro\" para começar."}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* FAB */}
      {isAdmin && (
        <FAB onClick={openCreateSheet} label="Novo grupo" />
      )}
    </main>
  )
}
