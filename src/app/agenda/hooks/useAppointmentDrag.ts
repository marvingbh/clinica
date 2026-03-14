"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import { flushSync } from "react-dom"
import {
  MouseSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { toast } from "sonner"
import type { Appointment } from "../lib/types"
import type { GridConfig } from "../lib/grid-config"
import { pixelToMinutes, minutesToTime, formatTimeFromMinutes, findVisualOverlaps } from "../lib/grid-geometry"
import { isDraggable, computeNewTimeRange } from "@/lib/appointments/drag-constraints"
import { updateAppointment } from "../services/appointmentService"

// --- State machine ---
const DND_IDLE = "IDLE" as const
const DND_DRAGGING = "DRAGGING" as const
const DND_DIALOG = "DIALOG" as const
const DND_PERSISTING = "PERSISTING" as const
type DndState = typeof DND_IDLE | typeof DND_DRAGGING | typeof DND_DIALOG | typeof DND_PERSISTING

export interface UseAppointmentDragParams {
  appointments: Appointment[]
  gridConfig: GridConfig
  gridRef: React.RefObject<HTMLElement | null>
  canWriteAgenda: boolean
  onAppointmentMoved: (updated: Appointment) => void
  /** Called to suppress/resume data refetches during drag */
  setDragActive?: (active: boolean) => void
}

export interface RecurrenceMoveRequest {
  appointment: Appointment
  newTime: { scheduledAt: string; endAt: string }
  newDayDate?: string
}

export interface UseAppointmentDragReturn {
  sensors: ReturnType<typeof useSensors>
  dndState: DndState
  activeAppointment: Appointment | null
  projectedMinutes: number | null
  projectedDate: string | null
  overlappingIds: string[]
  handleDragStart: (event: DragStartEvent) => void
  handleDragMove: (event: DragMoveEvent) => void
  handleDragEnd: (event: DragEndEvent) => void
  handleDragCancel: () => void
  isDragging: boolean
  // Recurrence dialog
  recurrenceMoveRequest: RecurrenceMoveRequest | null
  handleRecurrenceMoveThis: () => Promise<void>
  handleRecurrenceMoveAllFuture: () => Promise<void>
  handleRecurrenceCancel: () => void
  isUpdating: boolean
  apiError: string | null
}

export function useAppointmentDrag({
  appointments,
  gridConfig,
  gridRef,
  canWriteAgenda,
  onAppointmentMoved,
  setDragActive,
}: UseAppointmentDragParams): UseAppointmentDragReturn {
  const [dndState, setDndState] = useState<DndState>(DND_IDLE)
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null)
  const [projectedMinutes, setProjectedMinutes] = useState<number | null>(null)
  const [projectedDate, setProjectedDate] = useState<string | null>(null)
  const [overlappingIds, setOverlappingIds] = useState<string[]>([])
  const [recurrenceMoveRequest, setRecurrenceMoveRequest] = useState<RecurrenceMoveRequest | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const gridRectRef = useRef<DOMRect | null>(null)
  const lastConflictCheckRef = useRef(0)

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  // Pre-process intervals for overlap detection (no Date allocations during drag)
  const processedIntervals = useMemo(() => {
    return appointments
      .filter(apt => apt.blocksTime && !apt.groupId)
      .map(apt => ({
        id: apt.id,
        startMs: new Date(apt.scheduledAt).getTime(),
        endMs: new Date(apt.endAt).getTime(),
      }))
  }, [appointments])

  const resetDragState = useCallback(() => {
    setActiveAppointment(null)
    setProjectedMinutes(null)
    setProjectedDate(null)
    setOverlappingIds([])
    gridRectRef.current = null
    setDndState(DND_IDLE)
    setDragActive?.(false)
    document.body.classList.remove("dnd-dragging")
  }, [setDragActive])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (dndState !== DND_IDLE) return

    const appointment = event.active.data.current?.appointment as Appointment | undefined
    if (!appointment || !isDraggable(appointment, canWriteAgenda)) return

    // Cache grid body rect for the entire drag operation.
    // Use a day column (data-date) as reference since it shares the same
    // coordinate system as appointment blocks. Falls back to the wrapper.
    const dayColumn = gridRef.current?.querySelector("[data-date]") as HTMLElement | null
    gridRectRef.current = dayColumn
      ? dayColumn.getBoundingClientRect()
      : gridRef.current?.getBoundingClientRect() ?? null

    // Use flushSync to avoid 1-frame ghost delay
    flushSync(() => {
      setActiveAppointment(appointment)
      setDndState(DND_DRAGGING)
    })
    setDragActive?.(true)
    document.body.classList.add("dnd-dragging")
  }, [dndState, canWriteAgenda, gridRef, setDragActive])

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (dndState !== DND_DRAGGING || !activeAppointment || !gridRectRef.current) return

    // Throttle to ~15fps
    const now = performance.now()
    if (now - lastConflictCheckRef.current < 66) return
    lastConflictCheckRef.current = now

    const gridRect = gridRectRef.current
    const pointerY = (event.activatorEvent as MouseEvent).clientY + event.delta.y - gridRect.top
    const minutes = pixelToMinutes(pointerY, gridConfig)
    setProjectedMinutes(minutes)

    // Detect day column from droppable (weekly view)
    const overId = event.over?.id
    if (overId && typeof overId === "string" && overId.startsWith("day-")) {
      setProjectedDate(overId.replace("day-", ""))
    }

    // Check visual overlaps (presentation hint)
    if (activeAppointment.blocksTime) {
      const { hours, minutes: mins } = minutesToTime(minutes)
      const originalStart = new Date(activeAppointment.scheduledAt)
      const originalEnd = new Date(activeAppointment.endAt)
      const durationMs = originalEnd.getTime() - originalStart.getTime()

      const proposedStart = new Date(originalStart)
      proposedStart.setHours(hours, mins, 0, 0)
      const proposedEnd = proposedStart.getTime() + durationMs

      const overlaps = findVisualOverlaps(
        proposedStart.getTime(),
        proposedEnd,
        processedIntervals,
        activeAppointment.id
      )
      setOverlappingIds(overlaps)
    }
  }, [dndState, activeAppointment, gridConfig, processedIntervals])

  const performMove = useCallback(async (
    appointmentId: string,
    newTime: { scheduledAt: string; endAt: string }
  ) => {
    setIsUpdating(true)
    setApiError(null)
    setDndState(DND_PERSISTING)

    const result = await updateAppointment(appointmentId, {
      scheduledAt: newTime.scheduledAt,
      endAt: newTime.endAt,
    })

    setIsUpdating(false)

    if (result.error) {
      toast.error(result.error)
      setApiError(result.error)
      resetDragState()
      return
    }

    if (result.appointment) {
      onAppointmentMoved(result.appointment)
      const start = new Date(newTime.scheduledAt)
      const timeStr = formatTimeFromMinutes(start.getHours() * 60 + start.getMinutes())
      toast.success(`Agendamento movido para ${timeStr}`)
    }

    resetDragState()
  }, [onAppointmentMoved, resetDragState])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (dndState !== DND_DRAGGING || !activeAppointment || projectedMinutes === null) {
      resetDragState()
      return
    }

    const { hours, minutes } = minutesToTime(projectedMinutes)
    const newTime = computeNewTimeRange(
      { scheduledAt: activeAppointment.scheduledAt, endAt: activeAppointment.endAt },
      { hours, minutes, date: projectedDate ?? undefined }
    )

    // Check if actually moved
    if (newTime.scheduledAt === activeAppointment.scheduledAt && newTime.endAt === activeAppointment.endAt) {
      resetDragState()
      return
    }

    // Recurring appointment → open dialog
    if (activeAppointment.recurrence) {
      setDndState(DND_DIALOG)
      setRecurrenceMoveRequest({
        appointment: activeAppointment,
        newTime,
        newDayDate: projectedDate ?? undefined,
      })
      return
    }

    // Non-recurring → move directly
    performMove(activeAppointment.id, newTime)
  }, [dndState, activeAppointment, projectedMinutes, projectedDate, performMove, resetDragState])

  const handleDragCancel = useCallback(() => {
    resetDragState()
  }, [resetDragState])

  // --- Recurrence dialog handlers ---
  const handleRecurrenceMoveThis = useCallback(async () => {
    if (!recurrenceMoveRequest) return
    const { appointment, newTime } = recurrenceMoveRequest
    setRecurrenceMoveRequest(null)
    await performMove(appointment.id, newTime)
  }, [recurrenceMoveRequest, performMove])

  const handleRecurrenceMoveAllFuture = useCallback(async () => {
    if (!recurrenceMoveRequest) return
    const { appointment, newTime, newDayDate } = recurrenceMoveRequest

    setIsUpdating(true)
    setApiError(null)
    setDndState(DND_PERSISTING)
    setRecurrenceMoveRequest(null)

    const newStart = new Date(newTime.scheduledAt)
    const newEnd = new Date(newTime.endAt)
    const startTimeStr = `${newStart.getHours().toString().padStart(2, "0")}:${newStart.getMinutes().toString().padStart(2, "0")}`
    const endTimeStr = `${newEnd.getHours().toString().padStart(2, "0")}:${newEnd.getMinutes().toString().padStart(2, "0")}`

    const body: Record<string, unknown> = {
      startTime: startTimeStr,
      endTime: endTimeStr,
    }

    // If day changed (weekly cross-day drag), update dayOfWeek
    if (newDayDate) {
      const newDay = new Date(newDayDate + "T12:00:00")
      body.dayOfWeek = newDay.getDay()
    }

    try {
      const response = await fetch(`/api/appointments/recurrences/${appointment.recurrence!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        toast.error(result.error || "Erro ao atualizar recorrência")
        setApiError(result.error || "Erro ao atualizar recorrência")
      } else {
        toast.success(`Recorrência atualizada para ${startTimeStr}`)
        // Trigger a full refetch since bulk appointments changed
        onAppointmentMoved(appointment)
      }
    } catch {
      toast.error("Erro de conexão ao atualizar recorrência")
    }

    setIsUpdating(false)
    resetDragState()
  }, [recurrenceMoveRequest, onAppointmentMoved, resetDragState])

  const handleRecurrenceCancel = useCallback(() => {
    setRecurrenceMoveRequest(null)
    resetDragState()
  }, [resetDragState])

  return {
    sensors,
    dndState,
    activeAppointment,
    projectedMinutes,
    projectedDate,
    overlappingIds,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
    isDragging: dndState === DND_DRAGGING,
    recurrenceMoveRequest,
    handleRecurrenceMoveThis,
    handleRecurrenceMoveAllFuture,
    handleRecurrenceCancel,
    isUpdating,
    apiError,
  }
}
