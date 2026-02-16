import { useState } from "react"
import { useAgendaContext } from "../context/AgendaContext"

export interface UseDateNavigationReturn {
  selectedDate: Date
  setSelectedDate: (date: Date) => void
  showDatePicker: boolean
  setShowDatePicker: (show: boolean) => void
  goToPreviousDay: () => void
  goToNextDay: () => void
  goToToday: () => void
}

export function useDateNavigation(): UseDateNavigationReturn {
  const {
    selectedDate,
    setSelectedDate,
    goToPreviousDay,
    goToNextDay,
    goToToday: contextGoToToday,
  } = useAgendaContext()
  const [showDatePicker, setShowDatePicker] = useState(false)

  const goToToday = () => {
    contextGoToToday()
    setShowDatePicker(false)
  }

  return {
    selectedDate,
    setSelectedDate,
    showDatePicker,
    setShowDatePicker,
    goToPreviousDay,
    goToNextDay,
    goToToday,
  }
}
