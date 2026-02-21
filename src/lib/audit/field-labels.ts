/**
 * Audit field label mapping and value formatters.
 *
 * Maps database field names to Portuguese labels, formats raw values
 * for human-readable display, and computes diffs between old/new
 * audit log snapshots.
 */

// ---------------------------------------------------------------------------
// 1. Field Labels
// ---------------------------------------------------------------------------

export const FIELD_LABELS: Record<string, string> = {
  // Patient fields
  name: "Nome",
  phone: "Telefone",
  email: "Email",
  birthDate: "Data de Nascimento",
  parentName: "Nome do Responsavel",
  parentName2: "Nome do Responsavel 2",
  schoolName: "Escola",
  sessionFee: "Valor da Sessao",
  feeAdjustmentReason: "Motivo do Ajuste",
  therapeuticProject: "Projeto Terapeutico",
  consentWhatsApp: "Consentimento WhatsApp",
  consentEmail: "Consentimento Email",
  isActive: "Ativo",
  referenceProfessionalId: "Profissional Referencia",

  // Appointment fields
  status: "Status",
  scheduledAt: "Data/Hora",
  endAt: "Hora Final",
  modality: "Modalidade",
  notes: "Observacoes",
  price: "Valor",
  cancellationReason: "Motivo do Cancelamento",
  title: "Titulo",
  type: "Tipo",
  confirmedAt: "Confirmado em",
  cancelledAt: "Cancelado em",

  // Recurrence fields
  recurrenceType: "Tipo de Recorrencia",
  recurrenceEndType: "Tipo de Fim",
  dayOfWeek: "Dia da Semana",
  startTime: "Hora Inicio",
  endTime: "Hora Fim",
  endDate: "Data Final",
  occurrences: "Ocorrencias",
}

// ---------------------------------------------------------------------------
// 2. Value Formatting
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  AGENDADO: "Agendado",
  CONFIRMADO: "Confirmado",
  FINALIZADO: "Finalizado",
  CANCELADO_ACORDADO: "Cancelado (Acordado)",
  CANCELADO_FALTA: "Cancelado (Falta)",
  CANCELADO_PROFISSIONAL: "Cancelado (Profissional)",
}

const MODALITY_LABELS: Record<string, string> = {
  ONLINE: "Online",
  PRESENCIAL: "Presencial",
}

const TYPE_LABELS: Record<string, string> = {
  CONSULTA: "Consulta",
  TAREFA: "Tarefa",
  LEMBRETE: "Lembrete",
  NOTA: "Nota",
  REUNIAO: "Reuniao",
}

const RECURRENCE_TYPE_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
}

const DAY_OF_WEEK_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terca-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sabado",
}

/** Fields that should be formatted as date-only (DD/MM/YYYY) */
const DATE_FIELDS = new Set(["birthDate", "endDate"])

/** Fields that should be formatted as date-time (DD/MM/YYYY HH:mm) */
const DATETIME_FIELDS = new Set(["scheduledAt", "endAt", "confirmedAt", "cancelledAt"])

/** Fields that should be formatted as currency (R$ X,XX) */
const CURRENCY_FIELDS = new Set(["price", "sessionFee"])

function formatDate(value: unknown): string {
  const d = new Date(String(value))
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
}

function formatDateTime(value: unknown): string {
  const d = new Date(String(value))
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
}

function formatCurrency(value: unknown): string {
  const num = Number(value)
  if (isNaN(num)) return String(value)
  return `R$ ${num.toFixed(2).replace(".", ",")}`
}

/**
 * Format a raw database value into a human-readable Portuguese string.
 */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "\u2014"

  if (typeof value === "boolean") return value ? "Sim" : "Nao"

  // Enum lookups by field name
  if (field === "status") {
    const label = STATUS_LABELS[String(value)]
    if (label) return label
  }

  if (field === "modality") {
    const label = MODALITY_LABELS[String(value)]
    if (label) return label
  }

  if (field === "type") {
    const label = TYPE_LABELS[String(value)]
    if (label) return label
  }

  if (field === "recurrenceType") {
    const label = RECURRENCE_TYPE_LABELS[String(value)]
    if (label) return label
  }

  if (field === "dayOfWeek") {
    const label = DAY_OF_WEEK_LABELS[Number(value)]
    if (label) return label
  }

  if (DATE_FIELDS.has(field)) return formatDate(value)
  if (DATETIME_FIELDS.has(field)) return formatDateTime(value)
  if (CURRENCY_FIELDS.has(field)) return formatCurrency(value)

  return String(value)
}

// ---------------------------------------------------------------------------
// 3. Diff / Change Computation
// ---------------------------------------------------------------------------

/** Fields excluded from change tracking (internal / metadata fields) */
const EXCLUDED_FIELDS = new Set([
  "id",
  "clinicId",
  "createdAt",
  "updatedAt",
  "userId",
  "professionalProfileId",
  "patientId",
  "recurrenceId",
  "groupId",
  "confirmToken",
  "cancelToken",
  "tokenExpiresAt",
  "appointmentCount",
  "cancelledAppointmentIds",
  "applyTo",
  "updatedAppointmentsCount",
  "deletedAppointmentsCount",
  "attemptedAction",
  "reason",
  "ipAddress",
  "userAgent",
])

export interface FieldChange {
  field: string
  label: string
  oldValue: string
  newValue: string
}

/**
 * Compute the human-readable list of changes between two audit-log
 * value snapshots (oldValues / newValues stored as JSON).
 */
export function computeChanges(
  oldValues: Record<string, unknown> | null | undefined,
  newValues: Record<string, unknown> | null | undefined
): FieldChange[] {
  const old = oldValues ?? {}
  const nw = newValues ?? {}

  const allFields = new Set([...Object.keys(old), ...Object.keys(nw)])
  const changes: FieldChange[] = []

  for (const field of allFields) {
    if (EXCLUDED_FIELDS.has(field)) continue

    const oldRaw = old[field]
    const newRaw = nw[field]

    // Skip unchanged values (deep equality via JSON)
    if (JSON.stringify(oldRaw) === JSON.stringify(newRaw)) continue

    changes.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      oldValue: formatFieldValue(field, oldRaw),
      newValue: formatFieldValue(field, newRaw),
    })
  }

  return changes
}
