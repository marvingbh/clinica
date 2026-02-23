import { useAgendaContext } from "../context/AgendaContext"

export interface UseDateNavigationReturn {
  selectedDate: Date
  setSelectedDate: (date: Date) => void
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
    goToToday,
  } = useAgendaContext()

  return {
    selectedDate,
    setSelectedDate,
    goToPreviousDay,
    goToNextDay,
    goToToday,
  }
}
