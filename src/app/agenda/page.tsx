"use client"

import { useCallback, useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const appointmentSchema = z.object({
  patientId: z.string().min(1, "Selecione um paciente"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  startTime: z.string().regex(timeRegex, "Horário inválido (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  notes: z.string().max(2000).optional().nullable(),
})

const editAppointmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  startTime: z.string().regex(timeRegex, "Horário inválido (HH:mm)"),
  duration: z.number().int().min(15).max(480).optional(),
  modality: z.enum(["ONLINE", "PRESENCIAL"]),
  notes: z.string().max(2000).optional().nullable(),
  price: z.union([z.number().min(0), z.string(), z.null()]).optional().nullable(),
})

type AppointmentFormData = z.infer<typeof appointmentSchema>
type EditAppointmentFormData = z.infer<typeof editAppointmentSchema>

interface Patient {
  id: string
  name: string
  phone: string
  email: string | null
}

interface Professional {
  id: string
  name: string
  professionalProfile: {
    id: string
    specialty: string | null
    appointmentDuration: number
  } | null
}

interface AvailabilityRule {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

interface AvailabilityException {
  id: string
  date: string
  isAvailable: boolean
  startTime: string | null
  endTime: string | null
  reason: string | null
}

interface Appointment {
  id: string
  scheduledAt: string
  endAt: string
  status: string
  modality: string
  notes: string | null
  price: string | null
  patient: {
    id: string
    name: string
    email: string | null
    phone: string
  }
  professionalProfile: {
    id: string
    user: {
      name: string
    }
  }
}

interface TimeSlot {
  time: string
  isAvailable: boolean
  appointment: Appointment | null
  isBlocked: boolean
  blockReason?: string
}

const statusLabels: Record<string, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  CANCELADO_PACIENTE: "Cancelado (Paciente)",
  CANCELADO_PROFISSIONAL: "Cancelado (Profissional)",
  NAO_COMPARECEU: "Nao compareceu",
  FINALIZADO: "Finalizado",
}

const statusColors: Record<string, string> = {
  AGENDADO: "bg-blue-100 text-blue-800 border-blue-200",
  CONFIRMADO: "bg-green-100 text-green-800 border-green-200",
  CANCELADO_PACIENTE: "bg-red-100 text-red-800 border-red-200",
  CANCELADO_PROFISSIONAL: "bg-red-100 text-red-800 border-red-200",
  NAO_COMPARECEU: "bg-yellow-100 text-yellow-800 border-yellow-200",
  FINALIZADO: "bg-gray-100 text-gray-800 border-gray-200",
}

const statusBorderColors: Record<string, string> = {
  AGENDADO: "border-l-blue-500",
  CONFIRMADO: "border-l-green-500",
  CANCELADO_PACIENTE: "border-l-red-500",
  CANCELADO_PROFISSIONAL: "border-l-red-500",
  NAO_COMPARECEU: "border-l-yellow-500",
  FINALIZADO: "border-l-gray-500",
}

function formatTime(time: string): string {
  return time.slice(0, 5)
}

function formatDateHeader(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dateOnly = new Date(date)
  dateOnly.setHours(0, 0, 0, 0)

  const diffDays = Math.round((dateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  const dayName = date.toLocaleDateString("pt-BR", { weekday: "long" })
  const formattedDate = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  if (diffDays === 0) return `Hoje, ${formattedDate}`
  if (diffDays === 1) return `Amanha, ${formattedDate}`
  if (diffDays === -1) return `Ontem, ${formattedDate}`

  return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${formattedDate}`
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0]
}

export default function AgendaPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([])
  const [availabilityExceptions, setAvailabilityExceptions] = useState<AvailabilityException[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>("")
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [appointmentDuration, setAppointmentDuration] = useState(50)

  // Touch gesture handling
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Appointment creation state
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientSearch, setPatientSearch] = useState("")
  const [isSearchingPatients, setIsSearchingPatients] = useState(false)
  const [isSavingAppointment, setIsSavingAppointment] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const patientSearchRef = useRef<HTMLInputElement>(null)

  // Appointment edit/detail state
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [isUpdatingAppointment, setIsUpdatingAppointment] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      modality: "PRESENCIAL",
    },
  })

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    formState: { errors: editErrors },
  } = useForm<EditAppointmentFormData>({
    resolver: zodResolver(editAppointmentSchema),
  })

  const isAdmin = session?.user?.role === "ADMIN"
  const currentProfessionalProfileId = session?.user?.professionalProfileId

  // Get the professionalProfileId to use for API calls
  const activeProfessionalProfileId = isAdmin && selectedProfessionalId
    ? selectedProfessionalId
    : currentProfessionalProfileId

  const fetchProfessionals = useCallback(async () => {
    if (!isAdmin) return

    try {
      const response = await fetch("/api/professionals")
      if (!response.ok) return
      const data = await response.json()
      setProfessionals(data.professionals)
    } catch {
      // Silently fail - professionals dropdown is optional
    }
  }, [isAdmin])

  const fetchAppointments = useCallback(async () => {
    if (!activeProfessionalProfileId && !isAdmin) return

    try {
      const params = new URLSearchParams({
        date: toDateString(selectedDate),
      })

      if (isAdmin && selectedProfessionalId) {
        params.set("professionalProfileId", selectedProfessionalId)
      }

      const response = await fetch(`/api/appointments?${params.toString()}`)
      if (!response.ok) {
        if (response.status === 403) {
          toast.error("Acesso negado")
          router.push("/login")
          return
        }
        throw new Error("Failed to fetch appointments")
      }
      const data = await response.json()
      setAppointments(data.appointments)
    } catch {
      toast.error("Erro ao carregar agenda")
    }
  }, [selectedDate, activeProfessionalProfileId, isAdmin, selectedProfessionalId, router])

  const fetchAvailability = useCallback(async () => {
    if (!activeProfessionalProfileId) return

    try {
      const params = new URLSearchParams()
      if (isAdmin && selectedProfessionalId) {
        params.set("professionalProfileId", selectedProfessionalId)
      }

      const response = await fetch(`/api/availability?${params.toString()}`)
      if (!response.ok) return
      const data = await response.json()
      setAvailabilityRules(data.rules)

      // Also fetch the appointment duration from the professional's profile
      if (data.rules.length > 0) {
        // Try to get appointment duration from professionals list
        const prof = professionals.find(p => p.professionalProfile?.id === activeProfessionalProfileId)
        if (prof?.professionalProfile?.appointmentDuration) {
          setAppointmentDuration(prof.professionalProfile.appointmentDuration)
        }
      }
    } catch {
      // Silently fail - availability is optional
    }
  }, [activeProfessionalProfileId, isAdmin, selectedProfessionalId, professionals])

  const fetchAvailabilityExceptions = useCallback(async () => {
    if (!activeProfessionalProfileId) return

    try {
      const params = new URLSearchParams({
        startDate: toDateString(selectedDate),
        endDate: toDateString(selectedDate),
      })

      if (isAdmin && selectedProfessionalId) {
        params.set("professionalProfileId", selectedProfessionalId)
      }

      const response = await fetch(`/api/availability/exceptions?${params.toString()}`)
      if (!response.ok) return
      const data = await response.json()
      setAvailabilityExceptions(data.exceptions)
    } catch {
      // Silently fail - exceptions are optional
    }
  }, [selectedDate, activeProfessionalProfileId, isAdmin, selectedProfessionalId])

  const searchPatients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setPatients([])
      return
    }

    setIsSearchingPatients(true)
    try {
      const params = new URLSearchParams({
        search: query,
        isActive: "true",
      })

      const response = await fetch(`/api/patients?${params.toString()}`)
      if (!response.ok) return
      const data = await response.json()
      setPatients(data.patients)
    } catch {
      // Silently fail
    } finally {
      setIsSearchingPatients(false)
    }
  }, [])

  // Debounced patient search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (patientSearch) {
        searchPatients(patientSearch)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [patientSearch, searchPatients])

  function openCreateSheet(slotTime?: string) {
    setSelectedPatient(null)
    setPatientSearch("")
    setPatients([])
    reset({
      patientId: "",
      date: toDateString(selectedDate),
      startTime: slotTime || "",
      modality: "PRESENCIAL",
      notes: "",
    })
    setIsCreateSheetOpen(true)
  }

  function closeCreateSheet() {
    setIsCreateSheetOpen(false)
    setSelectedPatient(null)
    setPatientSearch("")
    setPatients([])
  }

  function selectPatient(patient: Patient) {
    setSelectedPatient(patient)
    setValue("patientId", patient.id)
    setPatientSearch(patient.name)
    setShowPatientDropdown(false)
    setPatients([])
  }

  function openEditSheet(appointment: Appointment) {
    setSelectedAppointment(appointment)
    const scheduledDate = new Date(appointment.scheduledAt)
    const endDate = new Date(appointment.endAt)
    const durationMinutes = Math.round((endDate.getTime() - scheduledDate.getTime()) / 60000)

    resetEdit({
      date: toDateString(scheduledDate),
      startTime: `${scheduledDate.getHours().toString().padStart(2, "0")}:${scheduledDate.getMinutes().toString().padStart(2, "0")}`,
      duration: durationMinutes,
      modality: appointment.modality as "ONLINE" | "PRESENCIAL",
      notes: appointment.notes || "",
      price: appointment.price ? parseFloat(appointment.price) : null,
    })
    setIsEditSheetOpen(true)
  }

  function closeEditSheet() {
    setIsEditSheetOpen(false)
    setSelectedAppointment(null)
  }

  async function onSubmitEdit(data: EditAppointmentFormData) {
    if (!selectedAppointment) return

    setIsUpdatingAppointment(true)

    try {
      // Calculate scheduledAt and endAt from date, startTime, and duration
      const [hours, minutes] = data.startTime.split(":").map(Number)
      const scheduledAt = new Date(data.date + "T12:00:00")
      scheduledAt.setHours(hours, minutes, 0, 0)

      const durationMinutes = data.duration || appointmentDuration
      const endAt = new Date(scheduledAt.getTime() + durationMinutes * 60000)

      const body: Record<string, unknown> = {
        scheduledAt: scheduledAt.toISOString(),
        endAt: endAt.toISOString(),
        modality: data.modality,
        notes: data.notes || null,
        price: data.price !== undefined && data.price !== "" ? Number(data.price) : null,
      }

      const response = await fetch(`/api/appointments/${selectedAppointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Erro ao atualizar agendamento")
        return
      }

      toast.success("Agendamento atualizado com sucesso")
      closeEditSheet()
      fetchAppointments()
    } catch {
      toast.error("Erro ao atualizar agendamento")
    } finally {
      setIsUpdatingAppointment(false)
    }
  }

  async function onSubmitAppointment(data: AppointmentFormData) {
    setIsSavingAppointment(true)

    try {
      const body: Record<string, unknown> = {
        patientId: data.patientId,
        date: data.date,
        startTime: data.startTime,
        modality: data.modality,
        notes: data.notes || null,
      }

      // If admin and has selected a professional, include it
      if (isAdmin && selectedProfessionalId) {
        body.professionalProfileId = selectedProfessionalId
      }

      // Include duration if different from default
      if (data.duration) {
        body.duration = data.duration
      }

      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Erro ao criar agendamento")
        return
      }

      toast.success("Agendamento criado com sucesso")
      closeCreateSheet()
      fetchAppointments()
    } catch {
      toast.error("Erro ao criar agendamento")
    } finally {
      setIsSavingAppointment(false)
    }
  }

  // Generate time slots based on availability
  const generateTimeSlots = useCallback(() => {
    const dayOfWeek = selectedDate.getDay()
    const dateStr = toDateString(selectedDate)

    // Get active rules for this day of week
    const dayRules = availabilityRules.filter(
      (rule) => rule.dayOfWeek === dayOfWeek && rule.isActive
    )

    // Check for full-day exception (block)
    const fullDayException = availabilityExceptions.find(
      (ex) => toDateString(new Date(ex.date)) === dateStr && !ex.startTime && !ex.isAvailable
    )

    if (fullDayException) {
      setTimeSlots([])
      return
    }

    // If no availability rules for this day, show empty
    if (dayRules.length === 0) {
      setTimeSlots([])
      return
    }

    // Generate slots based on availability rules
    const slots: TimeSlot[] = []
    const slotDuration = appointmentDuration

    for (const rule of dayRules) {
      const [startHour, startMin] = rule.startTime.split(":").map(Number)
      const [endHour, endMin] = rule.endTime.split(":").map(Number)

      let currentMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin

      while (currentMinutes + slotDuration <= endMinutes) {
        const hour = Math.floor(currentMinutes / 60)
        const min = currentMinutes % 60
        const timeStr = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`

        // Check for time-specific exception
        const exception = availabilityExceptions.find((ex) => {
          if (toDateString(new Date(ex.date)) !== dateStr) return false
          if (!ex.startTime || !ex.endTime) return false
          return timeStr >= ex.startTime && timeStr < ex.endTime && !ex.isAvailable
        })

        // Find matching appointment
        const appointment = appointments.find((apt) => {
          const aptTime = new Date(apt.scheduledAt)
          const aptHour = aptTime.getHours()
          const aptMin = aptTime.getMinutes()
          return aptHour === hour && aptMin === min
        })

        slots.push({
          time: timeStr,
          isAvailable: !exception && !appointment,
          appointment: appointment || null,
          isBlocked: !!exception,
          blockReason: exception?.reason || undefined,
        })

        currentMinutes += slotDuration
      }
    }

    // Sort slots by time
    slots.sort((a, b) => a.time.localeCompare(b.time))
    setTimeSlots(slots)
  }, [selectedDate, availabilityRules, availabilityExceptions, appointments, appointmentDuration])

  // Touch gesture handlers
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchMove(e: React.TouchEvent) {
    touchEndX.current = e.touches[0].clientX
  }

  function handleTouchEnd() {
    if (!touchStartX.current || !touchEndX.current) return

    const diff = touchStartX.current - touchEndX.current
    const threshold = 50 // Minimum swipe distance

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swipe left - next day
        goToNextDay()
      } else {
        // Swipe right - previous day
        goToPreviousDay()
      }
    }

    touchStartX.current = null
    touchEndX.current = null
  }

  function goToPreviousDay() {
    setSelectedDate((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() - 1)
      return newDate
    })
  }

  function goToNextDay() {
    setSelectedDate((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() + 1)
      return newDate
    })
  }

  function goToToday() {
    setSelectedDate(new Date())
    setShowDatePicker(false)
  }

  // Initial load
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status === "authenticated") {
      setIsLoading(false)
      fetchProfessionals()
    }
  }, [status, router, fetchProfessionals])

  // Fetch data when date or professional changes
  useEffect(() => {
    if (status === "authenticated" && (activeProfessionalProfileId || isAdmin)) {
      fetchAppointments()
      fetchAvailability()
      fetchAvailabilityExceptions()
    }
  }, [
    status,
    selectedDate,
    activeProfessionalProfileId,
    isAdmin,
    fetchAppointments,
    fetchAvailability,
    fetchAvailabilityExceptions,
  ])

  // Generate slots when data changes
  useEffect(() => {
    generateTimeSlots()
  }, [generateTimeSlots])

  if (status === "loading" || isLoading) {
    return (
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-12 w-full bg-muted rounded" />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-muted rounded" />
              ))}
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border z-30">
        <div className="max-w-4xl mx-auto px-4 py-4">
          {/* Date Header - Tappable */}
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="w-full text-left mb-3"
          >
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              {formatDateHeader(selectedDate)}
              <svg
                className={`w-5 h-5 transition-transform ${showDatePicker ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </h1>
          </button>

          {/* Professional Filter - ADMIN only */}
          {isAdmin && professionals.length > 0 && (
            <select
              value={selectedProfessionalId}
              onChange={(e) => setSelectedProfessionalId(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            >
              <option value="">Todos os profissionais</option>
              {professionals.map((prof) => (
                <option key={prof.id} value={prof.professionalProfile?.id || ""}>
                  {prof.name}
                  {prof.professionalProfile?.specialty && ` - ${prof.professionalProfile.specialty}`}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Date Picker Dropdown */}
        {showDatePicker && (
          <div className="border-t border-border bg-card">
            <div className="max-w-4xl mx-auto px-4 py-4">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={goToPreviousDay}
                  className="h-10 w-10 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={goToToday}
                  className="h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted transition-colors"
                >
                  Hoje
                </button>
                <button
                  onClick={goToNextDay}
                  className="h-10 w-10 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <input
                type="date"
                value={toDateString(selectedDate)}
                onChange={(e) => {
                  setSelectedDate(new Date(e.target.value + "T12:00:00"))
                  setShowDatePicker(false)
                }}
                className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              />
            </div>
          </div>
        )}
      </header>

      {/* Timeline Content */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="max-w-4xl mx-auto px-4 py-4"
      >
        {/* Day navigation hint */}
        <p className="text-xs text-muted-foreground text-center mb-4">
          Deslize para esquerda ou direita para mudar o dia
        </p>

        {/* No availability message */}
        {timeSlots.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Sem disponibilidade
            </h3>
            <p className="text-sm text-muted-foreground">
              {isAdmin && !selectedProfessionalId
                ? "Selecione um profissional para ver a agenda"
                : "Nao ha horarios configurados para este dia"}
            </p>
          </div>
        )}

        {/* Timeline */}
        {timeSlots.length > 0 && (
          <div className="space-y-2">
            {timeSlots.map((slot) => (
              <div
                key={slot.time}
                className={`flex items-stretch gap-3 min-h-[4rem] ${
                  slot.isBlocked ? "opacity-50" : ""
                }`}
              >
                {/* Time Column */}
                <div className="w-14 flex-shrink-0 text-sm text-muted-foreground pt-2">
                  {formatTime(slot.time)}
                </div>

                {/* Slot Content */}
                {slot.appointment ? (
                  <button
                    type="button"
                    onClick={() => openEditSheet(slot.appointment!)}
                    className={`flex-1 bg-card border border-border rounded-lg p-3 border-l-4 text-left hover:bg-muted/50 transition-colors cursor-pointer ${
                      statusBorderColors[slot.appointment.status] || "border-l-gray-400"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium text-foreground truncate">
                          {slot.appointment.patient.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {formatPhone(slot.appointment.patient.phone)}
                        </p>
                        {isAdmin && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {slot.appointment.professionalProfile.user.name}
                          </p>
                        )}
                      </div>
                      <span
                        className={`flex-shrink-0 text-xs px-2 py-1 rounded-full border ${
                          statusColors[slot.appointment.status] || "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {statusLabels[slot.appointment.status] || slot.appointment.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">
                        {slot.appointment.modality === "ONLINE" ? "Online" : "Presencial"}
                      </span>
                      {slot.appointment.notes && (
                        <span className="text-xs text-muted-foreground truncate">
                          • {slot.appointment.notes}
                        </span>
                      )}
                    </div>
                  </button>
                ) : slot.isBlocked ? (
                  <div className="flex-1 bg-muted/50 border border-dashed border-border rounded-lg p-3 flex items-center">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span className="text-sm">
                        {slot.blockReason || "Bloqueado"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => openCreateSheet(slot.time)}
                    className="flex-1 border border-dashed border-border rounded-lg p-3 flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-sm">Disponivel</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB - Floating Action Button */}
      <button
        onClick={() => openCreateSheet()}
        className="fixed right-4 bottom-24 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-all z-30 flex items-center justify-center"
        aria-label="Novo agendamento"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Create Appointment Sheet */}
      {isCreateSheetOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeCreateSheet}
          />

          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto animate-slide-up">
            {/* Handle */}
            <div className="sticky top-0 bg-background pt-3 pb-2 px-4 border-b border-border">
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground">Novo Agendamento</h2>
            </div>

            <form onSubmit={handleSubmit(onSubmitAppointment)} className="p-4 space-y-6">
              {/* Patient Selection */}
              <div className="relative">
                <label htmlFor="patientSearch" className="block text-sm font-medium text-foreground mb-2">
                  Paciente *
                </label>
                <div className="relative">
                  <input
                    ref={patientSearchRef}
                    id="patientSearch"
                    type="text"
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value)
                      setShowPatientDropdown(true)
                      if (selectedPatient && e.target.value !== selectedPatient.name) {
                        setSelectedPatient(null)
                        setValue("patientId", "")
                      }
                    }}
                    onFocus={() => setShowPatientDropdown(true)}
                    placeholder="Digite o nome do paciente..."
                    className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                  />
                  {isSearchingPatients && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <svg className="w-5 h-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  )}
                </div>
                <input type="hidden" {...register("patientId")} />

                {/* Patient Dropdown */}
                {showPatientDropdown && patients.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {patients.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => selectPatient(patient)}
                        className="w-full px-4 py-3 text-left hover:bg-muted transition-colors flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-foreground">{patient.name}</p>
                          <p className="text-sm text-muted-foreground">{formatPhone(patient.phone)}</p>
                        </div>
                        {selectedPatient?.id === patient.id && (
                          <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* No results */}
                {showPatientDropdown && patientSearch.length >= 2 && patients.length === 0 && !isSearchingPatients && (
                  <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-md shadow-lg p-4 text-center text-muted-foreground">
                    Nenhum paciente encontrado
                  </div>
                )}

                {errors.patientId && (
                  <p className="text-sm text-destructive mt-1">{errors.patientId.message}</p>
                )}

                {selectedPatient && (
                  <div className="mt-2 p-3 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium text-foreground">{selectedPatient.name}</p>
                    <p className="text-xs text-muted-foreground">{formatPhone(selectedPatient.phone)}</p>
                    {selectedPatient.email && (
                      <p className="text-xs text-muted-foreground">{selectedPatient.email}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Date */}
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-foreground mb-2">
                  Data *
                </label>
                <input
                  id="date"
                  type="date"
                  {...register("date")}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                {errors.date && (
                  <p className="text-sm text-destructive mt-1">{errors.date.message}</p>
                )}
              </div>

              {/* Start Time */}
              <div>
                <label htmlFor="startTime" className="block text-sm font-medium text-foreground mb-2">
                  Horario *
                </label>
                <input
                  id="startTime"
                  type="time"
                  {...register("startTime")}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                {errors.startTime && (
                  <p className="text-sm text-destructive mt-1">{errors.startTime.message}</p>
                )}
              </div>

              {/* Duration */}
              <div>
                <label htmlFor="duration" className="block text-sm font-medium text-foreground mb-2">
                  Duracao (minutos)
                </label>
                <input
                  id="duration"
                  type="number"
                  {...register("duration", { valueAsNumber: true })}
                  placeholder={`Padrao: ${appointmentDuration} minutos`}
                  min={15}
                  max={480}
                  step={5}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se nao informado, usa a duracao padrao do profissional ({appointmentDuration} min)
                </p>
                {errors.duration && (
                  <p className="text-sm text-destructive mt-1">{errors.duration.message}</p>
                )}
              </div>

              {/* Modality */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Modalidade *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input
                      type="radio"
                      value="PRESENCIAL"
                      {...register("modality")}
                      className="sr-only peer"
                    />
                    <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary peer-focus:ring-2 peer-focus:ring-ring transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="text-sm font-medium">Presencial</span>
                    </div>
                  </label>
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input
                      type="radio"
                      value="ONLINE"
                      {...register("modality")}
                      className="sr-only peer"
                    />
                    <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary peer-focus:ring-2 peer-focus:ring-ring transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-medium">Online</span>
                    </div>
                  </label>
                </div>
                {errors.modality && (
                  <p className="text-sm text-destructive mt-1">{errors.modality.message}</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-2">
                  Observacoes
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  {...register("notes")}
                  placeholder="Observacoes sobre a consulta..."
                  className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none"
                />
                {errors.notes && (
                  <p className="text-sm text-destructive mt-1">{errors.notes.message}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 pb-8">
                <button
                  type="submit"
                  disabled={isSavingAppointment || !selectedPatient}
                  className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {isSavingAppointment ? "Salvando..." : "Criar Agendamento"}
                </button>
                <button
                  type="button"
                  onClick={closeCreateSheet}
                  className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Edit Appointment Sheet */}
      {isEditSheetOpen && selectedAppointment && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeEditSheet}
          />

          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto animate-slide-up">
            {/* Handle */}
            <div className="sticky top-0 bg-background pt-3 pb-2 px-4 border-b border-border">
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground">Editar Agendamento</h2>
            </div>

            {/* Patient Info (read-only) */}
            <div className="px-4 py-4 bg-muted/30 border-b border-border">
              <p className="text-sm text-muted-foreground mb-1">Paciente</p>
              <p className="font-medium text-foreground">{selectedAppointment.patient.name}</p>
              <p className="text-sm text-muted-foreground">{formatPhone(selectedAppointment.patient.phone)}</p>
              {selectedAppointment.patient.email && (
                <p className="text-sm text-muted-foreground">{selectedAppointment.patient.email}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2 italic">
                Para alterar o paciente, cancele este agendamento e crie um novo.
              </p>
            </div>

            <form onSubmit={handleSubmitEdit(onSubmitEdit)} className="p-4 space-y-6">
              {/* Date */}
              <div>
                <label htmlFor="editDate" className="block text-sm font-medium text-foreground mb-2">
                  Data *
                </label>
                <input
                  id="editDate"
                  type="date"
                  {...registerEdit("date")}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                {editErrors.date && (
                  <p className="text-sm text-destructive mt-1">{editErrors.date.message}</p>
                )}
              </div>

              {/* Start Time */}
              <div>
                <label htmlFor="editStartTime" className="block text-sm font-medium text-foreground mb-2">
                  Horario *
                </label>
                <input
                  id="editStartTime"
                  type="time"
                  {...registerEdit("startTime")}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                {editErrors.startTime && (
                  <p className="text-sm text-destructive mt-1">{editErrors.startTime.message}</p>
                )}
              </div>

              {/* Duration */}
              <div>
                <label htmlFor="editDuration" className="block text-sm font-medium text-foreground mb-2">
                  Duracao (minutos)
                </label>
                <input
                  id="editDuration"
                  type="number"
                  {...registerEdit("duration", { valueAsNumber: true })}
                  placeholder={`Padrao: ${appointmentDuration} minutos`}
                  min={15}
                  max={480}
                  step={5}
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                {editErrors.duration && (
                  <p className="text-sm text-destructive mt-1">{editErrors.duration.message}</p>
                )}
              </div>

              {/* Modality */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Modalidade *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input
                      type="radio"
                      value="PRESENCIAL"
                      {...registerEdit("modality")}
                      className="sr-only peer"
                    />
                    <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary peer-focus:ring-2 peer-focus:ring-ring transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="text-sm font-medium">Presencial</span>
                    </div>
                  </label>
                  <label className="relative flex items-center justify-center cursor-pointer">
                    <input
                      type="radio"
                      value="ONLINE"
                      {...registerEdit("modality")}
                      className="sr-only peer"
                    />
                    <div className="w-full h-12 flex items-center justify-center gap-2 rounded-md border border-input bg-background text-foreground peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:text-primary peer-focus:ring-2 peer-focus:ring-ring transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-medium">Online</span>
                    </div>
                  </label>
                </div>
                {editErrors.modality && (
                  <p className="text-sm text-destructive mt-1">{editErrors.modality.message}</p>
                )}
              </div>

              {/* Price */}
              <div>
                <label htmlFor="editPrice" className="block text-sm font-medium text-foreground mb-2">
                  Valor (R$)
                </label>
                <input
                  id="editPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  {...registerEdit("price", { valueAsNumber: true })}
                  placeholder="Ex: 150.00"
                  className="w-full h-12 px-4 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                {editErrors.price && (
                  <p className="text-sm text-destructive mt-1">{editErrors.price.message}</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="editNotes" className="block text-sm font-medium text-foreground mb-2">
                  Observacoes
                </label>
                <textarea
                  id="editNotes"
                  rows={3}
                  {...registerEdit("notes")}
                  placeholder="Observacoes sobre a consulta..."
                  className="w-full px-4 py-3 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors resize-none"
                />
                {editErrors.notes && (
                  <p className="text-sm text-destructive mt-1">{editErrors.notes.message}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 pb-8">
                <button
                  type="submit"
                  disabled={isUpdatingAppointment}
                  className="flex-1 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {isUpdatingAppointment ? "Salvando..." : "Salvar Alteracoes"}
                </button>
                <button
                  type="button"
                  onClick={closeEditSheet}
                  className="flex-1 sm:flex-initial sm:w-32 h-12 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-background border-t border-border z-40">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-around h-16">
            <button
              className="flex flex-col items-center justify-center gap-1 text-primary"
              onClick={() => router.push("/agenda")}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs font-medium">Agenda</span>
            </button>

            <button
              className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => router.push("/patients")}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="text-xs">Pacientes</span>
            </button>

            <button
              className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => router.push("/settings/availability")}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-xs">Configuracoes</span>
            </button>
          </div>
        </div>
      </nav>

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
