export const STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente",
  ENVIADO: "Enviado",
  PARCIAL: "Parcial",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
}

export const STATUS_COLORS: Record<string, string> = {
  PENDENTE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  ENVIADO: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PARCIAL: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  PAGO: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CANCELADO: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
}
