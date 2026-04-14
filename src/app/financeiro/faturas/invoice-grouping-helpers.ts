import { deriveGroupStatus } from "@/lib/financeiro/invoice-grouping"

export interface Invoice {
  id: string
  referenceMonth: number
  referenceYear: number
  invoiceType: string
  status: string
  totalSessions: number
  totalAmount: string
  dueDate: string
  paidAt: string | null
  notaFiscalEmitida: boolean
  paidViaBank: boolean
  bankPayerName: string | null
  // NFS-e fields
  nfseStatus?: string | null
  nfseNumero?: string | null
  nfseErro?: string | null
  patient: { id: string; name: string; motherName: string | null; fatherName: string | null; email: string | null }
  professionalProfile: { id: string; user: { name: string } }
  _count: { items: number }
}

export interface InvoiceGroup {
  key: string
  patientName: string
  patientId: string
  referenceMonth: number
  referenceYear: number
  sessionCount: number
  totalAmount: number
  derivedStatus: string
  invoices: Invoice[]
}

export type InvoiceRow =
  | { type: "individual"; invoice: Invoice }
  | { type: "group"; group: InvoiceGroup }

/**
 * Separate invoices into individual rows (MONTHLY/MANUAL) and
 * collapsible groups (PER_SESSION grouped by patient+month+year).
 */
export function buildInvoiceRows(invoices: Invoice[]): InvoiceRow[] {
  const individuals: Invoice[] = []
  const perSessionMap = new Map<string, Invoice[]>()

  for (const inv of invoices) {
    if (inv.invoiceType === "PER_SESSION") {
      const key = `${inv.patient.id}-${inv.professionalProfile.id}-${inv.referenceMonth}-${inv.referenceYear}`
      const list = perSessionMap.get(key) || []
      list.push(inv)
      perSessionMap.set(key, list)
    } else {
      individuals.push(inv)
    }
  }

  const rows: InvoiceRow[] = []

  // Build groups from PER_SESSION invoices
  const groups: InvoiceGroup[] = []
  for (const [key, groupInvoices] of perSessionMap) {
    const first = groupInvoices[0]
    const statuses = groupInvoices.map(i => i.status) as Parameters<typeof deriveGroupStatus>[0]
    const sorted = [...groupInvoices].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    )
    groups.push({
      key,
      patientName: first.patient.name,
      patientId: first.patient.id,
      referenceMonth: first.referenceMonth,
      referenceYear: first.referenceYear,
      sessionCount: groupInvoices.length,
      totalAmount: groupInvoices.reduce((sum, i) => sum + Number(i.totalAmount), 0),
      derivedStatus: deriveGroupStatus(statuses),
      invoices: sorted,
    })
  }

  // Interleave: maintain original order based on first invoice position
  let indIdx = 0
  let grpIdx = 0

  // Sort groups by first invoice appearance in original array
  const invoiceOrder = new Map(invoices.map((inv, idx) => [inv.id, idx]))
  groups.sort((a, b) => {
    const aIdx = invoiceOrder.get(a.invoices[0].id) ?? 0
    const bIdx = invoiceOrder.get(b.invoices[0].id) ?? 0
    return aIdx - bIdx
  })

  // Merge by comparing positions in original array
  const indPositions = individuals.map(inv => invoiceOrder.get(inv.id) ?? 0)
  const grpPositions = groups.map(g => invoiceOrder.get(g.invoices[0].id) ?? 0)

  while (indIdx < individuals.length || grpIdx < groups.length) {
    const indPos = indIdx < individuals.length ? indPositions[indIdx] : Infinity
    const grpPos = grpIdx < groups.length ? grpPositions[grpIdx] : Infinity

    if (indPos <= grpPos) {
      rows.push({ type: "individual", invoice: individuals[indIdx] })
      indIdx++
    } else {
      rows.push({ type: "group", group: groups[grpIdx] })
      grpIdx++
    }
  }

  return rows
}

/**
 * Filter rows by status. For groups, filter by derived status.
 * For individuals, filter by invoice status.
 */
export function filterRowsByStatus(rows: InvoiceRow[], status: string): InvoiceRow[] {
  if (!status) return rows
  if (status === "SEM_NFSE") {
    return rows.filter(row => {
      if (row.type === "individual") return !row.invoice.nfseStatus
      return row.group.invoices.some(i => !i.nfseStatus)
    })
  }
  if (status === "COM_NFSE") {
    return rows.filter(row => {
      if (row.type === "individual") return row.invoice.nfseStatus === "EMITIDA" || row.invoice.nfseStatus === "EMITIDA_EXTERNA"
      return row.group.invoices.some(i => i.nfseStatus === "EMITIDA" || i.nfseStatus === "EMITIDA_EXTERNA")
    })
  }
  return rows.filter(row => {
    if (row.type === "individual") return row.invoice.status === status
    return row.group.derivedStatus === status
  })
}

/**
 * Count all invoices across rows (including expanded group children).
 */
export function countAllInvoices(rows: InvoiceRow[]): number {
  return rows.reduce((sum, row) => {
    if (row.type === "individual") return sum + 1
    return sum + row.group.invoices.length
  }, 0)
}

/**
 * Sum total sessions across all rows.
 */
export function sumTotalSessions(rows: InvoiceRow[]): number {
  return rows.reduce((sum, row) => {
    if (row.type === "individual") return sum + row.invoice.totalSessions
    return sum + row.group.sessionCount
  }, 0)
}

/**
 * Sum total amount across all rows.
 */
export function sumTotalAmount(rows: InvoiceRow[]): number {
  return rows.reduce((sum, row) => {
    if (row.type === "individual") return sum + Number(row.invoice.totalAmount)
    return sum + row.group.totalAmount
  }, 0)
}

/**
 * Collect all individual invoices from rows (including group children) for status counting.
 */
export function collectAllInvoices(rows: InvoiceRow[]): Invoice[] {
  const all: Invoice[] = []
  for (const row of rows) {
    if (row.type === "individual") {
      all.push(row.invoice)
    } else {
      all.push(...row.group.invoices)
    }
  }
  return all
}
