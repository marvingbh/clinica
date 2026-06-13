"use client"

const LABELS: Record<string, string> = {
  EM_ANDAMENTO: "Aguardando assinatura",
  PENDENTE: "Aguardando assinatura",
  VISUALIZADO: "Visualizado",
  CONCLUIDO: "Assinado",
  ASSINADO: "Assinado",
  RECUSADO: "Recusado",
  EXPIRADO: "Expirado",
  CANCELADO: "Cancelado",
  INVALIDADO: "Invalidado",
}

const STYLES: Record<string, string> = {
  EM_ANDAMENTO: "bg-amber-100 text-amber-800",
  PENDENTE: "bg-amber-100 text-amber-800",
  VISUALIZADO: "bg-blue-100 text-blue-800",
  CONCLUIDO: "bg-green-100 text-green-800",
  ASSINADO: "bg-green-100 text-green-800",
  RECUSADO: "bg-red-100 text-red-800",
  EXPIRADO: "bg-gray-100 text-gray-700",
  CANCELADO: "bg-gray-100 text-gray-700",
  INVALIDADO: "bg-gray-100 text-gray-700",
}

export function SignatureStatusBadge({ status }: { status: string }) {
  const label = LABELS[status] ?? status
  const style = STYLES[status] ?? "bg-gray-100 text-gray-700"
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  )
}
