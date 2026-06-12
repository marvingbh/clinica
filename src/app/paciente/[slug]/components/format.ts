export interface PortalAppointmentView {
  id: string
  scheduledAt: string
  endAt: string
  status: string
  modality: string | null
  professionalName: string
}

export interface PortalInvoiceView {
  id: string
  referenceMonth: number
  referenceYear: number
  totalAmount: number
  dueDate: string
  status: string
  hasNfse: boolean
  paidAt: string | null
}

const STATUS_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  FINALIZADO: "Finalizado",
  CANCELADO_ACORDADO: "Cancelado",
  CANCELADO_FALTA: "Falta",
  CANCELADO_PROFISSIONAL: "Cancelado",
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDENTE: "Pendente",
  ENVIADO: "Enviada",
  PARCIAL: "Parcial",
  PAGO: "Paga",
  CANCELADO: "Cancelada",
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status] ?? status
}

export function modalityLabel(modality: string | null): string {
  if (modality === "ONLINE") return "Online"
  if (modality === "PRESENCIAL") return "Presencial"
  return "—"
}

export function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString("pt-BR"),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR")
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(/ /g, " ")
}
