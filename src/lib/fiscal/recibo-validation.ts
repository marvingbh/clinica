import { validateCpf } from "./cpf"
import type {
  PatientFiscalData,
  PaymentEvent,
  ProfessionalFiscalData,
  ReciboBlocker,
  ReciboParty,
  ReciboRow,
} from "./types"

const REFUND_EPSILON = 0.01

/**
 * Resolves the payer party. When the patient has a billing CPF (financial
 * responsible — e.g. a parent), use it; otherwise the patient pays for itself.
 * This is the same source the NFS-e flow uses (billingCpf), NOT PatientUsualPayer.
 */
export function resolvePayer(patient: PatientFiscalData): ReciboParty {
  if (patient.billingCpf && patient.billingCpf.replace(/\D/g, "").length > 0) {
    return {
      cpf: patient.billingCpf,
      name: patient.billingResponsibleName?.trim() || patient.name,
      birthDate: null,
    }
  }
  return { cpf: patient.cpf, name: patient.name, birthDate: patient.birthDate }
}

function resolveBeneficiary(patient: PatientFiscalData): ReciboParty {
  return { cpf: patient.cpf, name: patient.name, birthDate: patient.birthDate }
}

function computeBlockers(
  event: PaymentEvent,
  beneficiary: ReciboParty,
  payer: ReciboParty,
  professional: ProfessionalFiscalData
): ReciboBlocker[] {
  const blockers: ReciboBlocker[] = []

  if (!beneficiary.cpf || !validateCpf(beneficiary.cpf)) blockers.push("BENEFICIARIO_SEM_CPF")
  if (!beneficiary.birthDate) blockers.push("BENEFICIARIO_SEM_NASCIMENTO")
  if (!payer.cpf || !validateCpf(payer.cpf)) blockers.push("PAGADOR_SEM_CPF")
  if (!professional.cpf || !validateCpf(professional.cpf)) blockers.push("PROFISSIONAL_SEM_CPF")
  if (!professional.crp || professional.crp.trim().length === 0) blockers.push("PROFISSIONAL_SEM_CRP")
  if (!event.paymentDate) blockers.push("PAGAMENTO_SEM_DATA")
  if (!(event.amount > 0)) blockers.push("VALOR_INVALIDO")

  return blockers
}

/**
 * Attaches parties + blockers + refund flags to each payment event, producing
 * the rows the UI renders and the export filters. Events whose patient or
 * professional is missing from the maps are skipped (defensive; the caller
 * always provides both for clinic-scoped data).
 */
export function buildReciboRows(
  events: PaymentEvent[],
  patients: Map<string, PatientFiscalData>,
  professionals: Map<string, ProfessionalFiscalData>
): ReciboRow[] {
  const rows: ReciboRow[] = []

  for (const event of events) {
    const patient = patients.get(event.patientId)
    const professional = professionals.get(event.professionalProfileId)
    if (!patient || !professional) continue

    const beneficiary = resolveBeneficiary(patient)
    const payer = resolvePayer(patient)
    const blockers = computeBlockers(event, beneficiary, payer, professional)

    const fullyRefunded = event.refundedAmount >= event.amount - REFUND_EPSILON && event.refundedAmount > 0
    const refundWarning = !fullyRefunded && event.refundedAmount > REFUND_EPSILON

    rows.push({
      ...event,
      beneficiary,
      payer,
      professional,
      blockers,
      refundWarning,
      fullyRefunded,
    })
  }

  return rows
}

/** A row is exportable when it has no blockers and is not fully refunded. */
export function isExportable(row: ReciboRow): boolean {
  return row.blockers.length === 0 && !row.fullyRefunded
}
