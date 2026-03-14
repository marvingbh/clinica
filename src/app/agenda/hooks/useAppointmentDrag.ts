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
import { minutesToTime, formatTimeFromMinutes, findVisualOverlaps } from "../lib/grid-geometry"
import { isDraggable, computeNewTimeRange } from "@/lib/appointments/drag-constraints"
import { updateAppointment, moveRecurrenceFuture } from "../services/appointmentService"

// --- State machine ---
const DND_IDLE = "IDLE" as const
const DND_DRAGGING = "DRAGGING" as const
const DND_DIALOG = "DIALOG" as const
const DND_PERSISTING = "PERSISTING" as const
type DndState = typeof DND_IDLE | typeof DND_DRAGGING | typeof DND_DIALOG | typeof DND_PERSISTING

export interface UseAppointmentDragParams {
  appointments: Appointment[]
  gridConfig: Pick<GridConfig, "pixelsPerMinute" | "snapIntervalMinutes">
  canWriteAgenda: boolean
  onAppointmentMoved: (updated: Appointment) => void
  onBulkChange?: () => void
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
  recurrenceMoveRequest: RecurrenceMoveRequest | null
  handleRecurrenceMoveThis: () => Promise<void>
  handleRecurrenceMoveAllFuture: () => Promise<void>
  handleRecurrenceCancel: () => void
  isUpdating: boolean
}

export function useAppointmentDrag({
  appointments,
  gridConfig,
  canWriteAgenda,
  onAppointmentMoved,
  onBulkChange,
}: UseAppointmentDragParams): UseAppointmentDragReturn {
  const [dndState, setDndState] = useState<DndState>(DND_IDLE)
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null)
  const [projectedMinutes, setProjectedMinutes] = useState<number | null>(null)
  const [projectedDate, setProjectedDate] = useState<string | null>(null)
  const [overlappingIds, setOverlappingIds] = useState<string[]>([])
  const [recurrenceMoveRequest, setRecurrenceMoveRequest] = useState<RecurrenceMoveRequest | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // Refs for deduplicating state updates during drag (avoid unnecessary re-renders)
  const originalMinutesRef = useRef(0)
  const dragDurationMsRef = useRef(0)
  const lastConflictCheckRef = useRef(0)
  const projectedMinutesRef = useRef<number | null>(null)
  const overlappingIdsRef = useRef<string[]>([])

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
    originalMinutesRef.current = 0
    dragDurationMsRef.current = 0
    projectedMinutesRef.current = null
    overlappingIdsRef.current = []
    setDndState(DND_IDLE)
    document.body.classList.remove("dnd-dragging")
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (dndState !== DND_IDLE) return

    const appointment = event.active.data.current?.appointment as Appointment | undefined
    if (!appointment || !isDraggable(appointment, canWriteAgenda)) return

    // Cache original time + duration for delta-based calculation
    const start = new Date(appointment.scheduledAt)
    const end = new Date(appointment.endAt)
    originalMinutesRef.current = start.getHours() * 60 + start.getMinutes()
    dragDurationMsRef.current = end.getTime() - start.getTime()

    flushSync(() => {
      setActiveAppointment(appointment)
      setDndState(DND_DRAGGING)
    })
    document.body.classList.add("dnd-dragging")
  }, [dndState, canWriteAgenda])

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (dndState !== DND_DRAGGING || !activeAppointment) return

    // Throttle to ~15fps
    const now = performance.now()
    if (now - lastConflictCheckRef.current < 66) return
    lastConflictCheckRef.current = now

    // Compute new time from original position + pixel delta
    const deltaMinutes = event.delta.y / gridConfig.pixelsPerMinute
    const rawMinutes = originalMinutesRef.current + deltaMinutes
    const snapped = Math.round(rawMinutes / gridConfig.snapIntervalMinutes) * gridConfig.snapIntervalMinutes
    const minutes = Math.max(0, Math.min(snapped, 24 * 60 - 1))

    // Only update state if value changed (skip re-render for same snap zone)
    if (minutes !== projectedMinutesRef.current) {
      projectedMinutesRef.current = minutes
      setProjectedMinutes(minutes)
    }

    // Detect day column from droppable (weekly view)
    const overId = event.over?.id
    if (overId && typeof overId === "string" && overId.startsWith("day-")) {
      setProjectedDate(overId.replace("day-", ""))
    }

    // Check visual overlaps using cached duration (no Date allocations)
    if (activeAppointment.blocksTime) {
      const { hours, minutes: mins } = minutesToTime(minutes)
      const baseDateMs = new Date(activeAppointment.scheduledAt).setHours(hours, mins, 0, 0)
      const proposedEndMs = baseDateMs + dragDurationMsRef.current

      const overlaps = findVisualOverlaps(baseDateMs, proposedEndMs, processedIntervals, activeAppointment.id)

      // Only update if overlaps actually changed
      const prev = overlappingIdsRef.current
      const changed = overlaps.length !== prev.length || overlaps.some((id, i) => id !== prev[i])
      if (changed) {
        overlappingIdsRef.current = overlaps
        setOverlappingIds(overlaps)
      }
    }
  }, [dndState, activeAppointment, gridConfig, processedIntervals])

  const performMove = useCallback(async (
    appointmentId: string,
    newTime: { scheduledAt: string; endAt: string }
  ) => {
    setIsUpdating(true)
    setDndState(DND_PERSISTING)

    const result = await updateAppointment(appointmentId, {
      scheduledAt: newTime.scheduledAt,
      endAt: newTime.endAt,
    })

    setIsUpdating(false)

    if (result.error) {
      toast.error(result.error)
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
      setRecurrenceMoveRequest({ appointment: activeAppointment, newTime, newDayDate: projectedDate ?? undefined })
      return
    }

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
    setDndState(DND_PERSISTING)
    setRecurrenceMoveRequest(null)

    const newStart = new Date(newTime.scheduledAt)
    const newEnd = new Date(newTime.endAt)
    const startTimeStr = formatTimeFromMinutes(newStart.getHours() * 60 + newStart.getMinutes())
    const endTimeStr = formatTimeFromMinutes(newEnd.getHours() * 60 + newEnd.getMinutes())

    const result = await moveRecurrenceFuture(appointment.recurrence!.id, {
      startTime: startTimeStr,
      endTime: endTimeStr,
      dayOfWeek: newDayDate ? new Date(newDayDate + "T12:00:00").getDay() : undefined,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      const count = result.updatedAppointmentsCount || 0
      toast.success(`Recorrência e ${count} agendamento(s) atualizados para ${startTimeStr}`)
      onBulkChange?.()
    }

    setIsUpdating(false)
    resetDragState()
  }, [recurrenceMoveRequest, onBulkChange, resetDragState])

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
  }
}
