type Status = "RASCUNHO" | "ASSINADA"

const LABELS: Record<Status, string> = { RASCUNHO: "Rascunho", ASSINADA: "Assinada" }
const CLASSES: Record<Status, string> = {
  RASCUNHO: "bg-gray-100 text-gray-700",
  ASSINADA: "bg-green-100 text-green-800",
}

/** Small status chip reused in the timeline and the editor header. */
export function NoteStatusChip({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES[status]}`}>
      {LABELS[status]}
    </span>
  )
}
