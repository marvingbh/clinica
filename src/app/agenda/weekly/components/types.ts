import type { Professional, Patient, AppointmentFormData, RecurrenceEndType } from "../../lib/types"
import type { AppointmentType } from "../../components/RecurrenceOptions"
import type { CalendarEntryType } from "../../lib/types"
import type { UseFormRegister, UseFormWatch, FieldErrors } from "react-hook-form"

export interface WeeklyHeaderProps {
  weekStart: Date
  professionals: Professional[]
  selectedProfessionalId: string
  isAdmin: boolean
  onPreviousWeek: () => void
  onNextWeek: () => void
  onToday: () => void
  onSelectProfessional: (id: string) => void
}

export interface FabMenuProps {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onSelect: (type: CalendarEntryType | "CONSULTA") => void
}

export interface CreateAppointmentFormProps {
  isOpen: boolean
  onClose: () => void
  register: UseFormRegister<AppointmentFormData>
  watch: UseFormWatch<AppointmentFormData>
  errors: FieldErrors<AppointmentFormData>
  onSubmit: (e: React.FormEvent) => void
  // Patient search
  patientSearch: string
  onPatientSearchChange: (value: string) => void
  selectedPatient: Patient | null
  onSelectPatient: (patient: Patient) => void
  onClearPatient: () => void
  // Recurrence
  appointmentType: AppointmentType
  onAppointmentTypeChange: (type: AppointmentType) => void
  recurrenceEndType: RecurrenceEndType
  onRecurrenceEndTypeChange: (type: RecurrenceEndType) => void
  recurrenceOccurrences: number
  onRecurrenceOccurrencesChange: (n: number) => void
  recurrenceEndDate: string
  onRecurrenceEndDateChange: (date: string) => void
  watchedDate: string
  watchedStartTime: string
  // Professional
  isAdmin: boolean
  professionals: Professional[]
  selectedProfessionalId: string
  createProfessionalId: string
  onCreateProfessionalIdChange: (id: string) => void
  // Additional professionals
  createAdditionalProfIds: string[]
  onCreateAdditionalProfIdsChange: (ids: string[]) => void
  // Duration
  appointmentDuration: number
  // Saving
  isSaving: boolean
  // API error
  apiError: string | null
  onDismissError: () => void
}
