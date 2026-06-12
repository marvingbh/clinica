import { formatCpfCnpjDisplay } from "@/lib/intake/format"
import { formatCurrencyBRL } from "@/lib/financeiro/format"
import type {
  DocumentType,
  MergeContext,
  PlaceholderDef,
} from "./types"
import { SESSION_TABLE_TOKEN } from "./types"

const ALL_CLINICAL: DocumentType[] = [
  "RELATORIO_PSICOLOGICO",
  "LAUDO_PSICOLOGICO",
  "PARECER_PSICOLOGICO",
]

/** Format a Date in the given IANA timezone as DD/MM/YYYY (pt-BR). */
export function formatDateInTz(date: Date, timezone: string): string {
  return date.toLocaleDateString("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/** Format a Date in the given IANA timezone as HH:mm (24h, pt-BR). */
export function formatTimeInTz(date: Date, timezone: string): string {
  return date.toLocaleTimeString("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

/** Resolve {{professionalCpfCnpj}}: professional CPF, else clinic CNPJ, formatted. */
export function resolveProfessionalCpfCnpj(ctx: MergeContext): string | null {
  const raw = ctx.professional?.cpf ?? ctx.clinic.cnpj
  if (!raw) return null
  const digits = raw.replace(/\D/g, "")
  if (digits.length !== 11 && digits.length !== 14) return null
  return formatCpfCnpjDisplay(digits)
}

/** Resolve {{guardianName}}: billing responsible → mother → father → null. */
export function resolveGuardianName(ctx: MergeContext): string | null {
  return (
    ctx.patient.billingResponsibleName ||
    ctx.patient.motherName ||
    ctx.patient.fatherName ||
    null
  )
}

function manual(key: string): (ctx: MergeContext) => string | null {
  return (ctx) => {
    const v = ctx.manualFields[key]
    return v && v.trim().length > 0 ? v.trim() : null
  }
}

/**
 * The single placeholder registry. No CID/diagnosis key exists by design —
 * CFP-compliant declarations cannot merge clinical content.
 */
export const PLACEHOLDERS: PlaceholderDef[] = [
  {
    key: "patientName",
    label: "Nome do paciente",
    kind: "auto",
    requiredFor: [
      "DECLARACAO_COMPARECIMENTO",
      "ATESTADO_PSICOLOGICO",
      "RELATORIO_PSICOLOGICO",
      "LAUDO_PSICOLOGICO",
      "PARECER_PSICOLOGICO",
      "ENCAMINHAMENTO",
      "CONTRATO_TERAPEUTICO",
      "RECIBO_REEMBOLSO",
    ],
    missingLabel: "Nome do paciente não cadastrado",
    quickFixPath: null,
    resolve: (ctx) => ctx.patient.name || null,
  },
  {
    key: "patientCpf",
    label: "CPF do paciente",
    kind: "auto",
    requiredFor: ["RECIBO_REEMBOLSO"],
    missingLabel: "CPF do paciente não cadastrado",
    resolve: (ctx) => {
      if (!ctx.patient.cpf) return null
      const digits = ctx.patient.cpf.replace(/\D/g, "")
      if (digits.length !== 11) return null
      return formatCpfCnpjDisplay(digits)
    },
  },
  {
    key: "guardianName",
    label: "Responsável",
    kind: "auto",
    requiredFor: ["CONTRATO_TERAPEUTICO"],
    missingLabel: "Responsável do paciente não cadastrado",
    resolve: resolveGuardianName,
  },
  {
    key: "patientBirthDate",
    label: "Data de nascimento do paciente",
    kind: "auto",
    requiredFor: [],
    resolve: (ctx) =>
      ctx.patient.birthDate ? formatDateInTz(ctx.patient.birthDate, ctx.clinic.timezone) : null,
  },
  {
    key: "appointmentDate",
    label: "Data do atendimento",
    kind: "auto",
    requiredFor: ["DECLARACAO_COMPARECIMENTO"],
    missingLabel: "Nenhum atendimento selecionado",
    resolve: (ctx) =>
      ctx.appointment ? formatDateInTz(ctx.appointment.scheduledAt, ctx.clinic.timezone) : null,
  },
  {
    key: "appointmentStartTime",
    label: "Horário de início",
    kind: "auto",
    requiredFor: ["DECLARACAO_COMPARECIMENTO"],
    missingLabel: "Nenhum atendimento selecionado",
    resolve: (ctx) =>
      ctx.appointment ? formatTimeInTz(ctx.appointment.scheduledAt, ctx.clinic.timezone) : null,
  },
  {
    key: "appointmentEndTime",
    label: "Horário de término",
    kind: "auto",
    requiredFor: ["DECLARACAO_COMPARECIMENTO"],
    missingLabel: "Nenhum atendimento selecionado",
    resolve: (ctx) =>
      ctx.appointment ? formatTimeInTz(ctx.appointment.endAt, ctx.clinic.timezone) : null,
  },
  {
    key: "professionalName",
    label: "Nome do profissional",
    kind: "auto",
    requiredFor: [
      "DECLARACAO_COMPARECIMENTO",
      "ATESTADO_PSICOLOGICO",
      "RELATORIO_PSICOLOGICO",
      "LAUDO_PSICOLOGICO",
      "PARECER_PSICOLOGICO",
      "ENCAMINHAMENTO",
      "RECIBO_REEMBOLSO",
    ],
    missingLabel: "Profissional não informado",
    resolve: (ctx) => ctx.professional?.name || null,
  },
  {
    key: "crp",
    label: "CRP do profissional",
    kind: "auto",
    requiredFor: [
      "DECLARACAO_COMPARECIMENTO",
      "ATESTADO_PSICOLOGICO",
      "RELATORIO_PSICOLOGICO",
      "LAUDO_PSICOLOGICO",
      "PARECER_PSICOLOGICO",
      "ENCAMINHAMENTO",
      "RECIBO_REEMBOLSO",
    ],
    missingLabel: "CRP do profissional não cadastrado",
    quickFixPath: "/profile",
    resolve: (ctx) => ctx.professional?.crp || null,
  },
  {
    key: "professionalCpfCnpj",
    label: "CPF/CNPJ do profissional",
    kind: "auto",
    requiredFor: ["RECIBO_REEMBOLSO"],
    missingLabel: "CPF/CNPJ do profissional ou CNPJ da clínica não cadastrado",
    quickFixPath: "/profile",
    resolve: resolveProfessionalCpfCnpj,
  },
  {
    key: "clinicName",
    label: "Nome da clínica",
    kind: "auto",
    requiredFor: [],
    resolve: (ctx) => ctx.clinic.name || null,
  },
  {
    key: "clinicAddress",
    label: "Endereço da clínica",
    kind: "auto",
    requiredFor: [],
    resolve: (ctx) => ctx.clinic.address || null,
  },
  {
    key: "sessionList",
    label: "Lista de sessões",
    kind: "auto",
    requiredFor: ["RECIBO_REEMBOLSO"],
    missingLabel: "Nenhuma sessão paga encontrada no período selecionado",
    quickFixPath: "/financeiro",
    resolve: (ctx) => (ctx.sessionRows.length > 0 ? SESSION_TABLE_TOKEN : null),
  },
  {
    key: "totalValue",
    label: "Valor total",
    kind: "auto",
    requiredFor: ["RECIBO_REEMBOLSO"],
    missingLabel: "Nenhuma sessão paga encontrada no período selecionado",
    quickFixPath: "/financeiro",
    resolve: (ctx) => {
      if (ctx.sessionRows.length === 0) return null
      const total = ctx.sessionRows.reduce((sum, r) => sum + parseBRL(r.unitPrice), 0)
      return formatCurrencyBRL(total)
    },
  },
  {
    key: "currentDate",
    label: "Data atual",
    kind: "auto",
    requiredFor: [],
    resolve: (ctx) => formatDateInTz(ctx.generatedAt, ctx.clinic.timezone),
  },
  // ---- Manual fields ----
  manualPlaceholder("finalidade", "Finalidade", ["ATESTADO_PSICOLOGICO"]),
  manualPlaceholder("periodoAfastamento", "Período de afastamento", []),
  manualPlaceholder("identificacao", "Identificação", ALL_CLINICAL),
  manualPlaceholder("demanda", "Demanda", ["RELATORIO_PSICOLOGICO", "LAUDO_PSICOLOGICO"]),
  manualPlaceholder("procedimento", "Procedimento", ["RELATORIO_PSICOLOGICO", "LAUDO_PSICOLOGICO"]),
  manualPlaceholder("analise", "Análise", ALL_CLINICAL),
  manualPlaceholder("conclusao", "Conclusão", ALL_CLINICAL),
  manualPlaceholder("exposicaoMotivos", "Exposição de motivos", ["PARECER_PSICOLOGICO"]),
  manualPlaceholder("destinatario", "Destinatário", ["ENCAMINHAMENTO"]),
  manualPlaceholder("motivoEncaminhamento", "Motivo do encaminhamento", ["ENCAMINHAMENTO"]),
  manualPlaceholder("tussCode", "Código TUSS", []),
]

function manualPlaceholder(
  key: string,
  label: string,
  requiredFor: DocumentType[]
): PlaceholderDef {
  return {
    key,
    label,
    kind: "manual",
    requiredFor,
    missingLabel: `Campo "${label}" não preenchido`,
    quickFixPath: null,
    resolve: manual(key),
  }
}

/** Parse a "R$ 1.234,56" string back into a number. */
export function parseBRL(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

const PLACEHOLDER_MAP = new Map(PLACEHOLDERS.map((p) => [p.key, p]))

export function getPlaceholder(key: string): PlaceholderDef | undefined {
  return PLACEHOLDER_MAP.get(key)
}

/**
 * Resolve the requested keys against the context. Unknown keys and keys that
 * resolve to null land in `unresolved`.
 */
export function resolveValues(
  keys: string[],
  ctx: MergeContext
): { values: Record<string, string>; unresolved: string[] } {
  const values: Record<string, string> = {}
  const unresolved: string[] = []
  for (const key of keys) {
    const def = PLACEHOLDER_MAP.get(key)
    if (!def) {
      unresolved.push(key)
      continue
    }
    const v = def.resolve(ctx)
    if (v === null || v === "") {
      unresolved.push(key)
    } else {
      values[key] = v
    }
  }
  return { values, unresolved }
}
