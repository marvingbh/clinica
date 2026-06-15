"use client"

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { FIELD_TYPE_LABELS, type FormField } from "@/lib/forms"
import { FieldEditor } from "./FieldEditor"

interface FieldListProps {
  fields: FormField[]
  selectedId: string | null
  onReorder: (fields: FormField[]) => void
  onSelect: (id: string) => void
  onChangeField: (id: string, patch: Partial<FormField>) => void
  onRemoveField: (id: string) => void
}

function SortableRow({
  field,
  index,
  fields,
  selected,
  onSelect,
  onChangeField,
  onRemoveField,
}: {
  field: FormField
  index: number
  fields: FormField[]
  selected: boolean
  onSelect: (id: string) => void
  onChangeField: (id: string, patch: Partial<FormField>) => void
  onRemoveField: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-ink-100 bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <button {...attributes} {...listeners} className="cursor-grab text-ink-400" aria-label="Reordenar">
          <GripVertical className="w-4 h-4" />
        </button>
        <button onClick={() => onSelect(field.id)} className="flex-1 text-left">
          <span className="text-[14px] text-ink-900">{field.label || "(sem título)"}</span>
          <span className="ml-2 text-[11px] text-ink-400">{FIELD_TYPE_LABELS[field.type]}</span>
        </button>
      </div>
      {selected && (
        <div className="border-t border-ink-100 px-3 py-3">
          <FieldEditor
            field={field}
            priorFields={fields.slice(0, index)}
            onChange={(patch) => onChangeField(field.id, patch)}
            onRemove={() => onRemoveField(field.id)}
          />
        </div>
      )}
    </div>
  )
}

/** Drag-to-order list of fields; clicking a row expands its editor. */
export function FieldList({ fields, selectedId, onReorder, onSelect, onChangeField, onRemoveField }: FieldListProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fields.findIndex((f) => f.id === active.id)
    const newIndex = fields.findIndex((f) => f.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(fields, oldIndex, newIndex))
  }

  if (fields.length === 0) {
    return <p className="text-[13px] text-ink-400 py-6 text-center">Nenhum campo. Use o botão &ldquo;Adicionar campo&rdquo;.</p>
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <SortableRow
              key={field.id}
              field={field}
              index={index}
              fields={fields}
              selected={selectedId === field.id}
              onSelect={onSelect}
              onChangeField={onChangeField}
              onRemoveField={onRemoveField}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
