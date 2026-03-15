"use client"

import type { ReactNode } from "react"
import { DndContext, DragOverlay, closestCenter } from "@dnd-kit/core"
import { snapCenterToCursor } from "@dnd-kit/modifiers"
import { DragGhostCard } from "./DragGhostCard"
import { RecurrenceMoveDialog } from "./RecurrenceMoveDialog"
import type { UseAppointmentDragReturn } from "../hooks/useAppointmentDrag"

interface AgendaDndWrapperProps {
  drag: UseAppointmentDragReturn
  children: ReactNode
  autoScrollThreshold?: { x: number; y: number }
}

export function AgendaDndWrapper({ drag, children, autoScrollThreshold }: AgendaDndWrapperProps) {
  return (
    <>
      <DndContext
        sensors={drag.sensors}
        collisionDetection={closestCenter}
        onDragStart={drag.handleDragStart}
        onDragMove={drag.handleDragMove}
        onDragEnd={drag.handleDragEnd}
        onDragCancel={drag.handleDragCancel}
        autoScroll={autoScrollThreshold ? { threshold: autoScrollThreshold } : undefined}
      >
        {children}

        <DragOverlay
          modifiers={[snapCenterToCursor]}
          dropAnimation={{ duration: 200, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }}
          zIndex={50}
        >
          {drag.activeAppointment ? (
            <DragGhostCard appointment={drag.activeAppointment} projectedMinutes={drag.projectedMinutes} />
          ) : null}
        </DragOverlay>
      </DndContext>

      <RecurrenceMoveDialog
        request={drag.recurrenceMoveRequest}
        onMoveThis={drag.handleRecurrenceMoveThis}
        onMoveAllFuture={drag.handleRecurrenceMoveAllFuture}
        onCancel={drag.handleRecurrenceCancel}
        isSubmitting={drag.isUpdating}
      />
    </>
  )
}
