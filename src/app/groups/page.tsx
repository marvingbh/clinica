"use client"

import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  FAB,
  SkeletonPage,
  EmptyState,
  UsersIcon,
} from "@/shared/components/ui"
import { CalendarIcon } from "@/shared/components/ui/icons"
import { usePermission } from "@/shared/hooks/usePermission"
import {
  GroupCard,
  MembersTab,
  SessionsTab,
  SessionGenerationPanel,
  GroupForm,
  AddMemberForm,
  MemberCard,
} from "./components"
import {
  TherapyGroup,
  GroupDetails,
  GroupSessionItem,
  Professional,
  GroupFormData,
  ViewTab,
  groupSchema,
} from "./components/types"
import { DAY_OF_WEEK_LABELS, RECURRENCE_TYPE_LABELS, getTodayISO } from "./components/constants"

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
  const [sessionGoToDate, setSessionGoToDate] = useState("")
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

  // Additional professionals state
  const [additionalProfessionalIds, setAdditionalProfessionalIds] = useState<string[]>([])

  const { canWrite } = usePermission("groups")

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

  const fetchGroupSessions = useCallback(async (groupId: string, filter: string, page: number, referenceDate?: string) => {
    setIsLoadingSessions(true)
    try {
      let url = `/api/group-sessions?groupId=${groupId}&filter=${filter}&page=${page}&limit=${SESSION_PAGE_SIZE}`
      if (referenceDate) url += `&referenceDate=${referenceDate}`
      const response = await fetch(url)
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
    setAdditionalProfessionalIds([])
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
    setAdditionalProfessionalIds(
      group.additionalProfessionals?.map(ap => ap.professionalProfile.id) || []
    )
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
    setSessionGoToDate("")
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
        body: JSON.stringify({
          ...data,
          additionalProfessionalIds: additionalProfessionalIds.length > 0 ? additionalProfessionalIds : [],
        }),
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

  function handleAdditionalProfessionalToggle(profId: string) {
    setAdditionalProfessionalIds(prev =>
      prev.includes(profId)
        ? prev.filter(id => id !== profId)
        : [...prev, profId]
    )
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
          {canWrite && (
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
              action={canWrite ? { label: "Criar grupo", onClick: openCreateSheet } : undefined}
              icon={<UsersIcon className="w-8 h-8 text-muted-foreground" />}
            />
          ) : (
            groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                canWrite={canWrite}
                onView={openViewSheet}
                onEdit={openEditSheet}
                onDeactivate={handleDeactivate}
                onReactivate={handleReactivate}
              />
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
                          {viewingGroup.additionalProfessionals && viewingGroup.additionalProfessionals.length > 0 && (
                            <span>
                              {" "}+ {viewingGroup.additionalProfessionals.map(ap => ap.professionalProfile.user.name).join(", ")}
                            </span>
                          )}
                        </p>
                      </div>
                      {canWrite && (
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
                        {canWrite && viewingGroup.isActive && (
                          <SessionGenerationPanel
                            isGeneratingOpen={isGeneratingOpen}
                            generateMode={generateMode}
                            generateStartDate={generateStartDate}
                            generateEndDate={generateEndDate}
                            isGenerating={isGenerating}
                            onOpenGenerating={() => setIsGeneratingOpen(true)}
                            onCloseGenerating={() => {
                              setIsGeneratingOpen(false)
                              setGenerateMode("generate")
                            }}
                            onModeChange={setGenerateMode}
                            onStartDateChange={setGenerateStartDate}
                            onEndDateChange={setGenerateEndDate}
                            onGenerate={handleGenerateSessions}
                          />
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
                          <MembersTab
                            viewingGroup={viewingGroup}
                            canWrite={canWrite}
                            isAddingMember={isAddingMember}
                            selectedPatient={selectedPatient}
                            patientSearch={patientSearch}
                            patientSearchResults={patientSearchResults}
                            isSearchingPatients={isSearchingPatients}
                            memberJoinDate={memberJoinDate}
                            isSavingMember={isSavingMember}
                            onStartAddMember={() => {
                              setIsAddingMember(true)
                              setMemberJoinDate(getTodayISO())
                            }}
                            onPatientSearch={setPatientSearch}
                            onSelectPatient={handleSelectPatient}
                            onClearPatient={handleClearPatient}
                            onJoinDateChange={setMemberJoinDate}
                            onAddMember={handleAddMember}
                            onCancelAddMember={resetAddMemberState}
                            onRemoveMember={handleRemoveMember}
                          />
                        )}

                        {/* Sessions Tab */}
                        {viewTab === "sessions" && (
                          <SessionsTab
                            groupId={viewingGroup.id}
                            isActive={viewingGroup.isActive}
                            canWrite={canWrite}
                            sessionFilter={sessionFilter}
                            groupSessions={groupSessions}
                            isLoadingSessions={isLoadingSessions}
                            sessionPage={sessionPage}
                            sessionTotal={sessionTotal}
                            sessionPageSize={SESSION_PAGE_SIZE}
                            sessionGoToDate={sessionGoToDate}
                            onFilterChange={setSessionFilter}
                            onPageChange={setSessionPage}
                            onGoToDateChange={setSessionGoToDate}
                            onClearGoToDate={() => setSessionGoToDate("")}
                            onFetchSessions={fetchGroupSessions}
                          />
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
                {(editingGroup || (!viewingGroup && !isLoadingDetails)) && canWrite && (
                  <>
                    <GroupForm
                      register={register}
                      errors={errors}
                      professionals={professionals}
                      additionalProfessionalIds={additionalProfessionalIds}
                      editingGroup={editingGroup}
                      isSaving={isSaving}
                      onSubmit={handleSubmit(onSubmit)}
                      onCancel={closeSheet}
                      onAdditionalProfessionalToggle={handleAdditionalProfessionalToggle}
                    />

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
                          <AddMemberForm
                            selectedPatient={selectedPatient}
                            patientSearch={patientSearch}
                            patientSearchResults={patientSearchResults}
                            isSearchingPatients={isSearchingPatients}
                            memberJoinDate={memberJoinDate}
                            isSavingMember={isSavingMember}
                            onPatientSearch={setPatientSearch}
                            onSelectPatient={handleSelectPatient}
                            onClearPatient={handleClearPatient}
                            onJoinDateChange={setMemberJoinDate}
                            onAdd={handleAddMember}
                            onCancel={resetAddMemberState}
                          />
                        )}

                        {/* Members List */}
                        {isLoadingDetails ? (
                          <div className="animate-pulse space-y-3">
                            <div className="h-16 bg-muted rounded-lg" />
                            <div className="h-16 bg-muted rounded-lg" />
                          </div>
                        ) : viewingGroup.memberships.length > 0 ? (
                          <div className="space-y-3">
                            {viewingGroup.memberships.map((membership) => (
                              <MemberCard
                                key={membership.id}
                                membership={membership}
                                canRemove={true}
                                onRemove={handleRemoveMember}
                              />
                            ))}
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
      {canWrite && (
        <FAB onClick={openCreateSheet} label="Novo grupo" />
      )}
    </main>
  )
}
