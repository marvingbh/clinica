import { useState, useCallback, useMemo } from "react"
// eslint-disable-next-line no-restricted-imports
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import type { Appointment, GroupSession, Professional, AvailabilityRule, AvailabilityException, BiweeklyHint } from "../../lib/types"
import { toDateString, getWeekEnd } from "../../lib/utils"
import { fetchGroupSessions } from "../../services/groupSessionService"
import { DEFAULT_APPOINTMENT_DURATION } from "../../lib/constants"
import { usePermission } from "@/shared/hooks/usePermission"
import { useAgendaContext } from "../../context/AgendaContext"
import { classifyAgendaError, createPartialFailureError, shouldAutoRetry, getRetryDelay, type AgendaError } from "@/lib/errors/agenda-errors"
import { useNetworkStatus } from "@/lib/errors/fetch-with-classification"

interface BirthdayPatient {
  id: string
  name: string
  date?: string
}

interface ErrorState {
  appointments: AgendaError | null
  groupSessions: AgendaError | null
  availability: AgendaError | null
  exceptions: AgendaError | null
  hasAnyError: boolean
  hasPartialFailure: boolean
  globalError: AgendaError | null // For complete failures
}

export interface UseWeeklyDataReturn {
  // Auth & context
  isAdmin: boolean
  canWriteAgenda: boolean
  selectedProfessionalId: string
  setSelectedProfessionalId: (id: string) => void
  activeProfessionalProfileId: string | null | undefined
  // Data
  appointments: Appointment[]
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>
  groupSessions: GroupSession[]
  professionals: Professional[]
  appointmentDuration: number
  availabilityRules: AvailabilityRule[]
  availabilityExceptions: AvailabilityException[]
  biweeklyHints: BiweeklyHint[]
  birthdayPatients: BirthdayPatient[]
  // State
  isLoading: boolean
  isDataLoading: boolean
  // Error state
  errors: ErrorState
  // Actions
  refetchAppointments: () => void
  retryAll: () => void
  retryAppointments: () => void
  retryGroupSessions: () => void
  retryAvailability: () => void
  clearErrors: () => void
}

