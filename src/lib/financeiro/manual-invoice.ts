/**
 * Pure functions for manual invoice creation.
 */

import type { InvoiceItemData } from "./invoice-generator"

export interface ManualInvoiceAppointment {
  id: string
  scheduledAt: Date
  status: string
  type: string
  title: string | null
  price: number | null
  patientId: string
  clinicId: string
}

interface ValidationInput {
  appointments: ManualInvoiceAppointment[]
  patientId: string
  clinicId: string
}

type ValidationResult =
  | { valid: true; error?: undefined }
  | { valid: false; error: string }

export function validateManualInvoiceInput(input: ValidationInput): ValidationResult {
  if (input.appointments.length === 0) {
    return { valid: false, error: "Selecione pelo menos um appointment" }
  }

  for (const apt of input.appointments) {
    if (apt.patientId !== input.patientId) {
      return { valid: false, error: "Todos os agendamentos devem pertencer ao mesmo paciente" }
    }
    if (apt.clinicId !== input.clinicId) {
      return { valid: false, error: "Todos os agendamentos devem pertencer à mesma clínica" }
    }
  }

  return { valid: true }
}

function formatDateBR(date: Date): string {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  return `${day}/${month}`
}

function getItemType(aptType: string): InvoiceItemData["type"] {
  return aptType === "REUNIAO" ? "REUNIAO_ESCOLA" : "SESSAO_REGULAR"
}

function getDescription(apt: ManualInvoiceAppointment, type: InvoiceItemData["type"]): string {
  const dateStr = formatDateBR(apt.scheduledAt)
  if (type === "REUNIAO_ESCOLA") {
    return `${apt.title || "Reunião escola"} - ${dateStr}`
  }
  return `Sessão - ${dateStr}`
}

export function buildManualInvoiceItems(
  appointments: ManualInvoiceAppointment[],
  sessionFee: number,
): InvoiceItemData[] {
  return appointments.map(apt => {
    const type = getItemType(apt.type)
    const price = apt.price || sessionFee
    return {
      appointmentId: apt.id,
      type,
      description: getDescription(apt, type),
      quantity: 1,
      unitPrice: price,
      total: price,
    }
  })
}
