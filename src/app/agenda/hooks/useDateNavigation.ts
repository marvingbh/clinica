import { useState, useCallback } from "react"

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
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [showDatePicker, setShowDatePicker] = useState(false)

  const goToPreviousDay = useCallback(() => {
    setSelectedDate((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() - 1)
      return newDate
    })
  }, [])

  const goToNextDay = useCallback(() => {
    setSelectedDate((prev) => {
      const newDate = new Date(prev)
      newDate.setDate(newDate.getDate() + 1)
      return newDate
    })
  }, [])

  const goToToday = useCallback(() => {
    setSelectedDate(new Date())
    setShowDatePicker(false)
  }, [])

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
