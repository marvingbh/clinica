import { useState, useEffect, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { toDateString } from "../lib/utils"
import { DEFAULT_APPOINTMENT_DURATION } from "../lib/constants"
import type { Appointment, AvailabilityRule, AvailabilityException, Professional, GroupSession } from "../lib/types"
import {
  fetchAppointments as fetchAppointmentsApi,
  fetchAvailabilityRules,
  fetchAvailabilityExceptions,
  fetchProfessionals as fetchProfessionalsApi,
  fetchGroupSessions as fetchGroupSessionsApi,
} from "../services"

export interface UseAgendaDataParams {
  selectedDate: Date
  isAdmin: boolean
  currentProfessionalProfileId: string | null | undefined
  currentAppointmentDuration: number | null | undefined
  isAuthenticated: boolean
}

export interface UseAgendaDataReturn {
  appointments: Appointment[]
  groupSessions: GroupSession[]
  availabilityRules: AvailabilityRule[]
  availabilityExceptions: AvailabilityException[]
  professionals: Professional[]
  appointmentDuration: number
  selectedProfessionalId: string
  setSelectedProfessionalId: (id: string) => void
  refetchAppointments: () => Promise<void>
  isLoadingData: boolean
}

export function useAgendaData({
  selectedDate,
  isAdmin,
  currentProfessionalProfileId,
  currentAppointmentDuration,
  isAuthenticated,
}: UseAgendaDataParams): UseAgendaDataReturn {
  const router = useRouter()

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [groupSessions, setGroupSessions] = useState<GroupSession[]>([])
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([])
  const [availabilityExceptions, setAvailabilityExceptions] = useState<AvailabilityException[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedProfessionalId, setSelectedProfessionalIdState] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("clinica:selectedProfessionalId") || ""
    }
    return ""
  })
  const setSelectedProfessionalId = useCallback((id: string) => {
    setSelectedProfessionalIdState(id)
    if (typeof window !== "undefined") {
      if (id) {
        sessionStorage.setItem("clinica:selectedProfessionalId", id)
      } else {
        sessionStorage.removeItem("clinica:selectedProfessionalId")
      }
    }
  }, [])
  // Use session's appointmentDuration for non-admins, default for admins (will be updated when selecting professional)
  const [appointmentDuration, setAppointmentDuration] = useState(
    currentAppointmentDuration || DEFAULT_APPOINTMENT_DURATION
  )
  const [isLoadingData, setIsLoadingData] = useState(false)

  // Compute the active professional profile ID
  const activeProfessionalProfileId = useMemo(() => {
    return isAdmin && selectedProfessionalId
      ? selectedProfessionalId
      : currentProfessionalProfileId
  }, [isAdmin, selectedProfessionalId, currentProfessionalProfileId])

  // Fetch professionals for admin
  useEffect(() => {
    if (!isAdmin || !isAuthenticated) return

    async function loadProfessionals() {
      const data = await fetchProfessionalsApi()
      setProfessionals(data.professionals)
    }

    loadProfessionals()
  }, [isAdmin, isAuthenticated])

  // Individual fetchAppointments for use after create/update operations
  const refetchAppointments = useCallback(async () => {
    if (!activeProfessionalProfileId && !isAdmin) return
    try {
      const profId = isAdmin && selectedProfessionalId ? selectedProfessionalId : undefined
      const [appointmentsData, groupSessionsData] = await Promise.all([
        fetchAppointmentsApi({
          date: selectedDate,
          professionalProfileId: profId,
        }),
        fetchGroupSessionsApi({
          date: selectedDate,
          professionalProfileId: profId,
        }),
      ])
      setAppointments(appointmentsData.appointments)
      setGroupSessions(groupSessionsData.groupSessions)
    } catch (error) {
      if (error instanceof Error && error.message === "ACCESS_DENIED") {
        toast.error("Acesso negado")
        router.push("/login")
        return
      }
      toast.error("Erro ao carregar agenda")
    }
  }, [selectedDate, activeProfessionalProfileId, isAdmin, selectedProfessionalId, router])

  // Main data fetching effect with AbortController
  useEffect(() => {
    if (!isAuthenticated || (!activeProfessionalProfileId && !isAdmin)) {
      return
    }

    const abortController = new AbortController()
    const signal = abortController.signal

    async function fetchData() {
      setIsLoadingData(true)
      try {
        const dateStr = toDateString(selectedDate)
        const profId = isAdmin && selectedProfessionalId ? selectedProfessionalId : undefined

        const [appointmentsData, groupSessionsData, availabilityData, exceptionsData] = await Promise.all([
          fetchAppointmentsApi({ date: selectedDate, professionalProfileId: profId, signal }),
          fetchGroupSessionsApi({ date: selectedDate, professionalProfileId: profId, signal }),
          fetchAvailabilityRules({ professionalProfileId: profId, signal }),
          fetchAvailabilityExceptions({
            startDate: dateStr,
            endDate: dateStr,
            professionalProfileId: profId,
            signal,
          }),
        ])

        if (signal.aborted) return

        setAppointments(appointmentsData.appointments)
        setGroupSessions(groupSessionsData.groupSessions)
        setAvailabilityRules(availabilityData.rules || [])
        setAvailabilityExceptions(exceptionsData.exceptions || [])
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        if (error instanceof Error && error.message === "ACCESS_DENIED") {
          toast.error("Acesso negado")
          router.push("/login")
          return
        }
        toast.error("Erro ao carregar agenda")
      } finally {
        if (!signal.aborted) {
          setIsLoadingData(false)
        }
      }
    }

    fetchData()

    return () => {
      abortController.abort()
    }
  }, [isAuthenticated, selectedDate, activeProfessionalProfileId, isAdmin, selectedProfessionalId, router])

  // Update appointment duration from session for non-admins
  useEffect(() => {
    if (!isAdmin && currentAppointmentDuration) {
      setAppointmentDuration(currentAppointmentDuration)
    }
  }, [isAdmin, currentAppointmentDuration])

  // Update appointment duration when professionals data is available (for admins)
  useEffect(() => {
    if (isAdmin && professionals.length > 0 && activeProfessionalProfileId) {
      const prof = professionals.find(
        (p) => p.professionalProfile?.id === activeProfessionalProfileId
      )
      if (prof?.professionalProfile?.appointmentDuration) {
        setAppointmentDuration(prof.professionalProfile.appointmentDuration)
      }
    }
  }, [isAdmin, professionals, activeProfessionalProfileId])

  return {
    appointments,
    groupSessions,
    availabilityRules,
    availabilityExceptions,
    professionals,
    appointmentDuration,
    selectedProfessionalId,
    setSelectedProfessionalId,
    refetchAppointments,
    isLoadingData,
  }
}
