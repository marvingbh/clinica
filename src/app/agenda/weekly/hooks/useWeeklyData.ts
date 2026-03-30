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

interface BirthdayPatient {
  id: string
  name: string
  date?: string
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
  // Actions
  refetchAppointments: () => void
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

  const refetchAppointments = useCallback(() => {
    setRefetchTrigger(prev => prev + 1)
  }, [])

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
      try {
        const startDateStr = toDateString(weekStart)
        const endDateStr = toDateString(getWeekEnd(weekStart))
        const profId = isAdmin && selectedProfessionalId ? selectedProfessionalId : ""

        const params = new URLSearchParams({ startDate: startDateStr, endDate: endDateStr })
        if (profId) params.set("professionalProfileId", profId)

        const fetches: Promise<unknown>[] = [
          fetch(`/api/appointments?${params.toString()}`, { signal: abortController.signal }),
          fetchGroupSessions({
            startDate: weekStart,
            endDate: getWeekEnd(weekStart),
            professionalProfileId: profId || undefined,
            signal: abortController.signal,
          }),
        ]

        const effectiveProfId = profId || (!isAdmin ? activeProfessionalProfileId : "")
        if (effectiveProfId) {
          fetches.push(
            fetch(`/api/availability?professionalProfileId=${effectiveProfId}`, { signal: abortController.signal }),
            fetch(`/api/availability/exceptions?professionalProfileId=${effectiveProfId}`, { signal: abortController.signal }),
          )
        }

        const results = await Promise.all(fetches)
        if (abortController.signal.aborted) return

        const appointmentsResponse = results[0] as Response
        const groupSessionsData = results[1] as { groupSessions: GroupSession[] }

        if (!appointmentsResponse.ok) {
          if (appointmentsResponse.status === 403) {
            toast.error("Acesso negado")
            router.push("/login")
            return
          }
          throw new Error("Failed to fetch appointments")
        }

        const appointmentsData = await appointmentsResponse.json()
        if (abortController.signal.aborted) return

        setAppointments(appointmentsData.appointments)
        setGroupSessions(groupSessionsData.groupSessions)
        setBiweeklyHints(appointmentsData.biweeklyHints || [])
        setBirthdayPatients(appointmentsData.birthdayPatients || [])

        if (effectiveProfId && results.length > 2) {
          const rulesResponse = results[2] as Response
          const exceptionsResponse = results[3] as Response
          if (rulesResponse.ok) {
            const rulesData = await rulesResponse.json()
            setAvailabilityRules(rulesData.rules || [])
          } else { setAvailabilityRules([]) }
          if (exceptionsResponse.ok) {
            const exceptionsData = await exceptionsResponse.json()
            setAvailabilityExceptions(exceptionsData.exceptions || [])
          } else { setAvailabilityExceptions([]) }
        } else {
          setAvailabilityRules([])
          setAvailabilityExceptions([])
          setBiweeklyHints([])
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        toast.error("Erro ao carregar agenda")
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
    refetchAppointments,
  }
}