export function useWeeklyData(weekStart: Date): UseWeeklyDataReturn {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { selectedProfessionalId, setSelectedProfessionalId } = useAgendaContext()
  const { canRead: canReadOthersAgenda } = usePermission("agenda_others")
  const { canWrite: canWriteAgenda } = usePermission("agenda_own")
  const isAdmin = canReadOthersAgenda
  const currentProfessionalProfileId = session?.user?.professionalProfileId
  const activeProfessionalProfileId = isAdmin && selectedProfessionalId
    ? selectedProfessionalId
    : currentProfessionalProfileId

  const [isLoading, setIsLoading] = useState(true)
  const [isDataLoading, setIsDataLoading] = useState(false)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([])
  const [availabilityExceptions, setAvailabilityExceptions] = useState<AvailabilityException[]>([])
  const [biweeklyHints, setBiweeklyHints] = useState<BiweeklyHint[]>([])
  const [birthdayPatients, setBirthdayPatients] = useState<BirthdayPatient[]>([])
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  // Error state management
  const [errors, setErrors] = useState<ErrorState>({
    appointments: null,
    groupSessions: null,
    availability: null,
    exceptions: null,
    hasAnyError: false,
    hasPartialFailure: false,
    globalError: null
  })

  // Network status for auto-retry on reconnection
  const { isOnline, wasOffline, clearWasOffline } = useNetworkStatus()

  const refetchAppointments = useCallback(() => {
    setRefetchTrigger(prev => prev + 1)
  }, [])

  // Retry functions
  const retryAll = useCallback(() => {
    clearErrors()
    setRefetchTrigger(prev => prev + 1)
  }, [])

  const retryAppointments = useCallback(() => {
    setErrors(prev => ({ ...prev, appointments: null }))
    setRefetchTrigger(prev => prev + 1)
  }, [])

  const retryGroupSessions = useCallback(() => {
    setErrors(prev => ({ ...prev, groupSessions: null }))
    setRefetchTrigger(prev => prev + 1)
  }, [])

  const retryAvailability = useCallback(() => {
    setErrors(prev => ({
      ...prev,
      availability: null,
      exceptions: null
    }))
    setRefetchTrigger(prev => prev + 1)
  }, [])

  const clearErrors = useCallback(() => {
    setErrors({
      appointments: null,
      groupSessions: null,
      availability: null,
      exceptions: null,
      hasAnyError: false,
      hasPartialFailure: false,
      globalError: null
    })
  }, [])

  // Auto-retry when network comes back online
  useEffect(() => {
    if (wasOffline && isOnline && errors.hasAnyError) {
      clearWasOffline()
      // Auto-retry after network reconnection
      setTimeout(() => {
        retryAll()
        toast.success("Conexão restabelecida - recarregando dados...")
      }, 1000)
    }
  }, [wasOffline, isOnline, errors.hasAnyError, clearWasOffline, retryAll])

  // Auth check: redirects when session status changes

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }
    if (status === "authenticated") {
      setIsLoading(false)
    }
  }, [status, router])

  // Fetch professionals for admin: re-fetches when auth/admin status changes
   
  useEffect(() => {
    if (status !== "authenticated" || !isAdmin) return
    fetch("/api/professionals")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setProfessionals(data.professionals) })
      .catch(() => {})
  }, [status, isAdmin])

  // Main data fetch: re-fetches when week/professional/auth changes or refetchTrigger fires
   
  useEffect(() => {
    if (status !== "authenticated" || (!activeProfessionalProfileId && !isAdmin)) return

    const abortController = new AbortController()

    async function fetchData() {
      setIsDataLoading(true)
      clearErrors()

      const startDateStr = toDateString(weekStart)
      const endDateStr = toDateString(getWeekEnd(weekStart))
      const profId = isAdmin && selectedProfessionalId ? selectedProfessionalId : ""
      const effectiveProfId = profId || (!isAdmin ? activeProfessionalProfileId : "")

      const params = new URLSearchParams({ startDate: startDateStr, endDate: endDateStr })
      if (profId) params.set("professionalProfileId", profId)

      const endpointErrors: AgendaError[] = []
      const failedEndpoints: string[] = []
      let hasAnySuccess = false

      try {
        // Fetch appointments
        let appointmentsData: any = { appointments: [], biweeklyHints: [], birthdayPatients: [] }
        try {
          const appointmentsResponse = await fetch(`/api/appointments?${params.toString()}`, {
            signal: abortController.signal,
            headers: { 'Content-Type': 'application/json' }
          })

          if (abortController.signal.aborted) return

          if (appointmentsResponse.status === 403) {
            toast.error("Acesso negado")
            router.push("/login")
            return
          }

          if (!appointmentsResponse.ok) {
            const appointmentsError = classifyAgendaError({
              error: new Error(`HTTP ${appointmentsResponse.status}`),
              response: appointmentsResponse,
              isOnline,
              endpoint: "agendamentos"
            })
            setErrors(prev => ({ ...prev, appointments: appointmentsError }))
            endpointErrors.push(appointmentsError)
            failedEndpoints.push("agendamentos")
          } else {
            appointmentsData = await appointmentsResponse.json()
            setAppointments(appointmentsData.appointments || [])
            setBiweeklyHints(appointmentsData.biweeklyHints || [])
            setBirthdayPatients(appointmentsData.birthdayPatients || [])
            hasAnySuccess = true
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return

          const appointmentsError = classifyAgendaError({
            error: error as Error,
            isOnline,
            endpoint: "agendamentos"
          })
          setErrors(prev => ({ ...prev, appointments: appointmentsError }))
          endpointErrors.push(appointmentsError)
          failedEndpoints.push("agendamentos")
        }

        // Fetch group sessions
        try {
          const groupSessionsData = await fetchGroupSessions({
            startDate: weekStart,
            endDate: getWeekEnd(weekStart),
            professionalProfileId: profId || undefined,
            signal: abortController.signal,
          })

          if (abortController.signal.aborted) return

          setGroupSessions(groupSessionsData.groupSessions || [])
          hasAnySuccess = true
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return

          const groupSessionsError = classifyAgendaError({
            error: error as Error,
            isOnline,
            endpoint: "sessões em grupo"
          })
          setErrors(prev => ({ ...prev, groupSessions: groupSessionsError }))
          endpointErrors.push(groupSessionsError)
          failedEndpoints.push("sessões em grupo")
          setGroupSessions([])
        }

        // Fetch availability data (only if we have a professional)
        if (effectiveProfId) {
          // Availability rules
          try {
            const rulesResponse = await fetch(`/api/availability?professionalProfileId=${effectiveProfId}`, {
              signal: abortController.signal,
              headers: { 'Content-Type': 'application/json' }
            })

            if (abortController.signal.aborted) return

            if (!rulesResponse.ok) {
              const availabilityError = classifyAgendaError({
                error: new Error(`HTTP ${rulesResponse.status}`),
                response: rulesResponse,
                isOnline,
                endpoint: "disponibilidade"
              })
              setErrors(prev => ({ ...prev, availability: availabilityError }))
              endpointErrors.push(availabilityError)
              failedEndpoints.push("disponibilidade")
              setAvailabilityRules([])
            } else {
              const rulesData = await rulesResponse.json()
              setAvailabilityRules(rulesData.rules || [])
              hasAnySuccess = true
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return

            const availabilityError = classifyAgendaError({
              error: error as Error,
              isOnline,
              endpoint: "disponibilidade"
            })
            setErrors(prev => ({ ...prev, availability: availabilityError }))
            endpointErrors.push(availabilityError)
            failedEndpoints.push("disponibilidade")
            setAvailabilityRules([])
          }

          // Availability exceptions
          try {
            const exceptionsResponse = await fetch(`/api/availability/exceptions?professionalProfileId=${effectiveProfId}`, {
              signal: abortController.signal,
              headers: { 'Content-Type': 'application/json' }
            })

            if (abortController.signal.aborted) return

            if (!exceptionsResponse.ok) {
              const exceptionsError = classifyAgendaError({
                error: new Error(`HTTP ${exceptionsResponse.status}`),
                response: exceptionsResponse,
                isOnline,
                endpoint: "exceções de horário"
              })
              setErrors(prev => ({ ...prev, exceptions: exceptionsError }))
              endpointErrors.push(exceptionsError)
              failedEndpoints.push("exceções de horário")
              setAvailabilityExceptions([])
            } else {
              const exceptionsData = await exceptionsResponse.json()
              setAvailabilityExceptions(exceptionsData.exceptions || [])
              hasAnySuccess = true
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") return

            const exceptionsError = classifyAgendaError({
              error: error as Error,
              isOnline,
              endpoint: "exceções de horário"
            })
            setErrors(prev => ({ ...prev, exceptions: exceptionsError }))
            endpointErrors.push(exceptionsError)
            failedEndpoints.push("exceções de horário")
            setAvailabilityExceptions([])
          }
        } else {
          setAvailabilityRules([])
          setAvailabilityExceptions([])
        }

        // Update error state summary
        const hasPartialFailure = endpointErrors.length > 0 && hasAnySuccess
        const hasCompleteFailure = endpointErrors.length > 0 && !hasAnySuccess

        if (hasCompleteFailure) {
          // Complete failure - create global error
          const globalError = endpointErrors.length === 1
            ? endpointErrors[0]
            : createPartialFailureError(failedEndpoints, endpointErrors)

          setErrors(prev => ({
            ...prev,
            hasAnyError: true,
            hasPartialFailure: false,
            globalError
          }))

          // Only show toast for complete failures, not partial ones
          toast.error(globalError.message)
        } else if (hasPartialFailure) {
          setErrors(prev => ({
            ...prev,
            hasAnyError: true,
            hasPartialFailure: true,
            globalError: null
          }))

          // Don't show toast for partial failures - UI will handle with banner
        } else {
          // Complete success
          setErrors(prev => ({
            ...prev,
            hasAnyError: false,
            hasPartialFailure: false,
            globalError: null
          }))
        }

      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return

        // Unexpected error in fetchData logic itself
        const globalError = classifyAgendaError({
          error: error as Error,
          isOnline,
          endpoint: "agenda"
        })

        setErrors(prev => ({
          ...prev,
          hasAnyError: true,
          hasPartialFailure: false,
          globalError
        }))

        toast.error(globalError.message)
      } finally {
        setIsDataLoading(false)
      }
    }

    fetchData()
    return () => { abortController.abort() }
  }, [status, weekStart, activeProfessionalProfileId, isAdmin, selectedProfessionalId, router, refetchTrigger])

  // Derived state: appointment duration based on role and selected professional
  const appointmentDuration = useMemo(() => {
    if (isAdmin && selectedProfessionalId) {
      const prof = professionals.find(p => p.professionalProfile?.id === selectedProfessionalId)
      return prof?.professionalProfile?.appointmentDuration ?? DEFAULT_APPOINTMENT_DURATION
    }
    return session?.user?.appointmentDuration ?? DEFAULT_APPOINTMENT_DURATION
  }, [isAdmin, selectedProfessionalId, professionals, session?.user?.appointmentDuration])

  return {
    isAdmin,
    canWriteAgenda,
    selectedProfessionalId,
    setSelectedProfessionalId,
    activeProfessionalProfileId,
    appointments,
    setAppointments,
    groupSessions,
    professionals,
    appointmentDuration,
    availabilityRules,
    availabilityExceptions,
    biweeklyHints,
    birthdayPatients,
    isLoading,
    isDataLoading,
    errors,
    refetchAppointments,
    retryAll,
    retryAppointments,
    retryGroupSessions,
    retryAvailability,
    clearErrors,
  }
}
