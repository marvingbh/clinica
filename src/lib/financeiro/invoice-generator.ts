export interface AppointmentForInvoice {
  id: string
  scheduledAt: Date
  status: string
  type: string
  recurrenceId: string | null
  groupId: string | null
  price: number | null
}

export interface CreditForInvoice {
  id: string
  reason: string
  createdAt: Date
}

export interface ClassifiedAppointments {
  regular: AppointmentForInvoice[]
  extra: AppointmentForInvoice[]
  group: AppointmentForInvoice[]
  schoolMeeting: AppointmentForInvoice[]
}

export interface InvoiceItemData {
  appointmentId: string | null
  type: "SESSAO_REGULAR" | "SESSAO_EXTRA" | "SESSAO_GRUPO" | "REUNIAO_ESCOLA" | "CREDITO"
  description: string
  quantity: number
  unitPrice: number
  total: number
  creditId?: string
}

export interface InvoiceTotals {
  totalSessions: number
  creditsApplied: number
  extrasAdded: number
  totalAmount: number
}

const BILLABLE_STATUSES = ["AGENDADO", "CONFIRMADO", "FINALIZADO"]

export function classifyAppointments(appointments: AppointmentForInvoice[]): ClassifiedAppointments {
  const billable = appointments.filter(a => BILLABLE_STATUSES.includes(a.status))
  const regular: AppointmentForInvoice[] = []
  const extra: AppointmentForInvoice[] = []
  const group: AppointmentForInvoice[] = []
  const schoolMeeting: AppointmentForInvoice[] = []

  for (const apt of billable) {
    if (apt.groupId) group.push(apt)
    else if (apt.type === "REUNIAO") schoolMeeting.push(apt)
    else if (apt.recurrenceId) regular.push(apt)
    else extra.push(apt)
  }

  return { regular, extra, group, schoolMeeting }
}

function formatDateBR(date: Date): string {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}/${month}`
}

function getItemDescription(type: InvoiceItemData["type"], apt: AppointmentForInvoice, showDays: boolean): string {
  const dateStr = showDays ? ` - ${formatDateBR(apt.scheduledAt)}` : ""
  switch (type) {
    case "SESSAO_REGULAR": return `Sessão${dateStr}`
    case "SESSAO_EXTRA": return `Sessão extra${dateStr}`
    case "SESSAO_GRUPO": return `Sessão grupo${dateStr}`
    case "REUNIAO_ESCOLA": return `Reunião escola${dateStr}`
    default: return `Item${dateStr}`
  }
}

export function buildInvoiceItems(
  classified: ClassifiedAppointments,
  sessionFee: number,
  credits: CreditForInvoice[],
  showDays: boolean
): InvoiceItemData[] {
  const items: InvoiceItemData[] = []

  const addItems = (apts: AppointmentForInvoice[], type: InvoiceItemData["type"]) => {
    for (const apt of apts) {
      const price = apt.price ?? sessionFee
      items.push({
        appointmentId: apt.id,
        type,
        description: getItemDescription(type, apt, showDays),
        quantity: 1,
        unitPrice: price,
        total: price,
      })
    }
  }

  addItems(classified.regular, "SESSAO_REGULAR")
  addItems(classified.extra, "SESSAO_EXTRA")
  addItems(classified.group, "SESSAO_GRUPO")
  addItems(classified.schoolMeeting, "REUNIAO_ESCOLA")

  for (const credit of credits) {
    items.push({
      appointmentId: null,
      type: "CREDITO",
      description: `Crédito: ${credit.reason}`,
      quantity: -1,
      unitPrice: sessionFee,
      total: -sessionFee,
      creditId: credit.id,
    })
  }

  return items
}

export function calculateInvoiceTotals(items: Pick<InvoiceItemData, "type" | "total" | "quantity">[]): InvoiceTotals {
  let totalSessions = 0
  let creditsApplied = 0
  let extrasAdded = 0
  let totalAmount = 0

  for (const item of items) {
    totalAmount += item.total
    if (item.type === "CREDITO") {
      creditsApplied += Math.abs(item.quantity)
    } else {
      totalSessions += item.quantity
      if (item.type === "SESSAO_EXTRA") extrasAdded += item.quantity
    }
  }

  return { totalSessions, creditsApplied, extrasAdded, totalAmount }
}
