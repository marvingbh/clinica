"use client"

type Status = "PENDENTE" | "EXPORTADO" | "EMITIDO" | "ERRO" | "CANCELADO"

const LABELS: Record<Status, string> = {
  PENDENTE: "Pendente",
  EXPORTADO: "Exportado",
  EMITIDO: "Emitido",
  ERRO: "Erro",
  CANCELADO: "Cancelado",
}

const CLASSES: Record<Status, string> = {
  PENDENTE: "bg-muted text-muted-foreground",
  EXPORTADO: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  EMITIDO: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  ERRO: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  CANCELADO: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
}

export function ReciboStatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASSES[status]}`}
    >
      {LABELS[status]}
    </span>
  )
}
